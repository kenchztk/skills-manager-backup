# 接口与登录态规范（WorkBuddy签到助手）

本文件供 Skill 执行时参考，包含登录态文件格式、签到接口、字段含义、错误码与余额字段候选名。
所有接口均通过本机已登录 WorkBuddy 客户端的 `accessToken` 鉴权，**只读**登录态，绝不修改。

---

## 1. 登录态文件

由 WorkBuddy PC 客户端登录后生成，明文 JSON。

### 路径（按操作系统自动探测）

| 系统 | 路径 |
|------|------|
| Windows | `%LOCALAPPDATA%\CodeBuddyExtension\Data\Public\auth\workbuddy-desktop.info`<br>（旧版可能在 `%APPDATA%` 同路径下） |
| macOS | `~/Library/Application Support/CodeBuddyExtension/Data/Public/auth/workbuddy-desktop.info` |
| Linux | `~/.config/CodeBuddyExtension/Data/Public/auth/workbuddy-desktop.info` |
| 兜底 | `~/.workbuddy/auth/workbuddy-desktop.info` |

脚本探测顺序：Windows 取 `LOCALAPPDATA` / `APPDATA` → macOS 取 `~/Library/Application Support` → Linux 取 `~/.config` → 最后兜底 `~/.workbuddy/auth`。

### 关键字段

```json
{
  "auth": {
    "accessToken": "<JWT>",
    "tokenType": "Bearer",
    "domain": "www.codebuddy.cn",
    "expiresAt": 1735689600000
  }
}
```

- `auth.accessToken`：鉴权令牌（JWT）。**任何输出都不得打印真实值**，脚本仅脱敏为 `eyJhbG...xxxx`。
- `auth.domain`：**接口域名以此为准**。实测值为 `www.codebuddy.cn`。网上文章写 `copilot.tencent.com` 会 404，切勿硬编码。
- `auth.expiresAt`：过期时间（epoch 毫秒/秒）。脚本兼容 13 位毫秒与 10 位秒；为空则跳过过期检查。

---

## 2. 签到接口

基础地址：`https://<auth.domain>/v2`

### 2.1 状态查询（只读）

```
POST /v2/billing/meter/checkin-activity-status
Authorization: Bearer <accessToken>
Content-Type: application/json
```

响应（示例）：

```json
{
  "code": 0,
  "data": {
    "today_checked_in": false,
    "streak_days": 12,
    "daily_credit": 100,
    "total_credit": 1340
  }
}
```

已签到的判定（脚本兼容多种形态）：
- `today_checked_in == true`
- `data.today_checked_in == true`
- `code == "10001"`

### 2.2 领取签到

```
POST /v2/billing/meter/daily-checkin
Authorization: Bearer <accessToken>
Content-Type: application/json
```

成功响应：

```json
{
  "code": 0,
  "credit": 100,
  "streak_days": 13,
  "data": { "credit": 100, "daily_credit": 100 }
}
```

已签到响应（幂等，非错误）：

```json
{
  "code": 10001,
  "msg": "今天已签到，请明天再来"
}
```

---

## 3. 派猫猫旅行接口

基础地址：`https://www.workbuddy.cn`

> **与签到不是同一个域名，且路径不带 `/v2` 前缀**——这是最容易踩的坑。
> 用登录态里的 `auth.domain`（`www.codebuddy.cn`）或误加 `/v2` 都会 404。
> 旅行接口仅需 Bearer Token，**无需** Turing Shield 设备指纹。

### 3.1 旅行状态（只读）

```
GET /activity/growth/buddy/travel/status
Authorization: Bearer <accessToken>
```

响应示例：

```json
{
  "code": 0,
  "data": {
    "state": "idle",
    "location": { "id": 1, "name": "咖啡馆" },
    "reward_credit": 0,
    "arrive_at": 1757500000,
    "server_now": 1757490000,
    "daily_limit_reached": false,
    "record_id": 123
  }
}
```

状态三态：

| `state` | 含义 | 可执行动作 |
|---|---|---|
| `idle` | 空闲 | 未达每日上限时可 `depart` |
| `traveling` | 旅行中 | 无；用 `arrive_at - server_now` 算到达倒计时 |
| `arrived` | 已到达，待领取 | 可 `claim` 领取积分 |

### 3.2 领取旅行积分（写）

```
POST /activity/growth/buddy/travel/claim
Authorization: Bearer <accessToken>
Content-Type: application/json

{}
```

成功：`{"code":0,"data":{"reward_credit":8}}`。
无可领取时服务端返回非 0 码，脚本如实上报、绝不编造结果。

### 3.3 派出 Buddy（写）

```
POST /activity/growth/buddy/travel/depart
Authorization: Bearer <accessToken>
Content-Type: application/json

{"location_id": 1}
```

成功：`{"code":0,"data":{"location":{"id":1,"name":"咖啡馆"},"arrive_at":1757500000}}`。

### 3.4 可选地点（只读）

```
GET /activity/growth/buddy/travel/config
```

返回 `data.locations`（`id` / `name` / `duration_hours_min` / `duration_hours_max` / `reward_credit_min` / `reward_credit_max`）。
实测四个地点为**咖啡馆 / 商场店铺 / 健身房 / 古镇客栈**，时长与积分区间完全相同（随机 1-4 小时、5-10 积分），**收益无差异**，`location_id` 缺省时随机选一个。

### 3.5 派遣前置检查（硬规则）

调用 `depart` 前必须先读 `status` 并同时满足：

1. `state == "idle"`
2. `daily_limit_reached` 为假

任一不满足即跳过派遣，**不发任何写请求**。

---

## 4. 错误码 / 状态码对照

| HTTP | code | 含义 | 脚本处理 |
|------|------|------|----------|
| 200 | 0 | 领取成功 | `action=clicked`，展示积分/连续天数 |
| 400 | 10001 | 当天已签 | `action=skip_already_signed`（幂等跳过，非失败） |
| 非 2xx | — | 网络/服务端错误 | 读取响应体；若含"已签到"仍判为已签，否则 `status=error` |
| — | — | `accessToken` 缺失/过期 | `status=error`，提示重新登录客户端 |

> 脚本对非 2xx 也解析响应体，避免把"已签到 400"误判为异常。
>
> **旅行接口的降级约定**：只读接口（`status` / `config`）失败时置 `travel.available=false` 并静默跳过，
> 绝不改变签到结论；写接口（`claim` / `depart`）返回非 0 码时，把服务端 `msg` 如实记入
> `travel.auto_log`，同样不影响签到状态与退出码。

---

## 5. 积分余额字段候选名

不同版本接口返回的余额字段名不统一，脚本按以下候选名 + 嵌套层级兜底提取，写入结果 `balance` 字段（找不到则返回 None，不影响签到）：

- 候选键：`total_credit` / `total_credit_balance` / `total_points` / `points_balance` / `credit_balance` / `balance` / `remain_credit` / `remain` / `score` / `integral` / `totalCredit` / `pointsBalance` / `balanceCredit`
- 候选层级：`（顶层）` / `data` / `result` / `data.result`

---

## 5. 微信推送接口（可选，密钥仅本地）

仅当用户主动配置 `notify_config.json` 时，才会向以下地址发请求。密钥不进入脚本或技能目录。

| 通道 | 地址 | 形态 |
|------|------|------|
| 企业微信群机器人 | `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=<KEY>` | markdown 消息，发到该群 |
| PushPlus（个人微信） | `https://www.pushplus.plus/send` | `token` + markdown 模板 |
| Bark（iOS） | `https://api.day.app/<KEY>/<title>/<content>` | GET 拼接 |

配置字段与获取方式见同目录下的 `examples.md`（不要在本文件里用加载式引用）。

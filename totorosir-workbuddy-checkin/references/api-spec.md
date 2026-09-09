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

## 3. 错误码 / 状态码对照

| HTTP | code | 含义 | 脚本处理 |
|------|------|------|----------|
| 200 | 0 | 领取成功 | `action=clicked`，展示积分/连续天数 |
| 400 | 10001 | 当天已签 | `action=skip_already_signed`（幂等跳过，非失败） |
| 非 2xx | — | 网络/服务端错误 | 读取响应体；若含"已签到"仍判为已签，否则 `status=error` |
| — | — | `accessToken` 缺失/过期 | `status=error`，提示重新登录客户端 |

> 脚本对非 2xx 也解析响应体，避免把"已签到 400"误判为异常。

---

## 4. 积分余额字段候选名

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

配置字段与获取方式见 `@references/examples.md`。

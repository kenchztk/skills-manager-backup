# 示例与配置（WorkBuddy签到助手）

本文件供 Skill 执行与用户配置参考，包含：自动化提示词、命令示例、微信推送配置、安装/卸载说明。

---

## 1. WorkBuddy 自带自动化提示词

创建 recurring 自动化（`automation_update`，mode=create）时，把下面这段作为自动化 `prompt`：

```
请使用 Bash 工具运行以下命令，完成 WorkBuddy签到助手（每日自动签到 + 派猫猫旅行全自动闭环，接口直签，无需点击 GUI）。
若 `python` 命令不可用，改用 WorkBuddy 自带托管 Python：
%USERPROFILE%/.workbuddy/binaries/python/versions/*/python
python "%USERPROFILE%/.workbuddy/scripts/workbuddy_checkin.py"

执行后，根据脚本输出的 JSON 结果，用一句话向用户汇报：
- action=clicked：签到成功，已领取积分（说明 +N 积分、连续第几天；若结果含 balance 字段则附「当前积分余额：XXX」）。
- action=skip_already_signed：今日已签到，无需重复操作（若含 balance 字段一并告知余额）。
- action=skip_check_only：仅查询完成，汇报今日是否已签与余额。
- action=travel：只跑了派猫猫旅行（未签到），汇报旅行状态即可。
- status=error：如实报告 msg 中的失败原因，不得谎报成功。

再读结果里的 `travel` 字段，补一句派猫猫旅行情况：
- state=traveling：Buddy 正在【location_name】旅行，还需 remaining_text 到达。
- state=arrived：Buddy 已到达，可领 reward_credit 积分（若 auto_log 显示已领取则说明领取结果）。
- state=idle 且 daily_limit_reached=true：今日派遣次数已用完，跳过派遣（正常，不是故障）。
- 若 travel.available=false：旅行接口本次不可用，直接说明「旅行状态未能获取」，不要编造状态。
- auto_log 逐条列出本次实际动作（领取 / 派遣 / 跳过原因），照实转述。

约束：
1. 严禁在任意输出中打印 token / accessToken / refreshToken。
2. 不要无限重试；脚本内部最多重试 1 次即可。
3. 若命令执行失败（status=error），脚本会自动向微信推送失败提醒（前提是已配置 notify_config.json）；你仍需在对话中如实报告失败原因，并提示检查 WorkBuddy 是否已登录、电脑是否联网、是否在 09:00 前后保持开机且客户端未退出。
4. 若微信提醒未收到（如未配置 webhook），不要谎报"已通知"，直接说明"未配置微信提醒，请检查 notify_config.json"。
```

> 把上面的 `<user>` 替换为本机实际用户名。推荐 rrule：`FREQ=DAILY;BYHOUR=9;BYMINUTE=0`（每天 09:00）。

---

## 2. 命令示例

Windows 运行（用正斜杠路径，避免 Git Bash MSYS 把 `/c/` 当相对路径）：

```bash
# --- 日常 ---
python "%USERPROFILE%/.workbuddy/scripts/workbuddy_checkin.py"                  # 签到 + 旅行全自动闭环（默认）
python "%USERPROFILE%/.workbuddy/scripts/workbuddy_checkin.py" --no-travel       # 只签到，跳过旅行（最快）
python "%USERPROFILE%/.workbuddy/scripts/workbuddy_checkin.py" --check-only      # 仅查询（全只读）

# --- 派猫猫旅行 ---
python "%USERPROFILE%/.workbuddy/scripts/workbuddy_checkin.py" travel                 # 只查旅行状态（只读）
python "%USERPROFILE%/.workbuddy/scripts/workbuddy_checkin.py" travel --travel-auto    # 只跑旅行闭环（不签到）
python "%USERPROFILE%/.workbuddy/scripts/workbuddy_checkin.py" --location 3            # 指定派去健身房

# --- 其他 ---
python "%USERPROFILE%/.workbuddy/scripts/workbuddy_checkin.py" --no-notify      # 跳过推送与桌面通知（调试）
python "%USERPROFILE%/.workbuddy/scripts/workbuddy_checkin.py" --diagnose       # 环境自检（只读）
python "%USERPROFILE%/.workbuddy/scripts/workbuddy_checkin.py" --init-config    # 生成配置模板
python "%USERPROFILE%/.workbuddy/scripts/workbuddy_checkin.py" --version        # 显示版本
```

### 真实输出片段（已实测）

`travel`（只读查状态）：

```json
{
  "status": "ok",
  "action": "travel",
  "msg": "派猫猫旅行：空闲（可派遣）",
  "travel": {
    "available": true,
    "state": "idle",
    "state_text": "空闲（可派遣）",
    "location_name": null,
    "reward_credit": 0,
    "daily_limit_reached": true,
    "locations": [
      { "id": 1, "name": "咖啡馆" },
      { "id": 2, "name": "商场店铺" },
      { "id": 3, "name": "健身房" },
      { "id": 4, "name": "古镇客栈" }
    ]
  }
}
```

`travel --travel-auto`（闭环；本次已达每日上限，故只记录跳过原因、未发写请求）：

```json
{
  "msg": "派猫猫旅行：空闲（可派遣），今日派遣次数已用完，跳过派遣",
  "travel": {
    "state": "idle",
    "daily_limit_reached": true,
    "auto_log": ["今日派遣次数已用完，跳过派遣"]
  }
}
```

`--check-only`（签到状态 + 旅行状态合并进同一条消息）：

```json
{
  "action": "skip_check_only",
  "msg": "状态查询成功（未执行领取） ｜ 派猫猫旅行：空闲（可派遣）"
}
```

---

## 3. 微信推送配置

### 3.1 配置文件格式

路径：`%USERPROFILE%\.workbuddy\scripts\notify_config.json`（Windows；macOS / Linux 为 `~/.workbuddy/scripts/notify_config.json`）。不存在则不推送。

```json
{
  "enabled": true,
  "success_notify": false,
  "wecom_webhook": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的群机器人KEY",
  "pushplus_token": "你的PushPlus_token",
  "bark_url": "https://api.day.app/你的KEY/"
}
```

- 三个通道按优先级启用，填了哪个用哪个，可同时填多个。
- `success_notify: true` 时签到成功也推播报；默认 `false` 仅失败时提醒。
- 不想手写？运行 `python workbuddy_checkin.py --init-config` 自动生成 `notify_config.json.example` 模板（也可参考技能包内 `templates/notify_config.json.example`）。
- 密钥只用在本机，**不进脚本、不进本 Skill 目录**，可放心转发技能给他人。

### 3.2 如何获取密钥

| 通道 | 获取方式 |
|------|----------|
| 企业微信群机器人 Webhook | 企业微信群 → 群设置 → 群机器人 → 添加机器人，复制 Webhook URL |
| PushPlus（个人微信） | 注册 https://www.pushplus.plus ，在「一对一推送」拿到 token |
| Bark（iOS） | 安装 Bark App，App 内复制 `https://api.day.app/<KEY>/` |

---

## 4. 安装与卸载

### 安装（用户级）

将本技能目录安装到 `~/.workbuddy/skills/totorosir-workbuddy-checkin/`（Windows 即 `%USERPROFILE%\.workbuddy\skills\totorosir-workbuddy-checkin\`）。

### 卸载 / 暂停

- **暂停每日自动签到**：在 WorkBuddy「自动化」列表把「WorkBuddy签到助手 · 每日自动签到」设为暂停（PAUSED）或删除，不影响脚本本身。
- **卸载本 Skill**：删除技能目录 `~/.workbuddy/skills/totorosir-workbuddy-checkin/`，必要时一并删除脚本副本 `~/.workbuddy/scripts/workbuddy_checkin.py`。
- 彻底移除 = 暂停自动化 + 删除技能目录 + 删除脚本副本，无残留系统服务。

---

## 5. 反模式（不要这样做）

- ❌ 不要用网页版运行签到（仅 PC 客户端支持，网页版无入口）。
- ❌ 不要手动把 `auth.domain` 改成 `copilot.tencent.com` 等域名（脚本自动以本机登录态为准，错误域名会 404）。
- ❌ 不要用签到域名调旅行接口，也不要给旅行路径加 `/v2`（旅行是 `www.workbuddy.cn` 且不带 `/v2`，写错一律 404）。
- ❌ 不要在 `daily_limit_reached` 为真时强行派遣（服务端每日限额，脚本已自动跳过，不要绕过）。
- ❌ 不要调用兑换 / 抽奖等未经验证的写接口（写操作只允许 `daily-checkin`、`travel/claim`、`travel/depart` 三个）。
- ❌ 不要把 `notify_config.json`（含 webhook/token）提交到任何仓库或分享给他人。
- ❌ 不要用 crontab / 系统计划任务替代 WorkBuddy 自带自动化（Skill 场景内）；系统级定时任务请用独立的「WorkBuddy 自动签到分享包」。
- ❌ 不要伪造、猜测或回显 token / accessToken / refreshToken。
- ❌ 不要无限重试（脚本内部最多重试 1 次）。

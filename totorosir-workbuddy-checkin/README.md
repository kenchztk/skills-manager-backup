# WorkBuddy签到助手

> **版本**：2.0.0

把 WorkBuddy「Buddy 加油站」每日签到做成**自动化**（WorkBuddy签到助手）：读取本机已登录的 WorkBuddy 登录态，直接调用官方签到接口完成领取，**无需点击 GUI、无需 OCR、无需第三方依赖**。

- 签到完成后弹出**操作系统级桌面通知**（跨平台：Windows / macOS / Linux），直观展示签到结果与当前积分余额；无桌面会话时自动跳过，不影响签到。
- 新增 **环境自检**（`--diagnose`）与 **配置模板生成**（`--init-config`），降低首次配置门槛。

> 适用对象：希望「每天自动领 Buddy 加油站积分」的 WorkBuddy 用户。安装 WorkBuddy签到助手 后，由 WorkBuddy 自带自动化在每天 09:00 触发；脚本零第三方依赖，仅用 Python 标准库。

## 它能做什么

- 查询今日是否已签到（`--check-only` 只读）。
- 未签到时自动领取（默认 +100 积分，连续签到有额外奖励）。
- 今日已签则幂等跳过，不重复领取。
- 签到后展示**当前积分余额**（若接口返回 balance / total_credit 等字段，结果中含 `balance`）。
- **桌面通知（默认开启）**：每次执行后弹出系统级 toast，展示结果与余额；加 `--no-notify` 可关闭。
- **可选**向微信推送提醒：
  - 签到**失败**时推送（断网 / 未登录 / 登录态失效）——默认开启。
  - 签到**成功**时推送播报——默认关闭，配置 `success_notify: true` 开启。

## 快速开始

1. 安装本 Skill 后，让 WorkBuddy 执行「帮我设置 WorkBuddy 每日自动签到」。
2. Skill 会把脚本落位到 `~/.workbuddy/scripts/workbuddy_checkin.py` 并创建每天 09:00 的自动化。
3. 次日 09:00 自动领取；之后在 Buddy 加油站核对积分 +100。

手动运行（调试用）：

```
python "C:/Users/<user>/.workbuddy/scripts/workbuddy_checkin.py"
python "C:/Users/<user>/.workbuddy/scripts/workbuddy_checkin.py" --check-only   # 仅查询
python "C:/Users/<user>/.workbuddy/scripts/workbuddy_checkin.py" --no-notify     # 跳过所有通知/推送
```

> **Python 环境**：本技能在 WorkBuddy 代理内运行，代理自带 Python，**用户无需额外安装**；若要在 WorkBuddy 之外独立使用系统分享包，安装脚本会自动检测 Python 并提示安装（或直接使用 WorkBuddy 托管 Python `~/.workbuddy/binaries/python`）。

## 「去试试」与即时签到

> 重要：**安装本 Skill 不等于已经签到**，也不会自动建任务。需要你说一句话触发。

- **只签一次（推荐先试这个）**：对 WorkBuddy 说「帮我签到一次」或「现在签个到」→ Skill 直接运行脚本完成本次领取，不创建任何定时任务。适合点「去试试」后立即验证是否可用。
- **设置每日自动签到**：说「帮我设置 WorkBuddy 每日自动签到」→ Skill 把脚本落位到 `~/.workbuddy/scripts/` 并创建每天 09:00 的 recurring 自动化，之后每天自动领。
- 若当天已手动签过，脚本会返回 `skip_already_signed`（幂等跳过），这是正常的，不是失败；返回结果会一并给出当前积分余额（若接口提供）。

## 桌面通知（默认开启）

- 每次执行后都会弹系统通知，展示「签到结果 + 积分余额（若有）」。
- 无需任何配置，开箱即用；受 `--no-notify` 参数一并关闭。
- 跨平台：Windows 气球提示 / macOS 通知中心 / Linux notify-send。
- 注意：无桌面会话（如锁屏、09:00 系统任务未登录、服务器无 GUI）时可能不弹，但 `stdout` 的 JSON 结果与 `checkin.log` 仍会完整记录，不影响签到。

## 配置微信提醒（可选）

新建 `C:\Users\<user>\.workbuddy\scripts\notify_config.json`：

```json
{
  "enabled": true,
  "success_notify": false,
  "wecom_webhook": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的群机器人KEY",
  "pushplus_token": "你的PushPlus_token",
  "bark_url": "https://api.day.app/你的KEY/"
}
```

- 企业微信群机器人 / PushPlus（个人微信）/ Bark（iOS）三选一或都填。
- `success_notify: true` 时，签到成功也会推一条播报；默认 `false` 仅失败时提醒。
- 不想手写？运行 `python workbuddy_checkin.py --init-config` 自动生成 `notify_config.json.example` 模板。
- 密钥只用在本机，**不进脚本、不进本 Skill 目录**，可放心转发给他人。

## 环境自检（--diagnose）

安装后不确定环境是否就绪？运行：

```
python "C:/Users/<user>/.workbuddy/scripts/workbuddy_checkin.py" --diagnose
```

会输出一份 JSON 自检报告，逐项检查（**只读、不触发任何签到请求**）：

| 检查项 | 说明 |
|------|------|
| `python` | 当前 Python 版本是否满足 ≥3.6 |
| `auth` | 登录态文件是否存在、token 是否可用、是否已过期 |
| `network` | 能否解析签到域名 DNS（best-effort） |
| `desktop` | 当前是否有桌面会话（影响通知能否弹出） |
| `notify_config` | 微信推送配置是否存在、是否启用了通道 |

对照报告即可快速定位「为什么签不了」：例如 `auth.found=false` 说明没登录，`network.dns_ok=false` 说明网络不通，`auth.expired=true` 说明要重新登录客户端。

## 常见问题 FAQ

**Q：安装技能后没有 Python 能用吗？**
A：在 WorkBuddy 代理内运行，代理自带托管 Python，用户无需安装。若脱离代理独立使用，脚本会在 Python<3.6 时给出友好提示（不抛堆栈）；也可直接用 `~/.workbuddy/binaries/python`。

**Q：提示「未找到本机登录态文件」怎么办？**
A：说明 WorkBuddy 客户端未登录或登录态路径变更。请先打开 WorkBuddy 客户端登录一次，再运行脚本。

**Q：提示「登录态已过期」怎么办？**
A：客户端登录态失效（如长期未登录、token 过期）。重新打开 WorkBuddy 客户端登录即可刷新；无需重装技能。

**Q：签到成功但没弹桌面通知？**
A：常见于无桌面会话（锁屏、09:00 系统任务未登录、服务器无 GUI）。属预期行为，stdout 与 `checkin.log` 仍有完整记录。加 `--no-notify` 会主动关闭通知。

**Q：怎么关闭桌面通知 / 微信推送？**
A：桌面通知与微信推送均可加 `--no-notify` 一并关闭（调试用）。若要永久关闭微信推送，删除 `notify_config.json` 或将 `enabled` 设为 `false`；要关闭成功播报，将 `success_notify` 设为 `false`。

**Q：定时任务到点没跑？**
A：依次检查：电脑是否开机、WorkBuddy 客户端是否退出、是否联网、09:00 前后是否保持客户端运行。系统级定时任务（计划任务/launchd/cron）还需检查其自身是否启用。

**Q：网页版 WorkBuddy 能用吗？**
A：不能。签到入口仅 PC 客户端专属，网页版无签到接口，脚本也无法在网页版运行。

**Q：`code=10001` / HTTP 400 是失败吗？**
A：不是。这是接口返回的「今天已签到」，属正常幂等跳过，不是错误。

**Q：如何获取微信推送的密钥？**
A：企业微信群机器人 Webhook 在群设置→群机器人添加；PushPlus token 在 pushplus.plus 注册后获取；Bark key 在 iOS Bark App 内获取。详见上方「配置微信提醒」。

**Q：换电脑 / 重装后怎么恢复？**
A：在新机器安装 Skill 并说「帮我设置 WorkBuddy 每日自动签到」即可重建；微信推送密钥需重新填入各自的 `notify_config.json`（不要从旧机拷贝含密钥文件）。

## 反模式（不要这样做）

- ❌ **不要用网页版运行签到**：仅 PC 客户端支持，网页版无入口。
- ❌ **不要手动把 `auth.domain` 改成 `copilot.tencent.com` 等域名**：脚本自动以本机登录态为准，错误域名会 404。
- ❌ **不要把 `notify_config.json`（含 webhook/token）提交到任何仓库或分享给他人**：密钥仅本机使用。
- ❌ **不要用 crontab / 系统计划任务替代 WorkBuddy 自带自动化**（在 Skill 场景内）：脱离客户端可能拿不到登录态；系统级定时任务请用独立的「WorkBuddy 自动签到分享包」。
- ❌ **不要伪造、猜测或回显 token / accessToken / refreshToken**：脚本已脱敏，代理也不要打印凭据。
- ❌ **不要无限重试**：脚本内部最多重试 1 次，足够应对瞬时网络抖动。

## 排错速查

| 现象 | 含义 / 处理 |
|------|------|
| `HTTP 400 / code=10001` | 当天已签，属正常 |
| `未找到本机登录态文件` | 请先在 WorkBuddy 客户端登录 |
| `登录态已过期` | 重新登录客户端刷新 token |
| `HTTP 404` | 域名错误，脚本会自动用本机 `auth.domain`，无需手动改 |
| 自动化没跑 | 检查开机 / 客户端退出 / 联网 |
| 桌面通知不弹 | 无桌面会话，属预期，不影响签到 |

## 安全说明

- 脚本**只读**本机 WorkBuddy 登录态中的 `accessToken`，绝不修改、不删除、不外传。
- 任何输出都**不含真实 token**（仅脱敏 `eyJhbG...xxxx`）。
- 只请求 `www.codebuddy.cn`（以本机 `auth.domain` 为准）；仅当你主动配置了微信通道，才会向你填写的微信地址发请求。

## 隐私与共享

- 本 Skill 不含任何个人凭据，可放心分享给他人安装使用。
- 各机器互不影响：每人用各自的登录态与各自的微信密钥。

## 关闭 / 卸载

- **暂停每日自动签到**：在 WorkBuddy 的「自动化」列表里，把「WorkBuddy签到助手 · 每日自动签到」设为暂停（PAUSED）或删除即可，不影响脚本本身。
- **卸载本 Skill**：直接删除技能目录 `~/.workbuddy/skills/totorosir-workbuddy-checkin/`（Windows 示例：`C:\Users\<user>\workbuddy\skills\totorosir-workbuddy-checkin\`）。脚本副本 `~/.workbuddy/scripts/workbuddy_checkin.py` 可一并删除，不影响其他功能。
- **彻底停止并清理**：暂停自动化 + 删除技能目录 + 删除脚本副本，即完全移除本能力，无残留系统服务。

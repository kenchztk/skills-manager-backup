# 示例与配置（WorkBuddy签到助手）

本文件供 Skill 执行与用户配置参考，包含：自动化提示词、命令示例、微信推送配置、安装/卸载说明。

---

## 1. WorkBuddy 自带自动化提示词

创建 recurring 自动化（`automation_update`，mode=create）时，把下面这段作为自动化 `prompt`：

```
请使用 Bash 工具运行以下命令，完成 WorkBuddy签到助手（每日自动签到，接口直签，无需点击 GUI）。
若 `python` 命令不可用，改用 WorkBuddy 自带托管 Python：
C:/Users/<user>/.workbuddy/binaries/python/versions/*/python
python "C:/Users/<user>/.workbuddy/scripts/workbuddy_checkin.py"

执行后，根据脚本输出的 JSON 结果，用一句话向用户汇报：
- action=clicked：签到成功，已领取积分（说明 +N 积分、连续第几天；若结果含 balance 字段则附「当前积分余额：XXX」）。
- action=skip_already_signed：今日已签到，无需重复操作（若含 balance 字段一并告知余额）。
- action=skip_check_only：仅查询完成，汇报今日是否已签与余额。
- status=error：如实报告 msg 中的失败原因，不得谎报成功。

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
python "C:/Users/<user>/.workbuddy/scripts/workbuddy_checkin.py"            # 查询 + 必要时领取
python "C:/Users/<user>/.workbuddy/scripts/workbuddy_checkin.py" --check-only   # 仅查询（只读）
python "C:/Users/<user>/.workbuddy/scripts/workbuddy_checkin.py" --no-notify    # 跳过推送与桌面通知（调试）
python "C:/Users/<user>/.workbuddy/scripts/workbuddy_checkin.py" --diagnose     # 环境自检（只读）
python "C:/Users/<user>/.workbuddy/scripts/workbuddy_checkin.py" --init-config  # 生成配置模板
python "C:/Users/<user>/.workbuddy/scripts/workbuddy_checkin.py" --version      # 显示版本
```

---

## 3. 微信推送配置

### 3.1 配置文件格式

路径：`C:\Users\<user>\.workbuddy\scripts\notify_config.json`（不存在则不推送）。

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

将本技能目录安装到 `~/.workbuddy/skills/totorosir-workbuddy-checkin/`（Windows 示例：`C:\Users\<user>\.workbuddy\skills\totorosir-workbuddy-checkin\`）。

### 卸载 / 暂停

- **暂停每日自动签到**：在 WorkBuddy「自动化」列表把「WorkBuddy签到助手 · 每日自动签到」设为暂停（PAUSED）或删除，不影响脚本本身。
- **卸载本 Skill**：删除技能目录 `~/.workbuddy/skills/totorosir-workbuddy-checkin/`，必要时一并删除脚本副本 `~/.workbuddy/scripts/workbuddy_checkin.py`。
- 彻底移除 = 暂停自动化 + 删除技能目录 + 删除脚本副本，无残留系统服务。

---

## 5. 反模式（不要这样做）

- ❌ 不要用网页版运行签到（仅 PC 客户端支持，网页版无入口）。
- ❌ 不要手动把 `auth.domain` 改成 `copilot.tencent.com` 等域名（脚本自动以本机登录态为准，错误域名会 404）。
- ❌ 不要把 `notify_config.json`（含 webhook/token）提交到任何仓库或分享给他人。
- ❌ 不要用 crontab / 系统计划任务替代 WorkBuddy 自带自动化（Skill 场景内）；系统级定时任务请用独立的「WorkBuddy 自动签到分享包」。
- ❌ 不要伪造、猜测或回显 token / accessToken / refreshToken。
- ❌ 不要无限重试（脚本内部最多重试 1 次）。

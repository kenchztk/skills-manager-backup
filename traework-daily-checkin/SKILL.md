---
name: "traework-daily-checkin"
description: "自动完成 TraeWork CN 每日签到领取积分。当用户需要设置每日自动签到、手动触发签到或查看签到状态时调用。"
---

# TraeWork每日自动签到

## 功能概述

本技能用于自动完成 TraeWork CN 的每日签到任务。通过读取本机已登录的 TraeWork 登录态，解密后调用官方签到 API 完成积分领取，无需手动打开客户端点击签到。

## 技术原理

1. 从本机 `storage.json` 读取加密的登录态 `iCubeAuthInfo://icube.cloudide`
   - macOS：`~/Library/Application Support/TRAE SOLO CN/User/globalStorage/storage.json`
   - Windows：`%APPDATA%\TRAE SOLO CN\User\globalStorage\storage.json`
2. 使用 AES-128-CBC 算法解密获取 accessToken（SHA-512 密钥派生 + HMAC 校验）
3. 读取本机设备 ID（`ahanet/tt_net_config.config`，回退客户端日志），作为 `x-device-id` 请求头
4. 调用 `POST https://api.trae.cn/trae/api/v2/ug/checkin_credits/status` 检查签到状态
5. 若未签到，调用 `POST https://api.trae.cn/trae/api/v2/ug/checkin_credits/claim` 领取积分

> 请求体必须携带 `{"req_source": 1}`（1=Trae CN IDE）。缺少该字段时领取接口会返回
> `code 9004 / The submitted order parameters are incorrect`，无法签到成功。

## 使用方式

### 方式一：手动执行

macOS：

```bash
bash ~/.trae-cn/skills/traework-daily-checkin/run_checkin.sh
```

或直接运行核心脚本（需 Node 18+，脚本使用全局 `fetch` 与 `crypto.subtle`）：

```bash
node ~/.trae-cn/skills/traework-daily-checkin/checkin.js
```

Windows：双击 `run_checkin.cmd`，或在命令行中运行 `run_checkin.cmd`。

输出说明：
- `Already checked in today. Credits: XXX` — 当日已签到
- `Check-in successful! Credits: XXX` — 签到成功
- `Check-in is not enabled` — 签到功能不可用
- `ERROR: ...` — 登录态缺失或过期，需重新登录 TRAE SOLO CN

### 方式二：TRAE 定时任务（推荐）

在 TRAE 中创建定时任务：

- Cron 表达式：`0 8 * * *`（每天早上 8:00 执行）
- 时区：`Asia/Shanghai`
- 任务内容：执行 `run_checkin.sh` 脚本完成签到

### 方式三：系统计划任务

macOS（launchd）或 Windows（任务计划程序）：

```cmd
schtasks /create /tn "TraeWork签到" /tr "路径\run_checkin.cmd" /sc daily /st 08:00
```

## 前置条件

1. 已安装 TRAE SOLO CN 并完成登录
2. 运行环境存在 Node 18+（脚本依赖全局 `fetch`）
   - macOS：优先使用 PATH 中的 `node`，其次 `/opt/homebrew/bin/node`，最后回退到 Trae 自带 Electron 二进制
   - Windows：使用 `run_checkin.cmd` 顶部 `TRAE_EXE` 指定的 TRAE SOLO CN 可执行文件
3. 登录态未过期（如过期需重新打开 TRAE SOLO CN 登录）

## 文件说明

| 文件 | 说明 |
|------|------|
| `SKILL.md` | 技能描述与使用说明（本文件） |
| `checkin.js` | 签到核心脚本（读取登录态 → 解密 → 调用签到 API），跨平台 |
| `run_checkin.sh` | macOS / Linux 执行入口 |
| `run_checkin.cmd` | Windows 批处理执行入口 |

## 配置说明

`checkin.js` 会自动定位登录态文件：存在 `APPDATA` 环境变量时使用 Windows 路径，否则使用 macOS 的 `~/Library/Application Support/TRAE SOLO CN/...` 路径。

Windows 下如需修改 TRAE SOLO CN 安装路径，编辑 `run_checkin.cmd` 中的 `TRAE_EXE` 变量：

```cmd
set "TRAE_EXE=你的安装路径\TRAE SOLO CN.exe"
```

## 安全约束

- 只读登录态文件，不修改任何文件
- 不打印或输出 token 值
- 仅访问官方域名 `api.trae.cn`，无第三方上报
- 登录态过期时需要用户手动重新登录，技能不做自动刷新
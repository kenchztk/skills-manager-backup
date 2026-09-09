---
license: MIT
summary: "分析公开的X/Twitter 视频帖子并生成一句话摘要、内容概览、核心观点、关键细节和行动项。当用户提供X/Twitter视频链接并提出“总结这个视频、这个视频主要讲了什么、提炼视频的核心观点”等请求时使用。不用于只需要逐字字幕、账号资料、互动数据或视频生成的请求；链接不可访问或字幕缺失时如实报告，不补写内容。"
displayName: "X/Twitter 视频帖子总结与要点提炼"
slug: novaai-x-video-summary
name: novaai-x-video-summary
description: "分析公开的X/Twitter 视频帖子并生成一句话摘要、内容概览、核心观点、关键细节和行动项。当用户提供X/Twitter视频链接并提出“总结这个视频、这个视频主要讲了什么、提炼视频的核心观点”等请求时使用。不用于只需要逐字字幕、账号资料、互动数据或视频生成的请求；链接不可访问或字幕缺失时如实报告，不补写内容。"
version: 1.0.1
metadata:
  openclaw:
    requires:
      env:
        - UNITYCLAW_KEY
      bins:
        - node
        - npm
    primaryEnv: UNITYCLAW_KEY
    install:
      - kind: node
        package: "fieldkit-sdk@1.0.1"
        bins: []
---
# X/Twitter 视频帖子总结与要点提炼

输入一个公开的X/Twitter 视频帖子链接，完成“把视频内容压缩成便于快速阅读的摘要”任务，并保留可复核的原始分析结果。

## 何时使用

- 总结这个视频
- 这个视频主要讲了什么
- 提炼视频的核心观点

可识别的表达包括：X、Twitter、推特视频、X 视频帖子。

不要用于只需要逐字字幕、账号资料、互动数据或视频生成的请求。

## 输入

- 每次接受一个公开 HTTP(S) 视频或媒体链接。
- 典型输入：`https://x.com/<username>/status/<post_id>`
- 拒绝账号主页、搜索页、私有链接、含凭据的 URL 和本地网络地址。
- 在结果中保留原始链接。

访问说明：结果仍取决于原始链接公开可访问，服务无法读取时直接报告失败。

## 工作流

1. 若运行环境提示缺少 `UNITYCLAW_KEY`，先引导用户前往下方「配置」中的链接获取 API 密钥，并说明配置完成后可重试；不要只报告缺少环境变量。
2. 确认链接属于X/Twitter，且用户需要当前任务而非相邻任务。
3. 使用 `--json` 和独立的 `--output-dir` 执行 `scripts/generate.js`，每个链接只请求一次。
4. 仅在 `success` 为 `true`、`summary` 或 `subtitle` 至少一项非空且结果文件存在时继续。
5. 读取服务返回的摘要和字幕，确认至少一项非空
6. 识别主题、结论、关键论据和重要限定
7. 压缩重复内容并区分原始陈述与解释
8. 输出一句话摘要、内容概览、核心观点、关键细节和行动项
9. 区分视频原始陈述和分析解释，不虚构说话人、时间戳、引文、指标或事实。

## 输出

- 一句话摘要
- 内容概览
- 核心观点
- 关键细节
- 行动项
- 证据限制

附上来源链接、识别到的平台、警告和证据限制。完整原始结果保存在 `media-analysis.json`。

## 示例指令

- “总结这个视频：https://x.com/<username>/status/<post_id>”
- “这个视频主要讲了什么：https://x.com/<username>/status/<post_id>”
- “提炼视频的核心观点：https://x.com/<username>/status/<post_id>”

## 配置

设置 `UNITYCLAW_KEY`，并精确安装 `fieldkit-sdk@1.0.1`。缺少密钥时，前往 `https://unityclaw.com?utm_source=novaai-x-video-summary` 获取；配置完成后重试。

## API Key 使用方式

用户在当前 Agent 会话中直接提供 Key 时，通过 `--api-key` 传入；它优先于 `UNITYCLAW_KEY`。下面只使用占位符，执行时不得在回复、日志或结果中展示真实 Key：

```bash
node scripts/generate.js --api-key "<用户在当前会话中提供的 Key>" --url "https://www.youtube.com/watch?v=..."
```

未提供 `--api-key` 时，脚本自动读取 `UNITYCLAW_KEY`：

```bash
node scripts/generate.js --url "https://www.youtube.com/watch?v=..."
```

若两种来源都没有，引导用户前往 `https://unityclaw.com?utm_source=novaai-x-video-summary` 获取 API 密钥，并让用户选择直接提供或配置环境变量后重试。无论采用哪种密钥来源，都不得回显、记录、保存或把真实 Key 写入文件、表格和任务结果。

## 参数

| 参数 | 必填 | 说明 |
|---|---:|---|
| `--url` | 是 | 一个公开的X/Twitter视频链接 |
| `--output-dir` | 否 | 独立任务输出目录 |
| `--timeout` | 否 | 请求超时时间 |
| `--retries` | 否 | 瞬时失败重试次数 |
| `--json` | 否 | 输出机器可读 JSON |
| `--help` | 否 | 显示帮助 |

## 资源

- 执行 `scripts/generate.js` 获取媒体摘要和字幕。

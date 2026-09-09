---
name: yichen-wechat-local-vault
description: |
  微信 Mac 4.x 本地数据库全量/增量解析与数字资产库。用于本机微信聊天记录、联系人、群聊、朋友圈、收藏夹、语音/附件索引的密钥提取、全量解密、增量刷新、指定联系人/群聊导出、关系复盘、客户跟进和内容沉淀。触发词：微信解析、微信全量、微信增量、聊天记录、导出聊天、朋友圈解析、收藏夹解析、客户跟进、yichen-wechat-local-vault。
---

# 微信本地解析 Vault

这个 skill 的定位是“微信本地数字资产库 + 本地查询分析台”。默认只读取本机数据库和本地进程，不点击微信界面；除非用户明确允许，不操作微信 UI。默认只处理官方第一个微信容器 `com.tencent.xinWeChat`，不要处理双开/第二微信容器。

本版本吸收了两类外部工具的优点：

- WeChat CLI 风格：统一命令入口、JSON 默认输出、最近会话、历史记录、全局搜索、联系人详情、群成员、统计、导出、收藏夹、未读和增量新消息。
- 宝玉群聊摘要工作流：按群归档、从上次摘要继续、摘要素材包、群友画像目录、历史索引、图片说明扩展点，以及“大批量先落文件再分析”的安全习惯。

## 隐私边界

- 不在回复或日志里输出 key、完整 salt、wxid、原始聊天库内容，除非用户明确要求展示。
- 密钥、配置、明文库、manifest、增量状态和导出目录都由本机配置文件管理；skill 文档不要写入任何个人机器的真实绝对路径、wxid、联系人或聊天内容。
- 建议把密钥和明文库放在本机私有应用数据目录，把可读报告放在用户自选的导出目录；路径以占位符或配置字段说明即可。
- 不要把明文数据库复制到项目工作区、桌面、网盘目录或聊天回复里；工作区只放用户明确要求的导出报告。

## 自动选择模式

根据用户指令选最小必要动作：

1. 用户说“第一次用、解不开、key 没了、全部解密、全量重建”：走全量路线。
2. 用户说“继续、更新一下、增量、最近、今天、新消息”：走增量路线。
3. 用户点名联系人/群聊/会话 ID：只导出这一条会话；必要时先增量解密消息库。
4. 用户给时间范围：只按该时间范围导出或分析。
5. 用户问朋友圈/收藏夹：只读取对应已解密库；缺 key 再补抓。
6. 用户明确说“群聊摘要、群聊精华、日报、复盘、从上次继续”时，优先用 `vault_cli.py digest-source` 生成素材包，再基于素材写简报；不要把整个 skill 解释成摘要工具。
7. 用户要求不操作微信界面时，只能使用 `--match-only`、已保存 key、已解密库或本地数据库文件；不要启动 Computer Use。

## 统一查询入口

日常查询优先使用 `scripts/vault_cli.py`。它只读已解密 vault，不抓 key、不碰微信 UI。

```bash
python3 {{SKILL_DIR}}/scripts/vault_cli.py status --format text
python3 {{SKILL_DIR}}/scripts/vault_cli.py sessions --limit 20 --format text
python3 {{SKILL_DIR}}/scripts/vault_cli.py unread --format text
python3 {{SKILL_DIR}}/scripts/vault_cli.py new-messages --format text
python3 {{SKILL_DIR}}/scripts/vault_cli.py contacts --query "关键词" --format text
python3 {{SKILL_DIR}}/scripts/vault_cli.py members "群名" --format text
python3 {{SKILL_DIR}}/scripts/vault_cli.py history "联系人或群名" --start-time "2026-05-01" --end-time "2026-05-14" --format text
python3 {{SKILL_DIR}}/scripts/vault_cli.py search "关键词" --chat "群名" --type link --format text
python3 {{SKILL_DIR}}/scripts/vault_cli.py stats "群名" --start-time "2026-05-01" --format text
python3 {{SKILL_DIR}}/scripts/vault_cli.py export "群名" --format markdown --output ./chat.md
python3 {{SKILL_DIR}}/scripts/vault_cli.py favorites --type article --query "关键词" --format text
python3 {{SKILL_DIR}}/scripts/vault_cli.py moments --name "联系人" --start "2026-05-01" --format text
```

把收藏里的所有文章逐篇导出为独立 Markdown 文件（需先解密 `favorite.db`）。

默认 **增量模式**：只导出输出目录里还没有对应文件的收藏，已存在的会跳过——所以“下次同样操作”只会补新增的，不会重复写、也不会覆盖你手动改过的 md。需要整库重建时用 `--mode full`（会覆盖重导全部 type=5）。

**favid 注册表（增量基准，独立于 md 内容）**：每次导出都会在输出目录写入一个隐藏文件 `.favid-registry.json`，记录全部已导出收藏的 `favid`（收藏项 ID）→ 标题/文件名/链接/收藏时间的映射。增量时**优先读这个注册表**判断哪些是新的，而不是依赖 md 里的 `favid` 字段。因此即使你把文章链接替换成真实网页正文、或者手动删掉了 md 里的 `favid`，下次增量仍然正确跳过、不会重导或覆盖。**请保留 `.favid-registry.json` 不要删除**（误删会回退到扫描 md frontmatter；若那时 md 也没有 favid，则会触发全量重导）。

脚本支持 `--registry <path>` 显式指定注册表位置：用它可以把新收藏导出到**别的目录**（例如按日期命名的子目录），而让注册表仍留在主目录、作为全集的唯一基准——新文件注册为 `2026-09-03/某文章.md` 这样的相对路径，一份注册表能索引分散在多个子目录的 md。

```bash
# 增量（默认）：先增量刷新解密库，再只补导新收藏
python3 {{SKILL_DIR}}/scripts/decrypt_all_dbs.py --mode incremental
python3 {{SKILL_DIR}}/scripts/export_favorite_articles.py \
  --mode incremental \
  --db ~/Library/Application\ Support/wechat-local-vault/decrypted/current/favorite/favorite.db \
  --out ./微信收藏-文章

# 增量导出到“今天日期”子目录，注册表仍更新主目录那份（单一基准）
TODAY=$(date +%Y-%m-%d)
python3 {{SKILL_DIR}}/scripts/export_favorite_articles.py \
  --mode incremental \
  --db ~/Library/Application\ Support/wechat-local-vault/decrypted/current/favorite/favorite.db \
  --out "./微信收藏-文章/$TODAY" \
  --registry "./微信收藏-文章/.favid-registry.json"

# 全量重建：覆盖重导全部 type=5 文章收藏
python3 {{SKILL_DIR}}/scripts/export_favorite_articles.py \
  --mode full \
  --db ~/Library/Application\ Support/wechat-local-vault/decrypted/current/favorite/favorite.db \
  --out ./微信收藏-文章
```

注意：微信收藏的文章（type=5）本地只存元数据（标题、摘要、原文链接、来源、时间、标签），**不存正文 HTML**，因此每篇 md 以原文链接形式保留，正文需联网在微信/浏览器中打开。

消息类型过滤支持：`text`、`image`、`voice`、`video`、`sticker`、`location`、`link`、`file`、`call`、`system`。

### 群聊摘要素材包

用户要“群聊精华、日报、总结群聊、看看这个群最近聊了什么、从上次继续”时：

```bash
python3 {{SKILL_DIR}}/scripts/vault_cli.py digest-source "群名" --start "2026-05-01" --end "2026-05-14" --format text
python3 {{SKILL_DIR}}/scripts/vault_cli.py digest-source "群名" --since-last --data-root ~/Documents/wechat-digests --format text
```

输出会落到 `{data_root}/{group_id}-{group_name}/sources/`，并创建：

- `profiles/`：普通版群友画像。
- `profiles-roast/`：毒舌版画像，必须和普通版分开。
- `imgs/`：图片说明扩展点，格式为 `{message_id}.txt`，一行描述一张图。
- `sources/*.json`：可机器读取的消息素材、发言统计和路径信息。
- `sources/*.md`：便于人工阅读和写作的素材稿。

素材包不自动更新 `history.json`。只有最终摘要写完并确认后，才更新摘要历史，避免半成品污染“从上次继续”的锚点。

## 常用命令

查看本机有哪些库，不启动微信：

```bash
python3 {{SKILL_DIR}}/scripts/extract_keys.py --list-dbs
```

用已有抓取日志匹配 key，不启动微信：

```bash
python3 {{SKILL_DIR}}/scripts/extract_keys.py --match-only --targets all --reuse-log
```

首次全量抓 key。只在需要抓新 key 时使用；不要碰第二微信：

```bash
python3 {{SKILL_DIR}}/scripts/extract_keys.py --targets all --duration 240
```

全量解密到私密 vault：

```bash
python3 {{SKILL_DIR}}/scripts/decrypt_all_dbs.py --mode full
```

日常增量刷新。只跳过未变化的库，不重新处理全部内容：

```bash
python3 {{SKILL_DIR}}/scripts/decrypt_all_dbs.py --mode incremental
```

导出某个联系人完整聊天：

```bash
python3 {{SKILL_DIR}}/scripts/export_chat.py --contact "联系人备注" --mode full
```

导出某个联系人新增聊天：

```bash
python3 {{SKILL_DIR}}/scripts/export_chat.py --contact "联系人备注" --mode incremental
```

按精确会话 ID 和时间范围导出：

```bash
python3 {{SKILL_DIR}}/scripts/export_chat.py --chat-id "contact_username" --since "2025-01-01"
```

旧脚本仍可用于窄任务；如果用户没有特别指定，优先使用 `vault_cli.py`。

## 工作流

### 全量路线

用于首次配置、换设备、微信升级后 key 变化、用户明确要求全量重建。

1. 先运行 `extract_keys.py --list-dbs` 看本地库，不展示敏感 salt。
2. 如果 `~/.config/wechat-keys.json` 已有 key，先用 `--match-only --targets all --reuse-log` 尝试复用。
3. 只有复用失败或缺关键库时，才运行抓 key。
4. 运行 `decrypt_all_dbs.py --mode full`，明文库写入私密 vault。
5. 读取 manifest 确认解密数量和失败项。

### 增量路线

用于日常更新、继续上次工作、只分析近期新增内容。

1. 运行 `decrypt_all_dbs.py --mode incremental`。
2. 如果目标是联系人/群聊，运行 `export_chat.py --mode incremental`。
3. 如果没有新增消息，直接告诉用户没有新增内容。
4. 增量状态只写入 vault 的 `state` 目录，不写进 skill 文档。

### 指定会话分析

用于“分析我和某某的聊天”“导出这个会话 ID”“帮我写下一条怎么回”。

1. 若用户给的是备注/昵称，使用 `export_chat.py --contact`。
2. 若用户给的是微信 userName 或会话 ID，使用 `export_chat.py --chat-id`。
3. 导出后读取报告，按用户目标分析关系、语气、风险、下一步话术。
4. 不要默认展示全部原文；用户要“仔细解析”时再给完整时间线或报告路径。

### 朋友圈/收藏夹解析

优先使用已解密的 `sns/sns.db`、`favorite/favorite.db`、`message_resource.db`。缺 key 时只补相关库，不全量抓取。输出到用户配置的导出目录。

### 群聊精华/日报路线

1. 先运行增量解密，确保明文 vault 是最新的。
2. 用 `vault_cli.py contacts` 或 `sessions` 解析群名，确认唯一群聊。
3. 用 `digest-source` 按时间范围生成素材包；大群或长时间范围先落文件，不要把几百上千条原始消息直接塞进对话。
4. 读取 `sources/*.md` 和必要的 `sources/*.json`，先列话题骨架，再写正文。
5. 输出结构优先采用：标题、消息统计、发言排行、开篇概览、群友画像、分类正文、待解决问题、固定结尾。
6. 需要毒舌版时，可以基于同一素材另写，但不得做人身攻击、健康/家庭/身份属性推断，也不得用时间戳推断作息或所在地。
7. 图片内容默认不可见；如果 `imgs/{message_id}.txt` 存在，才把其中描述用于摘要。否则只能写“图片内容不可见，根据上下文推断到这里围绕一张图片讨论”，不要编造画面。
8. 摘要确认完成后，再更新群目录下的 `history.json` 和 `history-digests.jsonl`；用户要求“从上次继续”依赖这些文件。

## 输出原则

- 回复里优先给结论、文件路径、下一步建议；完整原文放 Markdown 文件。
- 涉及私聊时，少量引用必要原文即可，避免把整库内容贴到聊天里。
- 明确区分“已解密明文库”“可读导出报告”“密钥配置”。
- 每次涉及解密完成，说明保存位置和是否包含明文隐私。

## 现有脚本

- `scripts/vault_cli.py`：统一本地查询入口；吸收 WeChat CLI 的常用命令形态，并增加朋友圈与摘要素材包。
- `scripts/extract_keys.py`：本机 key 捕获、复用和匹配。
- `scripts/decrypt_all_dbs.py`：全量/增量解密，写入私密 vault，并生成 manifest。
- `scripts/export_chat.py`：按联系人、群聊或会话 ID 导出完整/增量聊天记录。
- `scripts/export_favorite_articles.py`：把 `favorite.db` 中 type=5 文章收藏逐篇导出为独立 Markdown 文件（仅含本地元数据：标题/摘要/原文链接/来源/时间/标签；微信不存正文，正文需联网打开）。
- `scripts/list_contacts.py`：列出联系人和群聊。
- `scripts/wechat_digest.py`：按天摘要脚本，仅在用户明确要摘要时使用。
- `scripts/search_sns.py`：朋友圈搜索辅助。

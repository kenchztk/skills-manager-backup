---
name: wx-article-md-fill
description: 批量为"微信收藏"导出的占位 md 填充真实文章正文。读取每个 md frontmatter 的 url，抓取网页（微信/通用），提取正文转 Markdown 并替换占位内容，保留 frontmatter。适用于"微信收藏-文章"类导出目录的二次填充。
---

# 微信收藏文章正文填充

## 适用场景
用户已有一批从微信收藏导出的 md 文件：frontmatter 含 `url`，正文仅为占位（标题 + `**原文链接：**[url](url)` + 收藏时间行）。需要逐一抓取 url 对应网页，把正文提取为 Markdown 并替换占位内容。

## 关键要点（踩坑经验）
- 微信文章 `mp.weixin.qq.com/s?...` 必须：`curl -L`（跟随重定向）+ `--compressed` + 移动端 Safari UA，否则返回"未知错误"页。
- 正文容器：`div#js_content`（或 `div.rich_media_content`）。用 bs4 优先匹配这两个选择器，失败再回退 `body`。
- 图片防盗链：真实地址在 `img` 的 `data-src`（不是 `src`），提取前把 `data-src` 拷贝到 `src`。
- 转 MD 用 `markdownify`（`heading_style="ATX"`），并用 `re.sub(r"\n{3,}", "\n\n")` 清理多余空行。
- 重跑安全（幂等/断点续跑）：占位文件含 `**原文链接` 字样；已处理文件的 footer 用 `> 原文链接：`（非粗体），所以"若 `**原文链接` 不在文本中则跳过"可做守卫，避免重复抓取/覆盖。
- 失败多为预期情况，保留原占位即可：微信已删除/过期文章（返回页无 `js_content`/`rich_media_content`）、`search.weixin.qq.com/cgi-bin/recweb/clientjump` 等跳转页、朋友圈/事件类收藏（无 url，如"可以吃的金拱门"）。
- 大批量（上千文件）用 `ThreadPoolExecutor` 并发（4–5 workers），运行前先 `cp -r` 整目录备份以防覆盖出错。

## 用法
```bash
# 依赖（隔离 venv）
pip install beautifulsoup4 lxml markdownify html2text
# 单目录批量（并发 5，进度写入 report，可重复运行=断点续跑）
python3 scripts/wx_extract.py --dir "<dir>" --workers 5 --report /tmp/wx_report.txt
# 生成汇总（成功/失败/跳过统计 + 失败清单）
python3 scripts/wx_summary.py /tmp/wx_report.txt /tmp/wx_summary.md
```

## 依赖
Python3 + bs4 + lxml + markdownify；网页抓取复用系统 `curl`。

## 注意
- 仅替换正文、保留 YAML frontmatter（title/url/collected_at/source_wxid/favid 等元数据不丢）。
- 微信图片 URL（mmbiz.qpic.cn）有防盗链，离线/无网时 Obsidian 中不会显示，但链接已保留，联网即可加载。

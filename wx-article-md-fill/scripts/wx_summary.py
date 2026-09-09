#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Read the incremental report produced by wx_extract.py and emit a summary."""
import sys, re, collections

report = sys.argv[1] if len(sys.argv) > 1 else "/tmp/wx_full_report.txt"
out = sys.argv[2] if len(sys.argv) > 2 else "/tmp/wx_summary.md"

ok = fail = skip = 0
fails = []  # (name, reason)
with open(report, encoding="utf-8") as f:
    for line in f:
        line = line.rstrip("\n")
        if line.startswith("[OK]"):
            ok += 1
        elif line.startswith("[SKIP]"):
            skip += 1
        elif line.startswith("[FAIL]"):
            fail += 1
            m = re.match(r"\[FAIL\]\s*(.*?)\s*::\s*(.*)$", line)
            if m:
                fails.append((m.group(1), m.group(2)))

total = ok + fail + skip
# group failure reasons
reasons = collections.Counter(r for _, r in fails)

lines = []
lines.append("# 微信公众号文章提取 · 汇总报告")
lines.append("")
lines.append(f"- 处理总数：**{total}**")
lines.append(f"- 成功提取（已替换正文）：**{ok}**")
lines.append(f"- 跳过（已处理过）：**{skip}**")
lines.append(f"- 失败（无法提取）：**{fail}**")
lines.append("")
lines.append("## 失败原因分布")
lines.append("")
if reasons:
    for r, c in reasons.most_common():
        lines.append(f"- {r}：{c} 个")
else:
    lines.append("- 无")
lines.append("")
lines.append("## 失败文件清单（保留原占位内容）")
lines.append("")
if fails:
    for name, r in fails:
        lines.append(f"- {name} — *{r}*")
else:
    lines.append("- 无")
lines.append("")

txt = "\n".join(lines)
with open(out, "w", encoding="utf-8") as f:
    f.write(txt)
print(txt)
print(f"\n-> summary written to {out}")

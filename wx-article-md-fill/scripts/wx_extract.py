#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extract article content from each md file's frontmatter `url:` and replace the
placeholder body with the real article content. Frontmatter preserved; a footer
keeps the original link/meta. Only processes files that still contain the
placeholder marker `**原文链接**`, so re-runs are safe/resumable.
"""
import sys, os, re, subprocess, time, threading
from concurrent.futures import ThreadPoolExecutor, as_completed

UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
      "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 "
      "Mobile/15E148 Safari/604.1")

def fetch(url, tries=2):
    last = None
    for i in range(tries):
        try:
            r = subprocess.run(
                ["curl", "-sL", "--compressed", "-m", "40", "-A", UA,
                 "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                 "-H", "Accept-Language: zh-CN,zh;q=0.9",
                 url],
                capture_output=True)
            if r.returncode != 0:
                last = f"curl rc={r.returncode}"
            elif not r.stdout:
                last = "empty body"
            else:
                return r.stdout, None
        except Exception as e:
            last = str(e)
        if i < tries - 1:
            time.sleep(2)
    return None, last

def html_to_md(raw):
    from bs4 import BeautifulSoup
    from markdownify import markdownify as md_conv
    try:
        soup = BeautifulSoup(raw, "lxml")
    except Exception:
        soup = BeautifulSoup(raw, "html.parser")
    for t in soup(["script", "style", "noscript", "iframe"]):
        t.decompose()
    content = None
    for sel in ["div#js_content", "div.rich_media_content",
                "article", "main", "div#article-content", "div.content"]:
        c = soup.select_one(sel)
        if c:
            content = c
            break
    if content is None:
        content = soup.body or soup
    for img in content.find_all("img"):
        ds = (img.get("data-src") or img.get("data-original")
              or img.get("data-lazy-src"))
        if ds:
            img["src"] = ds
        img.attrs = {k: v for k, v in img.attrs.items() if k in ("src", "alt")}
    md = md_conv(str(content), heading_style="ATX", strip=[], bullets="-")
    md = re.sub(r"\n{3,}", "\n\n", md)
    md = re.sub(r"[ \t]+\n", "\n", md)
    return md.strip()

def parse_frontmatter(text):
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            return text[3:end].strip("\n"), text[end + 4:]
    return None, text

def extract_url(fm, body):
    m = re.search(r"^url:\s*(\S+)", fm, re.M)
    if m:
        return m.group(1).strip().strip('"').strip("'").rstrip("\\")
    m = re.search(r"https?://\S+", body)
    if m:
        return m.group(0).rstrip(")")
    return None

def field(fm, name):
    m = re.search(r"^%s:\s*(.+)$" % name, fm, re.M)
    return m.group(1).strip().strip('"') if m else ""

def process_file(path, force=False):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    if not force and "**原文链接" not in text:
        return False, "already processed (skip)"
    fm, body = parse_frontmatter(text)
    if fm is None:
        return False, "no frontmatter"
    url = extract_url(fm, body)
    if not url:
        return False, "no url"
    raw, err = fetch(url, tries=2)
    if raw is None:
        return False, f"fetch failed: {err}"
    decoded = raw.decode("utf-8", "ignore")
    if "未知错误" in decoded:
        return False, "wechat error page (blocked)"
    if "mp.weixin.qq.com" in url and "rich_media_content" not in decoded \
            and "js_content" not in decoded:
        return False, "no wechat content container (expired/non-article)"
    md = html_to_md(decoded)
    if len(md) < 50:
        return False, "extracted content too short"
    title = field(fm, "title") or os.path.splitext(os.path.basename(path))[0]
    collected = field(fm, "collected_at")
    src = field(fm, "source_wxid")
    favid = field(fm, "favid")
    footer = "\n\n---\n\n> 原文链接：" + url + "\n"
    meta = []
    if collected:
        meta.append(f"收藏时间：{collected}")
    if src:
        meta.append(f"来源（wxid）：{src}")
    if favid:
        meta.append(f"收藏项 ID：{favid}")
    if meta:
        footer += "> " + " | ".join(meta) + "\n"
    new_body = f"# {title}\n\n{md}{footer}\n"
    new_text = f"---\n{fm}\n---\n\n{new_body}"
    with open(path, "w", encoding="utf-8") as f:
        f.write(new_text)
    return True, f"ok len={len(md)}"

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--offset", type=int, default=0)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--report", default="/tmp/wx_full_report.txt")
    args = ap.parse_args()

    report_lock = threading.Lock()
    rep = open(args.report, "a", encoding="utf-8")
    def log(line):
        with report_lock:
            rep.write(line + "\n")
            rep.flush()

    files = sorted([os.path.join(args.dir, f) for f in os.listdir(args.dir)
                    if f.endswith(".md")])
    files = files[args.offset:]
    if args.limit:
        files = files[:args.limit]

    ok = fail = skip = 0
    done = 0
    total = len(files)
    log(f"=== run start workers={args.workers} total={total} ===")
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(process_file, p, args.force): p for p in files}
        for fut in as_completed(futs):
            p = futs[fut]
            name = os.path.basename(p)
            try:
                res, msg = fut.result()
            except Exception as e:
                res, msg = False, f"exception: {e}"
            if res:
                ok += 1
                tag = "[OK]"
            elif msg.startswith("already processed"):
                skip += 1
                tag = "[SKIP]"
            else:
                fail += 1
                tag = "[FAIL]"
            done += 1
            log(f"{tag} {name} :: {msg}")
            if done % 25 == 0 or done == total:
                print(f"progress {done}/{total} ok={ok} fail={fail} skip={skip}",
                      flush=True)
    print(f"DONE ok={ok} fail={fail} skip={skip} total={total} -> {args.report}")

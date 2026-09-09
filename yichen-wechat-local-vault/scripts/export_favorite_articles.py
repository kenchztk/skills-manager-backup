#!/usr/bin/env python3
"""Export WeChat favorite articles (type=5) from decrypted favorite.db to
individual Markdown files, one article per file.

Each article is a 公众号/web link favorite: WeChat stores only metadata
(title, desc, source link, fromusr, time, tags) locally, not the article body.
"""
from __future__ import annotations

import argparse
import datetime
import html
import json
import re
import sqlite3
import sys
import unicodedata
from pathlib import Path
from xml.etree import ElementTree as ET

ILLEGAL = re.compile(r'[\\/:*?"<>|\r\n\t]+')
WS = re.compile(r'\s+')

NS = ''  # wechat favitem xml is not namespaced


def text_of(el: ET.Element | None) -> str:
    if el is None or el.text is None:
        return ''
    return html.unescape(el.text).strip()


def first_text(root: ET.Element, *paths: str) -> str:
    for p in paths:
        el = root.find(p)
        if el is not None:
            t = text_of(el)
            if t:
                return t
    return ''


def parse_article(content: str) -> dict:
    out = {
        'title': '', 'desc': '', 'link': '', 'fromusr': '',
        'realchatname': '', 'tags': [], 'appname': '', 'eventid': '',
    }
    if not content:
        return out
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        # tolerate leading junk
        m = re.search(r'<favitem.*</favitem>', content, re.S)
        if not m:
            return out
        try:
            root = ET.fromstring(m.group(0))
        except ET.ParseError:
            return out
    if root.tag != 'favitem':
        r = root.find('.//favitem')
        if r is not None:
            root = r

    out['title'] = first_text(root, 'title', 'desc', './/datatitle', './/datadesc')
    # description prefers desc/datadesc distinct from title
    desc = first_text(root, 'desc', './/datadesc')
    if desc and desc != out['title']:
        out['desc'] = desc
    else:
        out['desc'] = first_text(root, './/datadesc', 'desc')

    # link
    link = first_text(root, './/source/link', './/link', './/url')
    out['link'] = link

    out['fromusr'] = first_text(root, './/source/fromusr', 'fromusr')
    out['realchatname'] = text_of(root.find('realchatname')) if root.find('realchatname') is not None else ''
    out['eventid'] = first_text(root, './/source/eventid', 'eventid')

    # appname / brand
    brand = first_text(root, './/source/brandid')
    if brand:
        out['appname'] = brand

    # tags
    tags = []
    for taglist in ('recommendtaglist', 'taglist'):
        parent = root.find(taglist)
        if parent is not None:
            for t in parent.findall('tag'):
                tt = text_of(t)
                if tt:
                    tags.append(tt)
    out['tags'] = tags
    return out


def sanitize(name: str, max_len: int = 50) -> str:
    name = unicodedata.normalize('NFKC', name or '').strip()
    name = ILLEGAL.sub(' ', name)
    name = WS.sub(' ', name).strip()
    if not name:
        name = '未命名文章'
    if len(name) > max_len:
        name = name[:max_len].rstrip()
    return name


def scan_existing(out_dir: Path) -> dict[int, str]:
    """Scan already-exported markdown files, returning {favid: filename}."""
    found: dict[int, str] = {}
    if not out_dir.exists():
        return found
    for p in out_dir.glob('*.md'):
        try:
            with p.open('r', encoding='utf-8') as f:
                for _ in range(40):
                    line = f.readline()
                    if not line:
                        break
                    m = re.match(r'^favid:\s*(\d+)\s*$', line.strip())
                    if m:
                        found[int(m.group(1))] = p.name
                        break
        except Exception:
            continue
    return found


def load_registry(reg_path: Path) -> dict | None:
    """Load the authoritative favid registry if present (independent of md contents)."""
    if not reg_path.exists():
        return None
    try:
        data = json.loads(reg_path.read_text(encoding='utf-8'))
    except Exception:
        return None
    if isinstance(data, dict) and 'items' in data:
        return data
    return None


def save_registry(reg_path: Path, items: dict) -> None:
    """Persist the favid registry as a hidden json file.
    This list is the authoritative incremental baseline — it does not depend on
    md frontmatter, so editing/replacing article bodies or losing the favid in
    an md does not break future incremental exports."""
    reg_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        'version': 1,
        'updated_at': datetime.datetime.now().isoformat(timespec='seconds'),
        'count': len(items),
        'items': {str(k): v for k, v in items.items()},
    }
    reg_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Favid registry updated: {len(items)} entries -> {reg_path}')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--db', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--mode', choices=['full', 'incremental'], default='incremental',
                    help='full: re-export every type=5 favorite (overwrites existing files). '
                         'incremental (default): only export favorites not already present in --out.')
    ap.add_argument('--registry', default=None,
                    help='Path to the authoritative .favid-registry.json. Defaults to '
                         '<out>/.favid-registry.json. Pass this to keep ONE registry while '
                         'exporting new files into a different (e.g. dated) folder.')
    args = ap.parse_args()

    out_dir = Path(args.out).expanduser()
    out_dir.mkdir(parents=True, exist_ok=True)

    # Authoritative registry location. It may differ from --out so that new files
    # can land in a dated subfolder while the registry remains the single source
    # of truth for the whole collection.
    reg_path = Path(args.registry).expanduser() if args.registry else (out_dir / '.favid-registry.json')
    reg_parent = reg_path.parent

    existing: set[int] = set()
    existing_files: dict[int, str] = {}
    if args.mode == 'incremental':
        reg = load_registry(reg_path)
        if reg is not None:
            items = reg.get('items', {})
            existing = set(int(k) for k in items)
            existing_files = {int(k): v.get('file', '') for k, v in items.items() if isinstance(v, dict)}
            print(f'Incremental mode: loaded favid registry with {len(existing)} entries')
        else:
            existing_files = scan_existing(out_dir)
            existing = set(existing_files)
            print(f'Incremental mode: no registry yet, scanned {len(existing)} existing md files')

    con = sqlite3.connect(args.db)
    cur = con.cursor()
    q = "SELECT local_id, update_time, content, fromusr, realchatname FROM fav_db_item WHERE type=5 ORDER BY update_time DESC"
    if args.limit:
        q += f" LIMIT {args.limit}"
    rows = cur.execute(q).fetchall()

    used: set[str] = set()
    count = 0
    skipped_existing = 0
    skipped = 0
    exported_meta: dict[int, dict] = {}
    for i, (lid, ts, content, fromusr, realchatname) in enumerate(rows, 1):
        info = parse_article(content or '')
        title = info['title'] or f'收藏文章-{lid}'
        try:
            tstr = ('#' + str(int(ts))) if ts else ''
            if ts:
                from datetime import datetime
                tstr = datetime.fromtimestamp(int(ts)).strftime('%Y-%m-%d %H:%M:%S')
        except Exception:
            tstr = ''
        if args.mode == 'incremental' and lid in existing:
            skipped_existing += 1
            exported_meta[lid] = {
                'title': title,
                'file': existing_files.get(lid, ''),
                'url': info['link'],
                'collected_at': tstr,
            }
            continue
        base = sanitize(title)
        fname = f'{base}'
        # ensure uniqueness
        candidate = fname
        n = 1
        while candidate in used:
            n += 1
            candidate = f'{base} ({n})'
        used.add(candidate)
        path = out_dir / f'{candidate}.md'

        tags = '、'.join(info['tags']) if info['tags'] else '无'
        src = info['fromusr'] or fromusr or ''
        lines = []
        lines.append('---')
        lines.append(f'title: {title}')
        lines.append('type: 微信收藏-文章')
        lines.append(f'favid: {lid}')
        lines.append(f'collected_at: {tstr}')
        if info['link']:
            lines.append(f'url: {info["link"]}')
        if src:
            lines.append(f'source_wxid: {src}')
        if info['tags']:
            lines.append(f'tags: {tags}')
        lines.append('---')
        lines.append('')
        lines.append(f'# {title}')
        lines.append('')
        if info['desc']:
            lines.append('> ' + info['desc'])
            lines.append('')
        if info['link']:
            lines.append(f'**原文链接：** [{info["link"]}]({info["link"]})')
            lines.append('')
        else:
            lines.append('**原文链接：** （本地未存储，可能为朋友圈/事件类收藏）')
            lines.append('')
        if info['eventid']:
            lines.append(f'**事件 ID：** {info["eventid"]}')
            lines.append('')
        meta = []
        if tstr:
            meta.append(f'收藏时间：{tstr}')
        if src:
            meta.append(f'来源（wxid）：{src}')
        if realchatname:
            meta.append(f'来源会话：{realchatname}')
        meta.append(f'标签：{tags}')
        meta.append(f'收藏项 ID：{lid}')
        lines.append(' | '.join(meta))
        lines.append('')

        try:
            path.write_text('\n'.join(lines), encoding='utf-8')
            count += 1
            try:
                file_field = str(path.resolve().relative_to(reg_parent.resolve()))
            except ValueError:
                file_field = path.name
            exported_meta[lid] = {
                'title': title,
                'file': file_field,
                'url': info['link'],
                'collected_at': tstr,
            }
        except Exception as e:
            skipped += 1
            print(f'  [WARN] write failed {path}: {e}', file=sys.stderr)

    # Maintain an authoritative favid registry (independent of md contents,
    # so editing/replacing article bodies or losing the favid in frontmatter
    # does not break future incremental exports).
    # Build the final registry with consistently string keys (favid is stored
    # as a string in json; merging must not mix str and int keys).
    if args.mode == 'full':
        final_items = {str(k): v for k, v in exported_meta.items()}
    else:
        reg = load_registry(reg_path)
        final_items = {str(k): v for k, v in (reg.get('items', {}) if reg else {}).items()}
        final_items.update({str(k): v for k, v in exported_meta.items()})
    save_registry(reg_path, final_items)

    print(f'Exported {count} new article markdown file(s) to {out_dir}')
    if args.mode == 'incremental':
        print(f'Skipped {skipped_existing} already-present favorite(s)')
    if skipped:
        print(f'Skipped {skipped} due to write errors')


if __name__ == '__main__':
    main()

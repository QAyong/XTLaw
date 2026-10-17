#!/usr/bin/env python3
"""Generate changelog.html for the XTLaw website from GitHub Releases.

Only the standard library is used. Every run builds the page in memory; if it
differs from the live copy, a new release directory is created from the
current one, changelog.html and sitemap.xml are replaced, and the `current`
symlink is switched atomically. Nothing else in the site is touched.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import json
import os
import re
import shutil
import sys
import urllib.request
from pathlib import Path

REPO = "QAyong/XTLaw"
TAG_PREFIX = "xtlaw-v"
SITE = "https://xtlaw.qayong.site"
API = f"https://api.github.com/repos/{REPO}/releases?per_page=100"
SITE_ROOT = Path("/var/www/xtlaw-site")
KEEP_GENERATED = 8
SEMVER = re.compile(r"^\d+\.\d+\.\d+$")
SHANGHAI = dt.timezone(dt.timedelta(hours=8))

HEADING_LABELS = {
    "what's changed": "变更内容",
    "new contributors": None,  # dropped: GitHub boilerplate
}


def fetch_releases() -> list[dict]:
    request = urllib.request.Request(API, headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": "xtlaw-site-changelog",
    })
    with urllib.request.urlopen(request, timeout=20) as response:
        if response.status != 200:
            raise RuntimeError(f"GitHub returned {response.status}")
        data = json.loads(response.read(8 * 1024 * 1024))
    if not isinstance(data, list):
        raise RuntimeError("unexpected GitHub response")
    releases = []
    for item in data:
        tag = item.get("tag_name")
        if item.get("draft") or item.get("prerelease") or not isinstance(tag, str) or not tag.startswith(TAG_PREFIX):
            continue
        version = tag[len(TAG_PREFIX):]
        if not SEMVER.match(version):
            continue
        url = item.get("html_url")
        if not isinstance(url, str) or not url.startswith(f"https://github.com/{REPO}/releases/"):
            continue
        releases.append({
            "version": version,
            "url": url,
            "published": item.get("published_at") or "",
            "body": item.get("body") or "",
        })
    releases.sort(key=lambda r: tuple(int(part) for part in r["version"].split(".")), reverse=True)
    return releases


def clean_body(body: str) -> str:
    body = re.sub(r"<!--.*?-->", "", body, flags=re.S)
    body = body.replace("\r\n", "\n")
    out: list[str] = []
    skipping = False
    for line in body.split("\n"):
        stripped = line.strip()
        heading = re.match(r"^#{1,6}\s+(.*)$", stripped)
        if heading:
            label = heading.group(1).strip().lower()
            skipping = label in HEADING_LABELS and HEADING_LABELS[label] is None
            if skipping:
                continue
        if skipping:
            continue
        if re.match(r"^\*{0,2}full changelog\*{0,2}\s*:", stripped, flags=re.I):
            continue
        # GitHub auto notes: "* title by @user in https://github.com/.../pull/1"
        line = re.sub(r"\s+by\s+@[\w-]+(?:\[bot\])?\s+in\s+https://github\.com/\S+\s*$", "", line)
        out.append(line)
    return "\n".join(out).strip()


def inline(text: str) -> str:
    """Escape first, then re-introduce a safe subset of inline Markdown."""
    parts = re.split(r"(`[^`\n]+`)", text)
    rendered = []
    for part in parts:
        if len(part) > 2 and part.startswith("`") and part.endswith("`"):
            rendered.append(f"<code>{html.escape(part[1:-1])}</code>")
            continue
        escaped = html.escape(part, quote=False)
        escaped = re.sub(r"\*\*([^*\n]+)\*\*", r"<strong>\1</strong>", escaped)

        def link(match: re.Match[str]) -> str:
            label, target = match.group(1), html.unescape(match.group(2))
            if not re.match(r"^https?://[^\s<>\"']+$", target):
                return match.group(0)
            return f'<a href="{html.escape(target, quote=True)}" target="_blank" rel="noopener noreferrer">{label}</a>'

        escaped = re.sub(r"\[([^\]\n]+)\]\(([^)\s]+)\)", link, escaped)
        rendered.append(escaped)
    return "".join(rendered)


def render_body(body: str) -> str:
    text = clean_body(body)
    if not text:
        return '<p class="empty">本版本暂无更新说明。</p>'
    blocks: list[str] = []
    paragraph: list[str] = []
    items: list[str] = []

    def flush() -> None:
        nonlocal paragraph, items
        if paragraph:
            blocks.append(f"<p>{inline(' '.join(paragraph))}</p>")
            paragraph = []
        if items:
            blocks.append("<ul>" + "".join(f"<li>{inline(item)}</li>" for item in items) + "</ul>")
            items = []

    for raw in text.split("\n"):
        line = raw.strip()
        if not line:
            flush()
            continue
        heading = re.match(r"^(#{1,6})\s+(.*)$", line)
        if heading:
            flush()
            title = heading.group(2).strip()
            title = HEADING_LABELS.get(title.lower(), title) or title
            blocks.append(f"<h4>{inline(title)}</h4>")
            continue
        bullet = re.match(r"^[-*+]\s+(.*)$", line)
        if bullet:
            if paragraph:
                flush()
            items.append(bullet.group(1))
            continue
        if items:
            flush()
        paragraph.append(line)
    flush()
    return "".join(blocks)


def format_date(value: str) -> tuple[str, str]:
    try:
        moment = dt.datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(SHANGHAI)
    except ValueError:
        return "", ""
    return moment.strftime("%Y-%m-%d"), moment.strftime("%Y 年 %m 月 %d 日")


STYLE = (
    ".log{width:min(760px,calc(100% - 40px));margin:70px auto 100px}.log h1{font-size:46px}"
    ".log .lead{color:var(--muted);margin:16px 0 8px}"
    ".log article{border-top:1px solid var(--line);padding:36px 0 8px;margin-top:36px}"
    ".log h2{font-size:27px;margin:0 0 6px}.log h2 a{text-decoration:none}"
    ".log .meta{color:var(--muted);font-size:14px;margin:0 0 16px}.log .meta a{text-decoration:underline}"
    ".log h4{font-size:16px;margin:22px 0 8px}.log p,.log li{color:var(--muted);line-height:1.8}"
    ".log ul{padding-left:22px;margin:8px 0}.log code{background:var(--soft);padding:2px 6px;border-radius:6px;font-size:.92em}"
    ".log a{text-decoration:underline}.log .empty{font-style:italic}"
    "@media(max-width:760px){.log{margin-top:35px}.log h1{font-size:35px}.log h2{font-size:24px}}"
)

HEAD_DESCRIPTION = "查看 XTLaw 每个版本的更新内容，了解新增功能、改进与修复。"


def render_page(releases: list[dict]) -> str:
    sections = []
    for release in releases:
        version = release["version"]
        iso, label = format_date(release["published"])
        date_html = f'<time datetime="{iso}">{label}</time> · ' if iso else ""
        sections.append(
            f'<article id="v{version}"><h2><a href="#v{version}">XTLaw {version}</a></h2>'
            f'<p class="meta">{date_html}<a href="{html.escape(release["url"], quote=True)}" '
            f'target="_blank" rel="noopener noreferrer">在 GitHub 查看发布页</a></p>'
            f'{render_body(release["body"])}</article>'
        )
    latest = releases[0]["version"] if releases else ""
    lead = f"当前最新版本 {latest}。" if latest else ""
    return (
        '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        "<title>XTLaw 更新日志 | 每个版本的新增、改进与修复</title>"
        '<link rel="stylesheet" href="styles.css">'
        f"<style>{STYLE}</style>"
        f'<meta name="description" content="{HEAD_DESCRIPTION}">'
        '<meta name="robots" content="index, follow, max-image-preview:large">'
        f'<link rel="canonical" href="{SITE}/changelog.html">'
        '<meta property="og:type" content="website"><meta property="og:site_name" content="XTLaw">'
        '<meta property="og:locale" content="zh_CN">'
        '<meta property="og:title" content="XTLaw 更新日志 | 每个版本的新增、改进与修复">'
        f'<meta property="og:description" content="{HEAD_DESCRIPTION}">'
        f'<meta property="og:url" content="{SITE}/changelog.html">'
        f'<meta property="og:image" content="{SITE}/assets/docx-workbench-light.png">'
        '</head><body><header class="nav"><div class="nav-inner"><a class="brand" href="index.html">'
        '<img class="wordmark" src="assets/xtlaw-wordmark-light.svg" alt="XTLaw" width="115" height="26"></a>'
        '<div class="nav-actions"><a class="button secondary compact" href="index.html">返回首页</a>'
        '<a class="button primary compact" href="index.html#download">选择电脑版本</a></div></div></header>'
        f'<main class="log"><h1>更新日志。</h1><p class="lead">{lead}每个版本的说明与 GitHub 发布页保持同步。</p>'
        f'{"".join(sections)}</main></body></html>\n'
    )


def update_sitemap(text: str, lastmod: str) -> str:
    entry = f"  <url><loc>{SITE}/changelog.html</loc><lastmod>{lastmod}</lastmod></url>\n"
    if f"<loc>{SITE}/changelog.html</loc>" in text:
        return re.sub(rf"  <url><loc>{re.escape(SITE)}/changelog\.html</loc>.*?</url>\n", entry, text)
    return text.replace("</urlset>", entry + "</urlset>")


def deploy(page: str, lastmod: str, root: Path) -> str | None:
    current = (root / "current").resolve()
    live = current / "changelog.html"
    if live.exists() and hashlib.sha256(live.read_bytes()).digest() == hashlib.sha256(page.encode()).digest():
        return None
    stamp = dt.datetime.now(SHANGHAI).strftime("%Y%m%d-%H%M%S")
    target = root / "releases" / f"{stamp}-changelog"
    if target.exists():
        raise RuntimeError(f"{target} already exists")
    shutil.copytree(current, target, symlinks=True)
    try:
        (target / "changelog.html").write_text(page, encoding="utf-8")
        sitemap = target / "sitemap.xml"
        sitemap.write_text(update_sitemap(sitemap.read_text(encoding="utf-8"), lastmod), encoding="utf-8")
        for path in [target, *target.rglob("*")]:
            if not path.is_symlink():
                path.chmod(0o755 if path.is_dir() else 0o644)
        link = root / "current.tmp"
        if link.is_symlink() or link.exists():
            link.unlink()
        link.symlink_to(target)
        os.replace(link, root / "current")
    except BaseException:
        shutil.rmtree(target, ignore_errors=True)
        raise
    generated = sorted(p for p in (root / "releases").iterdir() if p.name.endswith("-changelog"))
    for old in generated[:-KEEP_GENERATED]:
        if old != target and old.resolve() != (root / "current").resolve():
            shutil.rmtree(old, ignore_errors=True)
    return target.name


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", metavar="FILE", help="write the page to FILE and exit; nothing is deployed")
    parser.add_argument("--root", type=Path, default=SITE_ROOT)
    args = parser.parse_args()

    releases = fetch_releases()
    if not releases:
        print("no published xtlaw releases found; leaving the site unchanged", file=sys.stderr)
        return 1
    page = render_page(releases)
    if args.dry_run:
        Path(args.dry_run).write_text(page, encoding="utf-8")
        print(f"wrote {args.dry_run} with {len(releases)} release(s)")
        return 0
    lastmod = dt.datetime.now(SHANGHAI).strftime("%Y-%m-%d")
    deployed = deploy(page, lastmod, args.root)
    print(f"deployed {deployed}" if deployed else "changelog is up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())

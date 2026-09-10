"""Audit the generated Vietnamese mirror without changing page content.

The report is deliberately structural: route parity, locale-safe links, and
visible English UI/body text are checked separately so translation data can be
fixed in the source mirror rather than by replacing strings in URLs/scripts.
"""
import json, re
from urllib.parse import urljoin, urlparse
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
VI = DIST / "languages" / "vi"
REPORT = ROOT / "reports" / "vi-audit.json"
IGNORED = ("/templates/", "/img/", "/upfile/", "/aifeedback/", "/languages/al/", "/languages/es/", "/languages/fr/", "/languages/ru/", "/languages/cn/", "/api/", "/index.php", "/search.js", "/local-runtime.js")
LEFTOVER = re.compile(r"\b(?:This processing line|With a product that can be stored|Various UHT milk processing systems|Description|Parameter|Machinery|Complete Line|Solution|Service|About Us|Contact Us|Read More|Learn More|Details|Products?|Application|Processing Line|Previous|Next|More)\b", re.I)
MIXED = re.compile(r"\b(?:Complete|Description|Parameter|Service|Solution|Machinery|About|Contact|Read|Learn|Details|Product|Application|Processing)\s+[\wÀ-ỹ]+", re.I)

def clean_text(soup):
    for node in soup.select("script,style,noscript,svg"): node.decompose()
    return " ".join(soup.stripped_strings)

def main():
    default = {p.name for p in DIST.glob("*.html")}
    vi_files = {p.name for p in VI.glob("*.html")}
    missing = sorted(default - vi_files)
    wrong_links, broken_vi_links, leftovers, mixed = [], [], [], []
    for page in sorted(VI.rglob("*.html")):
        soup = BeautifulSoup(page.read_text(encoding="utf8"), "html.parser")
        text = clean_text(soup)
        hits = sorted(set(LEFTOVER.findall(text)))
        if hits: leftovers.append({"page": str(page.relative_to(DIST)).replace("\\", "/"), "hits": hits[:20]})
        mix = sorted(set(MIXED.findall(text)))
        if mix: mixed.append({"page": str(page.relative_to(DIST)).replace("\\", "/"), "hits": mix[:20]})
        page_url = "/languages/vi/" + page.name
        for anchor in soup.select("a[href]"):
            href = anchor.get("href", "").strip()
            resolved = urlparse(urljoin(page_url, href))
            resolved_path = resolved.path
            if not resolved_path or resolved_path.startswith(IGNORED) or resolved_path.startswith("//"):
                continue
            if resolved_path.startswith("/languages/vi/"):
                target = DIST / resolved_path.lstrip("/")
                if target.suffix == ".html" and not target.exists():
                    broken_vi_links.append({"page": page.name, "href": href, "resolved": resolved_path})
                continue
            # A root route is wrong only when the matching Vietnamese page exists.
            candidate = resolved_path.lstrip("/")
            if candidate.endswith(".html") and (VI / candidate).exists():
                wrong_links.append({"page": page.name, "href": href, "expected": "/languages/vi/" + candidate})
    report = {
        "default_routes": len(default), "vietnamese_routes": len(vi_files),
        "default_route_inventory": sorted(default),
        "vietnamese_route_inventory": sorted(vi_files),
        "missing_vietnamese_routes": missing,
        "wrong_locale_links": wrong_links,
        "broken_vietnamese_links": broken_vi_links,
        "english_leftovers": leftovers,
        "mixed_language": mixed,
        "critical": len(missing) + len(wrong_links) + len(broken_vi_links),
    }
    REPORT.parent.mkdir(exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    print(json.dumps({k: (len(v) if isinstance(v, list) else v) for k, v in report.items() if k != "critical"}, ensure_ascii=False, indent=2))
    print(f"critical={report['critical']}")
    raise SystemExit(1 if report["critical"] else 0)

if __name__ == "__main__": main()

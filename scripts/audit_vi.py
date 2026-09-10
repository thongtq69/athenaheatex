"""Audit the rendered Vietnamese site without changing page content.

The site ships a single language. The report is deliberately structural:
route parity against ``source/``, resolvable internal links and assets,
complete removal of the language switcher, and visible English UI/body text.
Content problems are meant to be fixed in the locale data, not by rewriting
URLs or scripts in the output.
"""
import json, re
from urllib.parse import urljoin, urlparse, unquote
from pathlib import Path
from bs4 import BeautifulSoup, Comment

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "source"
DIST = ROOT / "dist"
REPORT = ROOT / "reports" / "vi-audit.json"
SKIP_SCHEMES = ("mailto:", "tel:", "javascript:", "data:", "#")
LEFTOVER = re.compile(r"\b(?:This processing line|With a product that can be stored|Various UHT milk processing systems|Description|Parameter|Machinery|Complete Line|Solution|Service|About Us|Contact Us|Read More|Learn More|Details|Products?|Application|Processing Line|Previous|Next|More)\b", re.I)
MIXED = re.compile(r"\b(?:Complete|Description|Parameter|Service|Solution|Machinery|About|Contact|Read|Learn|Details|Product|Application|Processing)\s+[\wÀ-ỹ]+", re.I)
# Markup removed on purpose when the site became Vietnamese-only.
REMOVED_UI = {"lang", "header-lang"}


def clean_text(soup):
    for node in soup.select("script,style,noscript,svg"):
        node.decompose()
    return " ".join(soup.stripped_strings)


def dom_signature(soup):
    """Compare page structure, ignoring markup the render removes on purpose.

    Deliberate removals: the language switcher, the two hidden CMS fields on
    the search form, captured runtime validation errors, and images whose file
    404s upstream. Applying the same
    normalization to both sides keeps this check sensitive to accidental
    structural damage from translation.
    """
    for node in soup.select('script,style,noscript,title,.lang,.header-lang,.crmFormVali-error,input[name="lng"],input[name="mid"]'):
        node.decompose()
    for image in soup.find_all("img"):
        src = (image.get("src") or "").split("?")[0].split("#")[0]
        if src.startswith("/") and not src.startswith("//") and not (DIST / unquote(src).lstrip("/")).exists():
            image.decompose()
    return [(tag.name, tuple(sorted(tag.get("class", []))), tag.get("id")) for tag in soup.find_all(True)]


GENERATED_ROUTES = {"search.html", "404.html"}
# Visitor-facing English that used to live in the mirrored helper scripts.
ASSET_ENGLISH = re.compile(r"This field is required|Please enter a valid email|Email [Ss]end (?:failed|Succesfully)|Content not allowed|Only one message allowed|Video will be uploaded soon")
VENDOR_JS = re.compile(r"jquery|swiper|fancybox|slick|lazyload|\.min\.js", re.I)
CSS_COMMENT = re.compile(r"/\*.*?\*/", re.S)
CSS_RULE = re.compile(r"([^{}]*)\{([^{}]*)\}")
CSS_BACKGROUND_DECL = re.compile(r"background(?:-image)?\s*:([^;]*)")
CSS_URL = re.compile(r"url\(\s*[\"']?([^\"')]+)[\"']?\s*\)")
OVERRIDE_START = "/* joylong-vi-overrides:start"


def asset_english_strings():
    """Visitor-facing English left inside the site's own scripts."""
    hits = []
    for script in sorted(DIST.rglob("*.js")):
        if VENDOR_JS.search(script.name):
            continue
        for line_no, line in enumerate(script.read_text(encoding="utf8", errors="replace").splitlines(), 1):
            found = ASSET_ENGLISH.search(line)
            if found:
                hits.append({"file": str(script.relative_to(DIST)), "line": line_no, "text": found.group(0)})
    return hits


def missing_css_backgrounds():
    """Background images referenced by the stylesheets but absent from dist/.

    A rule the build has already neutralized with ``background-image:none`` is
    not a defect: the browser makes no request and paints nothing.
    """
    sheets = {sheet: sheet.read_text(encoding="utf8", errors="replace") for sheet in sorted(DIST.rglob("*.css"))}
    neutralized = set()
    for css in sheets.values():
        start = css.find(OVERRIDE_START)
        if start == -1:
            continue
        for selector, body in CSS_RULE.findall(CSS_COMMENT.sub("", css[start:])):
            if "none" in body and "background" in body:
                neutralized.add(" ".join(selector.split()))
    hits = []
    for sheet, css in sheets.items():
        start = css.find(OVERRIDE_START)
        body = css[:start] if start != -1 else css
        for selector, body_decls in CSS_RULE.findall(CSS_COMMENT.sub("", body)):
            declarations = CSS_BACKGROUND_DECL.findall(body_decls)
            if not declarations:
                continue
            found = CSS_URL.search(declarations[-1])
            if not found:
                continue
            target = found.group(1).strip().split("?")[0].split("#")[0]
            if not target.startswith("/") or target.startswith("//") or target.startswith("data:"):
                continue
            if (DIST / unquote(target).lstrip("/")).exists():
                continue
            cleaned = " ".join(selector.split())
            if cleaned in neutralized:
                continue
            hits.append({"file": str(sheet.relative_to(DIST)), "selector": cleaned, "url": target})
    return hits


def main():
    source_routes = {p.name for p in SOURCE.glob("*.html")}
    built_routes = {p.name for p in DIST.glob("*.html")}
    missing = sorted(source_routes - built_routes)
    unexpected = sorted(built_routes - source_routes - GENERATED_ROUTES)
    locale_routes = sorted(str(p.relative_to(DIST)) for p in DIST.glob("languages/**/*") if p.is_file())

    locale_links, broken_links, missing_assets = [], [], []
    switcher_remnants, leftovers, mixed, dom_mismatches, comment_artifacts = [], [], [], [], []
    non_vietnamese_html_lang = []

    for page in sorted(DIST.glob("*.html")):
        raw = page.read_text(encoding="utf8")
        soup = BeautifulSoup(raw, "html.parser")
        rel = page.name

        if soup.html and soup.html.get("lang") != "vi":
            non_vietnamese_html_lang.append(rel)

        found_ui = sorted({c for node in soup.find_all(True) for c in node.get("class", []) if c in REMOVED_UI})
        if found_ui:
            switcher_remnants.append({"page": rel, "classes": found_ui})

        canonical = SOURCE / rel
        if canonical.exists():
            if dom_signature(BeautifulSoup(canonical.read_text(encoding="utf8"), "html.parser")) != dom_signature(BeautifulSoup(raw, "html.parser")):
                dom_mismatches.append(rel)

        if any("div style=\"margin-top" in str(node) for node in soup.find_all(string=True) if not isinstance(node, Comment)):
            comment_artifacts.append(rel)

        text = clean_text(BeautifulSoup(raw, "html.parser"))
        hits = sorted(set(LEFTOVER.findall(text)))
        if hits:
            leftovers.append({"page": rel, "hits": hits[:20]})
        mix = sorted(set(MIXED.findall(text)))
        if mix:
            mixed.append({"page": rel, "hits": mix[:20]})

        page_url = "/" + rel
        for tag in soup.find_all(True):
            for attr in ("href", "src", "action", "poster", "data-src"):
                value = (tag.get(attr) or "").strip()
                if not value or value.startswith(SKIP_SCHEMES) or "//" in value[:8]:
                    continue
                resolved = unquote(urlparse(urljoin(page_url, value)).path)
                if not resolved.startswith("/"):
                    continue
                if resolved.startswith("/languages/"):
                    locale_links.append({"page": rel, "attr": attr, "href": value})
                    continue
                if resolved.endswith("/"):
                    resolved += "index.html"
                target = DIST / resolved.lstrip("/")
                if target.exists():
                    continue
                record = {"page": rel, "attr": attr, "href": value, "resolved": resolved}
                (broken_links if resolved.endswith((".html", ".php")) else missing_assets).append(record)

    # Search must work on a static host, so the index ships inside dist/ and
    # every page that has real content must appear in it.
    index_path = DIST / "search-index.json"
    index = json.loads(index_path.read_text(encoding="utf8")) if index_path.exists() else []
    indexed = {record["path"].lstrip("/") for record in index}
    stub = re.compile(r"^\d+_\d+\.html$")
    unindexed = sorted(
        name for name in built_routes - GENERATED_ROUTES - {"message.html"}
        if not stub.match(name) and name not in indexed
    )
    index_defects = []
    if not index:
        index_defects.append({"issue": "dist/search-index.json is missing or empty"})
    for record in index:
        if not record.get("title") or not record.get("path", "").startswith("/") or record.get("path", "").startswith("/languages/"):
            index_defects.append({"issue": "malformed record", "record": record.get("path")})

    report = {
        "source_routes": len(source_routes),
        "built_routes": len(built_routes),
        "indexed_records": len(index),
        "missing_routes": missing,
        "unexpected_routes": unexpected,
        "residual_locale_files": locale_routes,
        "locale_links": locale_links,
        "language_switcher_remnants": switcher_remnants,
        "pages_without_vietnamese_lang_attribute": non_vietnamese_html_lang,
        "broken_internal_links": broken_links,
        "missing_assets": missing_assets,
        "dom_structure_mismatches": dom_mismatches,
        "visible_comment_artifacts": comment_artifacts,
        "english_leftovers": leftovers,
        "mixed_language": mixed,
        "english_strings_in_scripts": asset_english_strings(),
        "missing_css_backgrounds": missing_css_backgrounds(),
        "pages_missing_from_search_index": unindexed,
        "search_index_defects": index_defects,
    }
    report["critical"] = sum(len(report[k]) for k in (
        "missing_routes", "unexpected_routes", "residual_locale_files", "locale_links",
        "language_switcher_remnants", "pages_without_vietnamese_lang_attribute",
        "broken_internal_links", "missing_assets", "dom_structure_mismatches",
        "visible_comment_artifacts", "english_leftovers", "mixed_language",
        "english_strings_in_scripts", "missing_css_backgrounds",
        "pages_missing_from_search_index", "search_index_defects"))
    REPORT.parent.mkdir(exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    print(json.dumps({k: (len(v) if isinstance(v, list) else v) for k, v in report.items() if k != "critical"}, ensure_ascii=False, indent=2))
    print(f"critical={report['critical']}")
    raise SystemExit(1 if report["critical"] else 0)


if __name__ == "__main__":
    main()

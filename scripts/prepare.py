"""Render the public site from the English source mirror into Vietnamese.

``source/`` holds the untouched mirror of the upstream pages and is never
deployed. Every build regenerates ``dist/`` from it, so the DOM, assets and
component structure stay identical to the original while the visible text,
metadata and UI labels are Vietnamese. Vietnamese is the only edition: the
language switcher is stripped and no locale sub-routes are produced.
"""
import json, re, shutil
from pathlib import Path
from urllib.parse import unquote
from bs4 import BeautifulSoup
from vi_locale import translate_document, translate_text

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "source"
OUT = ROOT / "dist"
SEARCH_LABEL, HOME_LABEL, EMPTY_LABEL, SEARCH_PLACEHOLDER = "Tìm kiếm", "Trang chủ", "Không tìm thấy kết quả.", "Tìm kiếm..."
# Everything in dist/ that is a build product rather than a mirrored asset.
GENERATED = ("*.html",)


def build_pages():
    """Copy every source route into dist/ and localize it in place."""
    OUT.mkdir(parents=True, exist_ok=True)
    for pattern in GENERATED:
        for stale in OUT.glob(pattern):
            stale.unlink()
    # Locale sub-routes from the multilingual era must not survive a rebuild.
    legacy = OUT / "languages"
    if legacy.exists():
        shutil.rmtree(legacy)
    for source in sorted(SOURCE.glob("*.html")):
        shutil.copy2(source, OUT / source.name)
    for target in sorted(OUT.glob("*.html")):
        translate_document(target)
    return sum(1 for _ in OUT.glob("*.html"))


STYLESHEET = OUT / "templates" / "default" / "css" / "public.css"
OVERRIDE_START = "/* joylong-vi-overrides:start"
OVERRIDE_END = "/* joylong-vi-overrides:end */"
HEADER_RULE = """/* The header used to stack a language switcher above the search box. With a
   single language that row is gone, so the right-hand column is centred
   against the logo instead of hugging the top edge of the header. */
@media screen and (min-width:769px){.topRight{margin-top:15px;}}"""
CSS_COMMENT = re.compile(r"/\*.*?\*/", re.S)
CSS_RULE = re.compile(r"([^{}]*)\{([^{}]*)\}")
CSS_BACKGROUND_DECL = re.compile(r"background(?:-image)?\s*:([^;]*)")
CSS_URL = re.compile(r"url\(\s*[\"']?([^\"')]+)[\"']?\s*\)")


def dead_background_selectors(css, root: Path):
    """Selectors whose *effective* background image is missing from the site.

    Only the last background declaration in a block applies, so a rule that
    falls back from ``url(...)`` to ``rgba(...)`` never requests the image and
    is not a problem.
    """
    for selector, body in CSS_RULE.findall(CSS_COMMENT.sub("", css)):
        declarations = CSS_BACKGROUND_DECL.findall(body)
        if not declarations:
            continue
        found = CSS_URL.search(declarations[-1])
        if not found:
            continue
        target = found.group(1).strip().split("?")[0].split("#")[0]
        if not target.startswith("/") or target.startswith("//") or target.startswith("data:"):
            continue
        if (root / unquote(target).lstrip("/")).exists():
            continue
        cleaned = " ".join(selector.split())
        if cleaned and not cleaned.startswith("@"):
            yield cleaned, target


def missing_background_rules():
    """Silence background images that 404 on the upstream site.

    Several icons referenced by the mirrored CSS no longer exist at the source,
    so every page view fired a failed request and drew nothing. Rather than edit
    the vendored stylesheets, emit overrides that switch those backgrounds off.
    """
    selectors = []
    for sheet in sorted(OUT.rglob("*.css")):
        css = sheet.read_text(encoding="utf8", errors="replace")
        if OVERRIDE_START in css:
            css = css[:css.find(OVERRIDE_START)]
        for selector, _target in dead_background_selectors(css, OUT):
            if selector not in selectors:
                selectors.append(selector)
    if not selectors:
        return ""
    # !important because this block lives in the first stylesheet the pages
    # load, while the rules it cancels sit in later ones.
    rules = "\n".join(s + "{background-image:none !important;}" for s in selectors)
    return ("/* These upstream images 404 at the source site; suppress the failed\n"
            "   request and the empty broken-image slot they left behind. */\n" + rules)


def apply_stylesheet_overrides():
    """Keep the single-language rules in the mirrored stylesheet.

    Rewritten in place on every build so the block cannot accumulate and so a
    re-mirror of the upstream CSS gets it back automatically.
    """
    css = STYLESHEET.read_text(encoding="utf8")
    start = css.find(OVERRIDE_START)
    if start != -1:
        end = css.find(OVERRIDE_END, start)
        css = css[:start] + css[end + len(OVERRIDE_END):] if end != -1 else css[:start]
    STYLESHEET.write_text(css.rstrip("\n") + "\n", encoding="utf8")
    block = "\n\n".join(x for x in (HEADER_RULE, missing_background_rules()) if x)
    STYLESHEET.write_text(
        css.rstrip("\n") + "\n\n" + OVERRIDE_START + " - maintained by scripts/prepare.py, do not edit by hand */\n"
        + block + "\n" + OVERRIDE_END + "\n", encoding="utf8")


# Category listings are mirrored once per page of results. Only page one is
# worth indexing; the rest repeat its title and lead nowhere useful.
PAGINATION_STUB = re.compile(r"^\d+_\d+\.html$")
# Content wrappers used across the mirrored templates, most specific first.
MAIN_SELECTORS = "#main .right.content", "#main", ".mainpage", "#content", ".mainRight", ".showPro"
COMPANY_TAIL = re.compile(r"\s*[-|]\s*Shanghai\s+Joylong.*$", re.I)


def page_title(soup, main, fallback):
    """Prefer the rendered heading, then the tab title minus the company tail."""
    heading = main.select_one("h1,.proTitle,.articleTitle,.contTitle,.title")
    if heading:
        text = " ".join(heading.get_text(" ", strip=True).split())
        if text:
            return text
    if soup.title:
        text = COMPANY_TAIL.sub("", " ".join(soup.title.get_text(" ", strip=True).split())).strip(" ,-")
        if text:
            return text
    return fallback


def collect_index():
    """Build the client-side search index from the rendered Vietnamese pages."""
    index = []
    for page in sorted(OUT.glob("*.html")):
        if page.name == "search.html" or PAGINATION_STUB.match(page.name):
            continue
        soup = BeautifulSoup(page.read_text(encoding="utf8"), "html.parser")
        main = next((soup.select_one(s) for s in MAIN_SELECTORS if soup.select_one(s)), None)
        if not main:
            continue
        for node in main.select("#aside,.left_menu,.left_nav,form,script,style,#location,#pageNum"):
            node.decompose()
        text = main.get_text(" ", strip=True)
        if not text:
            continue
        image = main.select_one("#proimg img,.proPic img,.info img,img")
        index.append({"path": "/" + page.name, "title": page_title(soup, main, page.stem), "text": text[:12000], "image": image.get("src", "") if image else ""})
    return index


def build_search_page():
    """Rebuild search.html from the rendered home page so chrome stays identical."""
    soup = BeautifulSoup((OUT / "index.html").read_text(encoding="utf8"), "html.parser")
    if soup.title:
        soup.title.string = SEARCH_LABEL + " - Shanghai Joylong Industry Co.,Ltd"
    container = soup.select_one("body > .container") or soup.body
    for child in list(container.children):
        if not getattr(child, "name", None):
            continue
        keep = child.get("id") in ("header", "nav", "footer", "footerBar", "goTop", "menuBtn") or set(child.get("class", [])) & {"mo-header", "mo-leftmenu"}
        if child.name in ("script", "noscript"):
            keep = True
        if not keep:
            child.decompose()
    html = f'''<main id="main" class="center clearfix" style="min-height:50vh;padding-top:28px;padding-bottom:40px">
  <div class="mainTop"><div id="location"><a href="/index.html">{HOME_LABEL}</a> &gt;&gt; {SEARCH_LABEL}</div></div>
  <form id="local-search" role="search" style="display:flex;max-width:650px;gap:8px;margin:20px 0"><input aria-label="{SEARCH_LABEL}" name="keyword" type="search" placeholder="{SEARCH_PLACEHOLDER}" style="flex:1;min-width:0;border:1px solid #ccc;padding:12px;font-size:16px"><button type="submit" style="background:#2185b8;color:white;padding:10px 24px;border:0;font-size:16px">{SEARCH_LABEL}</button></form>
  <p id="search-status" aria-live="polite" style="margin-bottom:20px"></p>
  <div class="info"><ul id="search-results" class="proDisplay justify"></ul><div id="pageNum"></div></div>
  </main>'''
    fragment = BeautifulSoup(html, "html.parser")
    footer = container.select_one("#footer")
    if footer and footer.parent == container:
        footer.insert_before(fragment)
    else:
        container.append(fragment)
    for script in soup.select("script[src]"):
        if any(x in script["src"] for x in ("index.js", "slick.min.js", "swiper3.js")):
            script.decompose()
    # Keep the analytics tag: only the banner/slider initialisers are dropped,
    # since the elements they animate no longer exist on this page.
    for script in soup.select("script:not([src])"):
        if any(x in script.text for x in ("#banner", "new Swiper")):
            script.decompose()
    config = soup.new_tag("script")
    config.string = "window.localSearchConfig=" + json.dumps({"empty": EMPTY_LABEL, "label": SEARCH_LABEL, "error": "Không thể tìm kiếm lúc này. Vui lòng thử lại."}, ensure_ascii=False) + ";"
    soup.body.append(config)
    soup.body.append(soup.new_tag("script", src="/search.js", defer=True))
    (OUT / "search.html").write_text(str(soup), encoding="utf8")


# Strings baked into the mirrored helper scripts. They are user-facing, so the
# build owns their Vietnamese wording; re-mirroring the English originals simply
# gets them translated again on the next build.
RUNTIME_STRINGS = {
    "aifeedback/form.js": [
        ('"This field is required."', '"Trường này là bắt buộc."'),
        ('"Please enter a valid email address."', '"Vui lòng nhập địa chỉ email hợp lệ."'),
        ('"Email send failed"', '"Gửi email không thành công."'),
        ("'Email Send Succesfully!'", "'Gửi email thành công!'"),
        ("'Content not allowed!'", "'Nội dung không được phép!'"),
        ("'Only one message allowed within 1 minute!'", "'Mỗi phút chỉ được gửi một tin nhắn!'"),
        ('class="crmMailMask-close"> OK <', 'class="crmMailMask-close"> Đóng <'),
    ],
    "templates/default/js/video.js": [
        ('"Video will be uploaded soon"', '"Video sẽ được cập nhật trong thời gian tới"'),
    ],
}


def localize_runtime_assets():
    """Translate the visitor-facing strings inside the mirrored helper scripts."""
    for relative, replacements in RUNTIME_STRINGS.items():
        target = OUT / relative
        if not target.exists():
            continue
        source = target.read_text(encoding="utf8")
        for english, vietnamese in replacements:
            source = source.replace(english, vietnamese)
        target.write_text(source, encoding="utf8")


def build_share_popup():
    """Localize the share popup, which is a standalone page in its own iframe."""
    for popup in sorted(OUT.rglob("share.php")):
        source = popup.read_text(encoding="utf8")
        source = re.sub(r"var myUrl\s*=\s*['\"][^'\"]*['\"]", "var myUrl=document.referrer || window.location.origin", source)
        popup.write_text(source, encoding="utf8")
        translate_document(popup, OUT)
        soup = BeautifulSoup(popup.read_text(encoding="utf8"), "html.parser")
        if soup.head is not None and soup.title is None:
            title = soup.new_tag("title")
            title.string = translate_text("Share")
            soup.head.append(title)
        popup.write_text(str(soup), encoding="utf8")


def write_not_found_page():
    """Ship a Vietnamese 404 page; static hosts serve dist/404.html automatically."""
    soup = BeautifulSoup((OUT / "index.html").read_text(encoding="utf8"), "html.parser")
    if soup.title:
        soup.title.string = "Không tìm thấy trang - Shanghai Joylong Industry Co.,Ltd"
    container = soup.select_one("body > .container") or soup.body
    for child in list(container.children):
        if not getattr(child, "name", None):
            continue
        keep = child.get("id") in ("header", "nav", "footer", "footerBar", "goTop", "menuBtn") or set(child.get("class", [])) & {"mo-header", "mo-leftmenu"}
        if child.name in ("script", "noscript"):
            keep = True
        if not keep:
            child.decompose()
    html = '''<main id="main" class="center clearfix" style="min-height:45vh;padding:40px 0">
  <div class="mainTop"><div id="location"><a href="/index.html">Trang chủ</a> &gt;&gt; Không tìm thấy trang</div></div>
  <h1 style="margin:24px 0 12px">Không tìm thấy trang</h1>
  <p style="margin-bottom:10px">Trang quý khách tìm không tồn tại hoặc đã được chuyển sang địa chỉ khác.</p>
  <p><a href="/index.html">Về trang chủ</a> &nbsp;|&nbsp; <a href="/search.html">Tìm kiếm</a> &nbsp;|&nbsp; <a href="/contact-us-7.html">Liên hệ</a></p>
  </main>'''
    fragment = BeautifulSoup(html, "html.parser")
    footer = container.select_one("#footer")
    if footer and footer.parent == container:
        footer.insert_before(fragment)
    else:
        container.append(fragment)
    for script in soup.select("script[src]"):
        if any(x in script["src"] for x in ("index.js", "slick.min.js", "swiper3.js")):
            script.decompose()
    for script in soup.select("script:not([src])"):
        if any(x in script.text for x in ("#banner", "new Swiper")):
            script.decompose()
    (OUT / "404.html").write_text(str(soup), encoding="utf8")


def main():
    pages = build_pages()
    localize_runtime_assets()
    build_share_popup()
    apply_stylesheet_overrides()
    index = collect_index()
    payload = json.dumps(index, ensure_ascii=False, separators=(",", ":"))
    # Shipped inside dist/ so search works on a purely static host, with no API.
    (OUT / "search-index.json").write_text(payload, encoding="utf8")
    (ROOT / "reports" / "search-index.json").write_text(payload, encoding="utf8")
    build_search_page()
    write_not_found_page()
    print(f"Rendered {pages} Vietnamese pages and indexed {len(index)} records.")


if __name__ == "__main__":
    main()

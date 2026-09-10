"""Build localized search pages and the Vietnamese mirror.

The VI mirror is regenerated from the canonical English route set on every
build. This keeps the DOM, assets and component structure identical; locale
translation is applied only to parsed visible text and locale-aware links.
"""
import json, re, shutil
from pathlib import Path
from bs4 import BeautifulSoup
from vi_locale import translate_document

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist"
LANGS = {
    "en": ("Search", "Home", "No results found.", "Search..."),
    "fr": ("Recherche", "Accueil", "Aucun résultat.", "Rechercher..."),
    "es": ("Buscar", "Inicio", "No se encontraron resultados.", "Buscar..."),
    "ru": ("Поиск", "Главная", "Ничего не найдено.", "Поиск..."),
    "cn": ("搜索", "首页", "没有找到结果。", "搜索..."),
    "al": ("بحث", "الرئيسية", "لم يتم العثور على نتائج。", "بحث..."),
    "vi": ("Tìm kiếm", "Trang chủ", "Không tìm thấy kết quả.", "Tìm kiếm..."),
}


def build_vi_mirror():
    vi_root = OUT / "languages" / "vi"
    vi_root.mkdir(parents=True, exist_ok=True)
    for old in vi_root.glob("*.html"):
        old.unlink()
    for source in OUT.glob("*.html"):
        if source.name == "search.html":
            continue
        target = vi_root / source.name
        shutil.copy2(source, target)
    # Resolve locale links only after every counterpart exists.
    for target in vi_root.glob("*.html"):
        translate_document(target, vi_root)
    (vi_root / ".localized").write_text("canonical structure + structured Vietnamese content\n", encoding="utf8")


def collect_index(manifest):
    index = []
    for url, item in manifest.items():
        if not item["page"]:
            continue
        p = OUT / item["path"].lstrip("/")
        if not p.exists():
            continue
        soup = BeautifulSoup(p.read_text(encoding="utf8"), "html.parser")
        match = re.match(r"/languages/(\w+)/", item["path"])
        lang = match[1] if match else "en"
        main = soup.select_one("#main .right.content") or soup.select_one("#main") or soup.select_one(".mainRight") or soup.select_one(".showPro")
        if not main:
            continue
        for node in main.select("#aside,.left_menu,.left_nav,form,script,style,#location,#pageNum"):
            node.decompose()
        text = main.get_text(" ", strip=True)
        if not text:
            continue
        title = item["title"].split(" - Shanghai")[0].split("-Shanghai")[0]
        heading = main.select_one("h1,.proTitle,.articleTitle")
        if heading:
            title = heading.get_text(" ", strip=True)
        image = main.select_one("#proimg img,.proPic img,.info img,img")
        index.append({"path": item["path"], "title": title, "lang": lang, "text": text[:24000], "image": image.get("src", "") if image else ""})
    vi_root = OUT / "languages" / "vi"
    for p in vi_root.glob("*.html"):
        soup = BeautifulSoup(p.read_text(encoding="utf8"), "html.parser")
        main = soup.select_one("#main") or soup.select_one(".mainRight") or soup.select_one(".showPro")
        if not main:
            continue
        text = main.get_text(" ", strip=True)
        if not text:
            continue
        heading = main.select_one("h1,.proTitle,.articleTitle")
        title = heading.get_text(" ", strip=True) if heading else p.stem
        index.append({"path": "/languages/vi/" + p.name, "title": title, "lang": "vi", "text": text[:24000], "image": ""})
    return index


def build_search_pages(index):
    for lang, labels in LANGS.items():
        prefix = "" if lang == "en" else "/languages/" + lang
        home = OUT / (prefix.lstrip("/") + "/index.html" if prefix else "index.html")
        soup = BeautifulSoup(home.read_text(encoding="utf8"), "html.parser")
        if soup.title:
            soup.title.string = labels[0] + " - Shanghai Joylong Industry Co.,Ltd"
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
  <div class="mainTop"><div id="location"><a href="{prefix}/index.html">{labels[1]}</a> &gt;&gt; {labels[0]}</div></div>
  <form id="local-search" role="search" style="display:flex;max-width:650px;gap:8px;margin:20px 0"><input aria-label="{labels[0]}" name="keyword" type="search" placeholder="{labels[3]}" style="flex:1;min-width:0;border:1px solid #ccc;padding:12px;font-size:16px"><button type="submit" style="background:#2185b8;color:white;padding:10px 24px;border:0;font-size:16px">{labels[0]}</button></form>
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
        for script in soup.select("script:not([src])"):
            if any(x in script.text for x in ("#banner", "new Swiper", "gtag(")):
                script.decompose()
        config = soup.new_tag("script")
        config.string = "window.localSearchConfig=" + json.dumps({"lang": lang, "empty": labels[2], "label": labels[0]}, ensure_ascii=False) + ";"
        soup.body.append(config)
        soup.body.append(soup.new_tag("script", src="/search.js", defer=True))
        output = OUT / (prefix.lstrip("/") + "/search.html" if prefix else "search.html")
        output.write_text(str(soup), encoding="utf8")


def main():
    manifest = json.loads((ROOT / "reports" / "manifest.json").read_text(encoding="utf8"))
    build_vi_mirror()
    index = collect_index(manifest)
    (ROOT / "reports" / "search-index.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf8")
    build_search_pages(index)
    for p in OUT.rglob("share.php"):
        source = p.read_text(encoding="utf8")
        source = re.sub(r"var myUrl\s*=\s*['\"][^'\"]*['\"]", "var myUrl=document.referrer || window.location.origin", source)
        p.write_text(source, encoding="utf8")
    css = '''<style id="locale-selector-css">.locale-selector{position:relative;display:inline-block;z-index:10000}.locale-trigger{display:flex;align-items:center;gap:7px;border:1px solid #d7e1ec;border-radius:999px;background:#fff;padding:8px 13px;color:#173b68;font-weight:600;cursor:pointer}.locale-menu{position:absolute;right:0;top:calc(100% + 9px);width:265px;background:#fff;border:1px solid #e5ebf2;border-radius:22px;box-shadow:0 16px 40px #173b6826;padding:8px;opacity:0;transform:translateY(-6px);pointer-events:none;transition:.18s ease}.locale-selector.open .locale-menu{opacity:1;transform:none;pointer-events:auto}.locale-option{display:flex;align-items:center;gap:12px;width:100%;border:0;background:transparent;border-radius:15px;padding:11px 12px;text-align:left;color:#173b68;font-size:15px;cursor:pointer}.locale-option:hover,.locale-option[aria-current=true]{background:#f0f5ff}.locale-option .code{margin-left:auto;color:#8090a3;font-size:12px;font-weight:700}.locale-option .check{width:18px;color:#2467b1;font-size:19px}@media(max-width:767px){.locale-menu{right:-8px;width:240px}.locale-trigger{padding:7px 10px}}</style>'''
    js = r'''<script id="locale-selector-js">(()=>{const L=[['🇻🇳','Tiếng Việt','VI','vi'],['🇬🇧','English','EN','en'],['🇦🇪','العربية','AR','al'],['🇪🇸','español','ES','es'],['🇫🇷','français','FR','fr'],['🇷🇺','русский','RU','ru'],['🇨🇳','中文','ZH','cn']];let p=location.pathname,m=p.match(/^\/languages\/([^/]+)/),cur=m?m[1]:'en',base=p.replace(/^\/languages\/[^/]+/,'');if(base==='/'||!base)base='/index.html';const wrap=document.createElement('div');wrap.className='locale-selector';const active=L.find(x=>x[3]===cur)||L[1];wrap.innerHTML='<button class="locale-trigger" aria-label="Select language" aria-expanded="false"><span>'+active[0]+'</span><b>'+active[2]+'</b><span aria-hidden="true">⌄</span></button><div class="locale-menu" role="menu">'+L.map(x=>'<button class="locale-option" role="menuitem" aria-current="'+(x[3]===cur)+'" data-locale="'+x[3]+'"><span>'+x[0]+'</span><strong>'+x[1]+'</strong><span class="code">'+x[2]+'</span><span class="check">'+(x[3]===cur?'✓':'')+'</span></button>').join('')+'</div>';let host=document.querySelector('.lang');if(host){host.innerHTML='';host.appendChild(wrap)}else{(document.querySelector('#header')||document.body).appendChild(wrap)}const b=wrap.querySelector('.locale-trigger');b.addEventListener('click',()=>{let o=wrap.classList.toggle('open');b.setAttribute('aria-expanded',o)});wrap.addEventListener('click',async e=>{const o=e.target.closest('.locale-option');if(!o)return;let l=o.dataset.locale,target=l==='en'?base:'/languages/'+l+base;try{let r=await fetch(target,{method:'HEAD'});if(!r.ok)target='/languages/'+l+'/index.html'}catch(_){target='/languages/'+l+'/index.html'}localStorage.setItem('site-locale',l);location.href=target});document.addEventListener('click',e=>{if(!wrap.contains(e.target)){wrap.classList.remove('open');b.setAttribute('aria-expanded','false')}});document.addEventListener('keydown',e=>{if(e.key==='Escape'){wrap.classList.remove('open');b.setAttribute('aria-expanded','false')}})})();</script>'''
    for p in OUT.rglob("*.html"):
        source = p.read_text(encoding="utf8")
        if "locale-selector-js" in source:
            source = re.sub(r'<script id="locale-selector-js">.*?</script>', js, source, count=1, flags=re.S)
        else:
            source = source.replace("</body>", js + "</body>")
        if "locale-selector-css" not in source:
            source = source.replace("</head>", css + "</head>")
        p.write_text(source, encoding="utf8")
    print(f"Built search index with {len(index)} records and {len(LANGS)} localized search pages.")


if __name__ == "__main__":
    main()

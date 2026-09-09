"""Reproducible public-site mirror. Never submits forms to the source site."""
from __future__ import annotations
import argparse, concurrent.futures, hashlib, json, re, time
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit, unquote
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist'
CACHE = ROOT / '.mirror-cache'
HOSTS = {'www.shjoylong.com', 'shjoylong.com', *(f'{x}.shjoylong.com' for x in ['al','es','fr','ru','cn'])}
IGNORE = ('/cdn-cgi/', '/adminsoft/', '/install/', '/api/', '/mail.php', '/aifeedback/save.php')
TRACKERS = ('googletagmanager', 'google-analytics', 'service-analytics', 'rocket-loader', 'email-decode', 'cloudflareinsights', 'hm.baidu.com', 'cnzz.com')
ASSET_EXT = r'(?:png|jpe?g|gif|webp|svg|ico|css|js|woff2?|ttf|eot|otf|mp4|webm|pdf|swf)'
MANIFEST = {}
ERRORS = {}
EXTERNAL = set()

def canonical(url, base='https://www.shjoylong.com/'):
    if url.strip() in ('http:', 'https:', 'http://', 'https://', '//'): return None
    url = urljoin(base, url.strip())
    p = urlsplit(url)
    if p.scheme not in ('http','https') or p.hostname not in HOSTS: return None
    if any(p.path.startswith(x) for x in IGNORE): return None
    host = 'www.shjoylong.com' if p.hostname == 'shjoylong.com' else p.hostname
    path = p.path or '/'
    if path == '/index.html': path = '/'
    return urlunsplit(('https', host, path, p.query, ''))

def local_path(url):
    p = urlsplit(url)
    prefix = '' if p.hostname in ('www.shjoylong.com','shjoylong.com') else '/languages/' + p.hostname.split('.')[0]
    path = unquote(p.path)
    if path.endswith('/'): path += 'index.html'
    if not Path(path).suffix: path += '/index.html'
    if p.query:
        stem, ext = path.rsplit('.',1)
        path = stem + '--' + hashlib.sha256(p.query.encode()).hexdigest()[:10] + '.' + ext
    path = re.sub(r'[<>:"|?*]', '_', path)
    return prefix + path

def relink(value, base):
    if not value or value.startswith(('data:', '#','javascript:','mailto:','tel:')): return value
    u = canonical(value, base)
    if u: return local_path(u) + (('#'+urlsplit(value).fragment) if urlsplit(value).fragment else '')
    if value.startswith('http://') and any(h in value for h in ('youtube.com','youtu.be','google.com')): return 'https:' + value[5:]
    return value

def fetch(url):
    key = hashlib.sha256(url.encode()).hexdigest()
    meta = CACHE / (key+'.json'); data = CACHE / (key+'.bin')
    if meta.exists() and data.exists():
        m = json.loads(meta.read_text()); return url, data.read_bytes(), m['type'], None
    for attempt in range(3):
        try:
            r = requests.get(url, headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.shjoylong.com/'}, timeout=35)
            r.raise_for_status()
            kind = r.headers.get('content-type','').split(';')[0]
            CACHE.mkdir(exist_ok=True)
            data.write_bytes(r.content); meta.write_text(json.dumps({'url':url,'type':kind}))
            return url, r.content, kind, None
        except Exception as e:
            error = str(e)
            if '404' in error: break
            time.sleep(attempt+1)
    return url, b'', '', error

def decode_email(code):
    try:
        b = bytes.fromhex(code); return ''.join(chr(c ^ b[0]) for c in b[1:])
    except Exception: return 'info@shjoylong.com'

def transform(url, data, kind):
    links = set()
    page = kind == 'text/html' or urlsplit(url).path.endswith(('.html','.php')) or urlsplit(url).path == '/'
    is_text = page or 'css' in kind or 'javascript' in kind or urlsplit(url).path.endswith(('.css','.js'))
    if not is_text: return data, links, False, ''
    source = data.decode('utf-8-sig', errors='replace')
    def discover(value):
        u = canonical(value, url)
        if u: links.add(u)
        elif value.startswith(('https://','http://','//')): EXTERNAL.add(urljoin(url,value))
        return relink(value, url)
    if page:
        soup = BeautifulSoup(source,'html.parser')
        for tag in soup.find_all(['script','iframe']):
            if any(t in (str(tag.get('src','')) + tag.get_text()) for t in TRACKERS): tag.decompose(); continue
            if tag.name == 'script' and tag.get('type','').endswith('text/javascript'): tag['type'] = 'text/javascript'
            tag.attrs.pop('data-cf-settings',None)
        for tag in soup.select('[data-cfemail]'):
            tag.replace_with(decode_email(tag['data-cfemail']))
        for tag in soup.find_all(href=re.compile('/cdn-cgi/l/email-protection')):
            code = tag['href'].split('#')[-1]
            tag['href'] = 'mailto:' + decode_email(code)
        for tag in soup.find_all(True):
            for attr in ('href','src','poster','data-src','data-original','data-img','background'):
                if tag.get(attr): tag[attr] = discover(tag[attr])
            if tag.get('srcset'):
                tag['srcset'] = ', '.join(' '.join([discover(x.strip().split()[0]),*x.strip().split()[1:]]) for x in tag['srcset'].split(','))
            if tag.get('style'):
                tag['style'] = re.sub(r'url\([\s\'\"]*([^\)\'\"]+)[\s\'\"]*\)',lambda m:'url("'+discover(m[1].strip())+'")',tag['style'])
        # Preserve original presentation scripts, with local API adapters installed last.
        if soup.body:
            script = soup.new_tag('script',src='/local-runtime.js',defer=True)
            soup.body.append(script)
        title = soup.title.get_text(' ',strip=True) if soup.title else ''
        source = str(soup)
    else:
        title = ''
        # The upstream HTTPS redirect is irrelevant on a loopback HTTP server.
        source = re.sub(r"if\s*\(window\.location\.protocol\s*!==?\s*'https:'\)\s*\{[^}]*\}", '', source)
        if 'css' in kind or urlsplit(url).path.endswith('.css'):
            source = re.sub(r'url\(\s*[\'\"]?([^\)\'\"]+)[\'\"]?\s*\)',lambda m:'url("'+discover(m[1].strip())+'")',source)
            source = re.sub(r'@import\s+[\'\"]([^\'\"]+)[\'\"]',lambda m:'@import "'+discover(m[1])+'"',source)
        # Explicit URLs and relative asset literals inside JavaScript.
        if 'javascript' in kind or urlsplit(url).path.endswith('.js'):
            def literal(m):
                value = m[2]
                if value.startswith(('http://','https://','//')) and canonical(value): return m[1]+discover(value)+m[1]
                if re.fullmatch(r'[\w./%+@?=&-]+\.'+ASSET_EXT+r'(?:\?[^\s]*)?',value,re.I): return m[1]+discover(value)+m[1]
                return m[0]
            source = re.sub(r'([\'\"])([^\'\"\n]+)\1',literal,source)
    return source.encode('utf-8'), links, page, title

def run(home_only=False):
    queue = {'https://www.shjoylong.com/'}
    if not home_only: queue.update('https://'+h+'/' for h in HOSTS if h!='shjoylong.com')
    visited = set()
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        while queue:
            batch = sorted(queue-visited); queue.clear()
            if not batch: break
            visited.update(batch)
            for url, data, kind, error in pool.map(fetch,batch):
                if error: ERRORS[url]=error; continue
                result, found, page, title = transform(url,data,kind)
                path = local_path(url)
                target = OUT / path.lstrip('/')
                target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(result)
                MANIFEST[url]={'path':path,'type':kind,'page':page,'title':title,'bytes':len(result)}
                if home_only:
                    found = {u for u in found if re.search(r'\.'+ASSET_EXT+r'(?:\?|$)',u,re.I)}
                queue.update(found-visited)
                if len(MANIFEST)%100==0: print(f'Saved {len(MANIFEST)} files; discovered {len(visited|queue)}; failures {len(ERRORS)}',flush=True)
            print(f'Batch complete: {len(MANIFEST)} files, {sum(x["page"] for x in MANIFEST.values())} pages, {len(queue)} pending, {len(ERRORS)} failures',flush=True)
            (ROOT/'reports/manifest.json').write_text(json.dumps(MANIFEST,ensure_ascii=False,indent=2),encoding='utf8')
            (ROOT/'reports/source-errors.json').write_text(json.dumps(ERRORS,indent=2),encoding='utf8')
    (ROOT/'reports/external-links.json').write_text(json.dumps(sorted(EXTERNAL),indent=2),encoding='utf8')

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--home-only',action='store_true')
    run(parser.parse_args().home_only)

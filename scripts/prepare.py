"""Build the local search experience from mirrored page content."""
import json, re
from pathlib import Path
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist'
LANGS={'en':('Search','Home','No results found.','Search...'), 'fr':('Recherche','Accueil','Aucun résultat.','Rechercher...'), 'es':('Buscar','Inicio','No se encontraron resultados.','Buscar...'), 'ru':('Поиск','Главная','Ничего не найдено.','Поиск...'), 'cn':('搜索','首页','没有找到结果。','搜索...'), 'al':('بحث','الرئيسية','لم يتم العثور على نتائج.','بحث...')}

def main():
 manifest=json.loads((ROOT/'reports/manifest.json').read_text(encoding='utf8'))
 index=[]
 for url,item in manifest.items():
  if not item['page']:continue
  p=OUT/item['path'].lstrip('/')
  if not p.exists():continue
  soup=BeautifulSoup(p.read_text(encoding='utf8'),'html.parser')
  match=re.match(r'/languages/(\w+)/',item['path']); lang=match[1] if match else 'en'
  main=soup.select_one('#main .right.content') or soup.select_one('#main') or soup.select_one('.mainRight') or soup.select_one('.showPro')
  if not main:continue
  for node in main.select('#aside,.left_menu,.left_nav,form,script,style,#location,#pageNum'):
   node.decompose()
  text=main.get_text(' ',strip=True)
  if not text:continue
  title=item['title'].split(' - Shanghai')[0].split('-Shanghai')[0]
  heading=main.select_one('h1,.proTitle,.articleTitle')
  if heading:title=heading.get_text(' ',strip=True)
  image=main.select_one('#proimg img,.proPic img,.info img,img')
  # Product/news pages carry their complete searchable text; navigation is excluded.
  index.append({'path':item['path'],'title':title,'lang':lang,'text':text[:24000],'image':image.get('src','') if image else ''})
 (ROOT/'reports/search-index.json').write_text(json.dumps(index,ensure_ascii=False),encoding='utf8')
 for lang,labels in LANGS.items():
  prefix='' if lang=='en' else '/languages/'+lang
  home=OUT/(prefix.lstrip('/')+'/index.html' if prefix else 'index.html')
  soup=BeautifulSoup(home.read_text(encoding='utf8'),'html.parser')
  if soup.title:soup.title.string=labels[0]+' - Shanghai Joylong Industry Co.,Ltd'
  # Reuse each language's original header, navigation, footer and CSS.
  container=soup.select_one('body > .container') or soup.body
  for child in list(container.children):
   if not getattr(child,'name',None):continue
   keep=child.get('id') in ('header','nav','footer','footerBar','goTop','menuBtn') or set(child.get('class',[])) & {'mo-header','mo-leftmenu'}
   if child.name in ('script','noscript'):keep=True
   if not keep:child.decompose()
  html=f'''<main id="main" class="center clearfix" style="min-height:50vh;padding-top:28px;padding-bottom:40px">
  <div class="mainTop"><div id="location"><a href="{prefix}/index.html">{labels[1]}</a> &gt;&gt; {labels[0]}</div></div>
  <form id="local-search" role="search" style="display:flex;max-width:650px;gap:8px;margin:20px 0"><input aria-label="{labels[0]}" name="keyword" type="search" placeholder="{labels[3]}" style="flex:1;min-width:0;border:1px solid #ccc;padding:12px;font-size:16px"><button type="submit" style="background:#2185b8;color:white;padding:10px 24px;border:0;font-size:16px">{labels[0]}</button></form>
  <p id="search-status" aria-live="polite" style="margin-bottom:20px"></p>
  <div class="info"><ul id="search-results" class="proDisplay justify"></ul><div id="pageNum"></div></div>
  </main>'''
  fragment=BeautifulSoup(html,'html.parser')
  footer=container.select_one('#footer')
  if footer and footer.parent==container:footer.insert_before(fragment)
  else:container.append(fragment)
  for script in soup.select('script[src]'):
   if any(x in script['src'] for x in ('index.js','slick.min.js','swiper3.js')):script.decompose()
  for script in soup.select('script:not([src])'):
   if any(x in script.text for x in ('#banner','new Swiper','gtag(')):script.decompose()
  config=soup.new_tag('script');config.string='window.localSearchConfig='+json.dumps({'lang':lang,'empty':labels[2],'label':labels[0]},ensure_ascii=False)+';'
  soup.body.append(config)
  soup.body.append(soup.new_tag('script',src='/search.js',defer=True))
  (OUT/(prefix.lstrip('/')+'/search.html' if prefix else 'search.html')).write_text(str(soup),encoding='utf8')
 # The upstream share popup has an obsolete hard-coded domain.
 for p in OUT.rglob('share.php'):
  source=p.read_text(encoding='utf8')
  source=re.sub(r'var myUrl\s*=\s*[\'"][^\'\"]*[\'"]', 'var myUrl=document.referrer || window.location.origin', source)
  p.write_text(source,encoding='utf8')
 print(f'Built search index with {len(index)} records and 6 localized search pages.')

if __name__=='__main__':main()

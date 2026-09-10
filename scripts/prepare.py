"""Build the local search experience from mirrored page content."""
import json, re
from pathlib import Path
from bs4 import BeautifulSoup
from vi_locale import translate_document

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist'
LANGS={'en':('Search','Home','No results found.','Search...'), 'fr':('Recherche','Accueil','Aucun résultat.','Rechercher...'), 'es':('Buscar','Inicio','No se encontraron resultados.','Buscar...'), 'ru':('Поиск','Главная','Ничего не найдено.','Поиск...'), 'cn':('搜索','首页','没有找到结果。','搜索...'), 'al':('بحث','الرئيسية','لم يتم العثور على نتائج.','بحث...'), 'vi':('Tìm kiếm','Trang chủ','Không tìm thấy kết quả.','Tìm kiếm...')}

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
 # Seed the new locale before generating its search page.
 vi_root=OUT/'languages'/'vi'
 vi_seeded=False
 vi_root.mkdir(parents=True,exist_ok=True)
 if not (vi_root/'index.html').exists() and not (vi_root/'.localized').exists():
  import shutil
  shutil.copy2(OUT/'index.html',vi_root/'index.html')
  vi_seeded=True
 # Vietnamese is a real localized mirror, so index its pages using the same
 # content source as the existing language folders.
 for p in vi_root.glob('*.html'):
  if p.name=='search.html': continue
  soup=BeautifulSoup(p.read_text(encoding='utf8'),'html.parser')
  main=soup.select_one('#main') or soup.select_one('.mainRight') or soup.select_one('.showPro')
  if not main: continue
  text=main.get_text(' ',strip=True)
  if not text: continue
  heading=main.select_one('h1,.proTitle,.articleTitle')
  title=heading.get_text(' ',strip=True) if heading else (soup.title.get_text(' ',strip=True).split(' - Shanghai')[0] if soup.title else p.stem)
  index.append({'path':'/languages/vi/'+p.name,'title':title,'lang':'vi','text':text[:24000],'image':''})
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
 # Add the Vietnamese mirror and the shared, accessible language selector.
 import shutil
 vi_root.mkdir(parents=True,exist_ok=True)
 replacements={'Home':'Trang chủ','Machinery':'Máy móc','Complete Line':'Dây chuyền hoàn chỉnh','Solution':'Giải pháp','Solutions':'Giải pháp','Service':'Dịch vụ','Services':'Dịch vụ','About Us':'Giới thiệu','About us':'Giới thiệu','Contact Us':'Liên hệ','Contact us':'Liên hệ','Contact':'Liên hệ','Search':'Tìm kiếm','Request a Quote':'Yêu cầu báo giá','Read More':'Xem thêm','News':'Tin tức','Company Profile':'Giới thiệu công ty','Company Culture':'Văn hóa công ty','Factory Tools':'Thiết bị nhà máy','Quality Control':'Kiểm soát chất lượng','Why Us':'Vì sao chọn chúng tôi','More Machinery':'Thêm máy móc','More Máy móc':'Thêm máy móc','Products':'Sản phẩm','Submit':'Gửi','Message':'Tin nhắn','Email':'Email','Phone':'Điện thoại','Address':'Địa chỉ','Tel:':'Điện thoại:','Fax:':'Fax:','Mobile:':'Di động:','Drop Us A Link!':'Gửi yêu cầu cho chúng tôi!','Certification':'Chứng nhận','Shanghai Joylong Industry Co., Ltd is the mainly manufacturer and exporter of all kinds food and beverage machinery and high quality packaging....':'Shanghai Joylong Industry Co., Ltd là nhà sản xuất và xuất khẩu chủ lực các loại máy móc thực phẩm, đồ uống và bao bì chất lượng cao.','We provide our customers worldwide the complete lines based on turn key projects solution for almost 30 years experience':'Chúng tôi cung cấp cho khách hàng trên toàn thế giới các dây chuyền hoàn chỉnh và giải pháp dự án chìa khóa trao tay với gần 30 năm kinh nghiệm.','Aseptic Carton Filling Machine':'Máy chiết rót hộp tiệt trùng','Aseptic Carton Packaging Material':'Vật liệu đóng gói hộp tiệt trùng','Filling, Packing Machine':'Máy chiết rót và đóng gói','Stainless Steel Tanks':'Bồn inox','Preparation system':'Hệ thống chuẩn bị','Sterilization system':'Hệ thống tiệt trùng','CIP Cleaning System':'Hệ thống vệ sinh CIP','Fruit Processing Equipment':'Thiết bị chế biến trái cây','Carbonated Beverage Equipment':'Thiết bị đồ uống có ga','Drinking Water Treatment Equipments':'Thiết bị xử lý nước uống','Sanitary Pumps':'Bơm vệ sinh','Installation Pipelines, Valves, Fittings':'Lắp đặt đường ống, van và phụ kiện','Utilities':'Tiện ích','UHT Milk Processing Line':'Dây chuyền xử lý sữa UHT','Pasteurized Milk Processing Line':'Dây chuyền xử lý sữa thanh trùng','Yogurt Processing Line':'Dây chuyền sản xuất sữa chua','Milk Powder Processing Line':'Dây chuyền sản xuất sữa bột','Condensed Milk Processing Line':'Dây chuyền sản xuất sữa đặc','Ice Cream Processing Line':'Dây chuyền sản xuất kem','Cheese Processing Line':'Dây chuyền sản xuất phô mai','Butter Processing Line':'Dây chuyền sản xuất bơ','Soymilk Processing Line':'Dây chuyền sản xuất sữa đậu nành','Juice Processing Line':'Dây chuyền sản xuất nước ép','Fruit Processing Line':'Dây chuyền chế biến trái cây','Tea Drinks Processing Line':'Dây chuyền sản xuất đồ uống trà','Carbonated Drinks Production Line':'Dây chuyền sản xuất đồ uống có ga','Mineral Water Production Line':'Dây chuyền sản xuất nước khoáng','Pure Water processing Line':'Dây chuyền xử lý nước tinh khiết','Dairy product solution':'Giải pháp sản phẩm sữa','Juice solution':'Giải pháp nước ép','Carbonated drinks solution':'Giải pháp đồ uống có ga','Drinking water solution':'Giải pháp nước uống','The Small Scale Milk, Yoghurt, Juice Combined Production Line':'Dây chuyền kết hợp sữa, sữa chua và nước ép quy mô nhỏ','Company':'Công ty'}
 for src in list(OUT.rglob('*.html')) if vi_seeded else []:
  if str(src).startswith(str(vi_root)): continue
  rel=src.relative_to(OUT)
  if rel.parts and rel.parts[0]=='languages': continue
  dst=vi_root/rel; dst.parent.mkdir(parents=True,exist_ok=True)
  shutil.copy2(src,dst)
  translate_document(dst,vi_root)
 # Existing Vietnamese pages are the locale data source; translate only their
 # visible labels while preserving model names and route structure.
 for p in vi_root.glob('*.html'):
  translate_document(p,vi_root)
 css='''<style id="locale-selector-css">.locale-selector{position:relative;display:inline-block;z-index:10000}.locale-trigger{display:flex;align-items:center;gap:7px;border:1px solid #d7e1ec;border-radius:999px;background:#fff;padding:8px 13px;color:#173b68;font-weight:600;cursor:pointer}.locale-menu{position:absolute;right:0;top:calc(100% + 9px);width:265px;background:#fff;border:1px solid #e5ebf2;border-radius:22px;box-shadow:0 16px 40px #173b6826;padding:8px;opacity:0;transform:translateY(-6px);pointer-events:none;transition:.18s ease}.locale-selector.open .locale-menu{opacity:1;transform:none;pointer-events:auto}.locale-option{display:flex;align-items:center;gap:12px;width:100%;border:0;background:transparent;border-radius:15px;padding:11px 12px;text-align:left;color:#173b68;font-size:15px;cursor:pointer}.locale-option:hover,.locale-option[aria-current=true]{background:#f0f5ff}.locale-option .code{margin-left:auto;color:#8090a3;font-size:12px;font-weight:700}.locale-option .check{width:18px;color:#2467b1;font-size:19px}@media(max-width:767px){.locale-menu{right:-8px;width:240px}.locale-trigger{padding:7px 10px}}</style>'''
 js='''<script id="locale-selector-js">(()=>{const L=[['🇻🇳','Tiếng Việt','VI','vi'],['🇬🇧','English','EN','en'],['🇦🇪','العربية','AR','al'],['🇪🇸','español','ES','es'],['🇫🇷','français','FR','fr'],['🇷🇺','русский','RU','ru'],['🇨🇳','中文','ZH','cn']];let p=location.pathname,m=p.match(/^\\/languages\\/([^/]+)/),cur=m?m[1]:'en',base=p.replace(/^\\/languages\\/[^/]+/,'');if(base==='/'||!base)base='/index.html';const wrap=document.createElement('div');wrap.className='locale-selector';const active=L.find(x=>x[3]===cur)||L[1];wrap.innerHTML='<button class="locale-trigger" aria-label="Select language" aria-expanded="false"><span>'+active[0]+'</span><b>'+active[2]+'</b><span aria-hidden="true">⌄</span></button><div class="locale-menu" role="menu">'+L.map(x=>'<button class="locale-option" role="menuitem" aria-current="'+(x[3]===cur)+'" data-locale="'+x[3]+'"><span>'+x[0]+'</span><strong>'+x[1]+'</strong><span class="code">'+x[2]+'</span><span class="check">'+(x[3]===cur?'✓':'')+'</span></button>').join('')+'</div>';let host=document.querySelector('.lang');if(host){host.innerHTML='';host.appendChild(wrap)}else{(document.querySelector('#header')||document.body).appendChild(wrap)}const b=wrap.querySelector('.locale-trigger');b.addEventListener('click',()=>{let o=wrap.classList.toggle('open');b.setAttribute('aria-expanded',o)});wrap.addEventListener('click',e=>{const o=e.target.closest('.locale-option');if(!o)return;let l=o.dataset.locale;localStorage.setItem('site-locale',l);location.href=l==='en'?base:'/languages/'+l+base});document.addEventListener('click',e=>{if(!wrap.contains(e.target)){wrap.classList.remove('open');b.setAttribute('aria-expanded','false')}});document.addEventListener('keydown',e=>{if(e.key==='Escape'){wrap.classList.remove('open');b.setAttribute('aria-expanded','false')}})})();</script>'''
 for p in OUT.rglob('*.html'):
  s=p.read_text(encoding='utf8')
  if 'locale-selector-js' in s: s=re.sub(r'<script id="locale-selector-js">.*?</script>',js,s,count=1,flags=re.S)
  elif not (str(p).replace('\\','/').find('/languages/vi/')>=0 and 'desktop-language-script' in s): s=s.replace('</head>',css+'</head>').replace('</body>',js+'</body>')
  p.write_text(s,encoding='utf8')
 print(f'Built search index with {len(index)} records and {len(LANGS)} localized search pages.')

if __name__=='__main__':main()

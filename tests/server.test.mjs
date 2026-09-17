import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server.mjs';
import { clientAddress, isAllowedOrigin, normalizeInquiry, notifyByEmail } from '../lib/inquiries.mjs';
import inquiryFunction from '../api/inquiries.mjs';
import { PUBLIC_PATHS } from '../lib/public-path-map.mjs';
import { publicPathForSourcePath, sourcePathForPublicPath } from '../lib/public-paths.mjs';
import { normalizeResource } from '../lib/admin-api.mjs';
import { normalizeDocumentHtml, normalizeFragmentHtml } from '../lib/html-normalize.mjs';
import { extractProductContent } from '../lib/product-content.mjs';
import { checkDomainStatus, DOMAIN_CONFIG } from '../lib/domain-status.mjs';

let server,base,dataDir;
before(async()=>{
 dataDir=await mkdtemp(path.join(os.tmpdir(),'joylong-test-'));
 // Never reach a real database from the test suite, even if MONGODB_URI is exported.
 server=createServer({dataDir,useDatabase:false});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dataDir,{recursive:true,force:true});});
test('the home and search pages are served in Vietnamese with the local runtime',async()=>{
 for(const file of ['/index.html','/search.html']){
  const r=await fetch(base+file);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/html/);
  const html=await r.text();
  assert.match(html,/local-runtime\.js/);
  assert.match(html,/<html lang="vi"/);
  assert.doesNotMatch(html,/\/languages\//);
  assert.doesNotMatch(html,/class="(?:lang|header-lang)"/);
  assert.match(html,/href="\/favicon\.ico\?v=20260917-2"/);
  const $=load(html);
  assert.equal($('meta[property="og:image"]').attr('content'),'https://www.athenaheatex.com/athena-heatex-share-preview-v2.jpg');
  assert.equal($('meta[name="twitter:card"]').attr('content'),'summary_large_image');
  assert.equal($('meta[property="og:image:width"]').attr('content'),'1200');
  assert.equal($('meta[property="og:image:height"]').attr('content'),'630');
  if(file==='/index.html')assert.equal($('title').text(),'ATHENA HEATEX');
 }
 const favicon=await fetch(base+'/favicon.ico');
 assert.equal(favicon.status,200);
 assert.match(favicon.headers.get('content-type'),/image\/x-icon/);
 assert.ok((await favicon.arrayBuffer()).byteLength>1000);
 const preview=await fetch(base+'/athena-heatex-share-preview-v2.jpg');
 assert.equal(preview.status,200);
 assert.match(preview.headers.get('content-type'),/image\/jpeg/);
 assert.ok((await preview.arrayBuffer()).byteLength>100000);
});
test('the deployed entity editors mark only the representative image as required',async()=>{
 const source=await readFile(path.join(process.cwd(),'admin','admin.js'),'utf8');
 const built=await readFile(path.join(process.cwd(),'dist','admin','admin.js'),'utf8');
 assert.equal(built,source);
 assert.match(source,/\['specifications','Thông số kỹ thuật','specifications'\]/);
 assert.match(source,/\['videos','Video sản phẩm','videos'\]/);
 assert.match(source,/\['gallery','Ảnh bổ sung','gallery'\]/);
 assert.match(source,/services:\{singular:'dịch vụ',fields:entityFields\(\{withCategory:false,requireIdentity:false,requireImage:true\}\)\}/);
 assert.match(source,/categories:\{singular:'danh mục',fields:\[\['name','Tên danh mục','text'\],\['parentId'/);
 assert.doesNotMatch(source,/\['sortOrder','Thứ tự','number'\]/);
 assert.match(source,/\['image','Ảnh đại diện','image',true\]/);
 assert.match(source,/data-image-required="\$\{required\}"/);
 assert.match(source,/!url&&!file/);
 assert.match(source,/resource==='media'&&id\?`\/media\/\$\{id\}\/upload`/);
 assert.match(source,/Đã thay ảnh và đồng bộ website/);
 assert.match(source,/aria-label="Tìm kiếm trong/);
 assert.match(source,/aria-label="\$\{esc\(label\)\} bằng URL"/);
 assert.match(source,/\['html','Nội dung trang','document-editor',true\]/);
 assert.match(source,/\['descriptionHtml','Nội dung chi tiết','richtext'\]/);
 assert.match(source,/contenteditable="true"/);
 assert.match(source,/data-command="insertImage"/);
 assert.match(source,/serializeRichField/);
 assert.doesNotMatch(source,/\['html','HTML toàn trang'/);
 assert.doesNotMatch(source,/source-details/);
 assert.doesNotMatch(source,/Đường dẫn \(\.html\)/);
 assert.match(source,/\['whatsappUrl','Liên kết WhatsApp','text'\]/);
 assert.match(source,/\['zaloUrl','Liên kết Zalo','text'\]/);
 assert.match(source,/\['wechatUrl','Liên kết mở WeChat','text'\]/);
});
test('CMS HTML is normalized before storage and clean HTML is preserved byte-for-byte',()=>{
 const dirty='<!doctype html><html><body><div id="x"></div><div id="x"></div><img src="/a.jpg"><div class="crm-form"><form><input name="Name" placeholder="*Họ tên"><input name="Email" placeholder="*E-mail" type="text"><textarea name="Message" placeholder="*Lời nhắn"></textarea></form></div></body></html>';
 const normalized=normalizeDocumentHtml(dirty,'Ảnh trang');
 assert.notEqual(normalized,dirty);
 const $=load(normalized);
 assert.equal($('[id="x"]').length,1);
 assert.equal($('img').attr('alt'),'Ảnh trang');
 assert.equal($('.crm-form form').attr('action'),'/api/inquiries');
 assert.equal($('.crm-form form').attr('method'),'post');
 assert.equal($('h1').length,1);
 assert.equal($('input[name="Name"]').attr('aria-label'),'Họ tên');
 assert.equal($('input[name="Email"]').attr('type'),'email');
 assert.notEqual($('textarea[name="Message"]').attr('required'),undefined);
 const clean='<p id="clean"><img src="/ok.jpg" alt="Đã có"></p>';
 assert.equal(normalizeFragmentHtml(clean,'Fallback'),clean);
 const page=normalizeResource('pages',{path:'/kiem-tra.html',title:'Kiểm tra',html:dirty});
 assert.equal(load(page.html)('img').attr('alt'),'Kiểm tra');
 const replacedMedia=normalizeResource('media',{url:'/img/moi.jpg'},{name:'Ảnh',url:'https://example.com/cu.jpg',publicId:'old/file',width:10,height:10,bytes:100});
 assert.equal(replacedMedia.publicId,undefined);
 assert.equal(replacedMedia.width,undefined);
});

test('legacy public pages always include the base stylesheet required for layout',()=>{
 const raw='<!doctype html><html><head><link href="/templates/default/css/main.css" rel="stylesheet"></head><body><div class="mo-header"></div><main>Máy móc</main></body></html>';
 const normalized=normalizeDocumentHtml(raw,'Máy móc');
 assert.match(normalized,/href="\/templates\/default\/css\/public\.css"/);
 assert.ok(normalized.indexOf('public.css')<normalized.indexOf('main.css'));
 assert.equal((normalized.match(/public\.css/g)||[]).length,1);
});

test('legacy branding and contact details are normalized everywhere visitors can see them',async()=>{
 const raw='<!doctype html><html><head><title>Shanghai Joylong Industry Co., Ltd</title></head><body><p>Joylong +86-18616619098 info@shjoylong.com</p><a href="tel:+86-18616619098">Gọi</a><a href="mailto:shjoylong@hotmail.com">Mail</a></body></html>';
 const normalized=normalizeDocumentHtml(raw,'Shanghai Joylong');
 assert.doesNotMatch(normalized,/Shanghai Joylong|\bJoylong\b|shjoylong|18616619098/i);
 assert.match(normalized,/ATHENA HEATEX/);
 assert.match(normalized,/\+84 912 76 76 85/);
 assert.match(normalized,/sales@athenatech\.com\.vn/);
 const contact=await readFile(path.join(process.cwd(),'dist','contact-us-7.html'),'utf8');
 assert.match(contact,/contact-channel-whatsapp/);
 assert.match(contact,/contact-channel-zalo/);
 assert.match(contact,/contact-channel-wechat/);
 assert.doesNotMatch(contact,/form-contact-channels|Liên hệ trực tiếp/);
 const $contact=load(contact);
 assert.equal($contact('.contactRight .inquiry-contact-channels').length,1);
 assert.equal($contact('.contactRight .inquiry-contact-channels a[data-contact-kind]').length,3);
 assert.equal($contact('.footForm .inquiry-contact-channels').length,0);
 assert.match($contact('.inquiry-contact-channels a[data-contact-kind="whatsapp"]').attr('href'),/^https:\/\/wa\.me\//);
 assert.match($contact('.inquiry-contact-channels a[data-contact-kind="zalo"]').attr('href'),/^https:\/\/zalo\.me\//);
 assert.match($contact('.inquiry-contact-channels a[data-contact-kind="wechat"]').attr('href'),/^weixin:\/\//);
 assert.doesNotMatch(contact,/facebook\.com\/joylong|twitter\.com\/Joylong|linkedin\.com\/company\/shanghai-joylong/i);
});
test('the admin includes a responsive domain overview for ATHENA HEATEX',async()=>{
 const html=await readFile(path.join(process.cwd(),'admin','index.html'),'utf8');
 const script=await readFile(path.join(process.cwd(),'admin','admin.js'),'utf8');
 const css=await readFile(path.join(process.cwd(),'admin','admin.css'),'utf8');
 assert.match(html,/data-view="domains">Tên miền/);
 assert.match(script,/api\('\/domain-status'\)/);
 assert.match(script,/Địa chỉ đã kết nối/);
 assert.match(script,/Đang lấy trạng thái từ máy chủ/);
 assert.ok(script.includes("view===state.view&&$('#refreshDomains')?.disabled"));
 assert.doesNotMatch(script,/Nền tảng triển khai|Địa chỉ nền tảng/);
 assert.match(css,/\.domain-overview/);
 assert.match(css,/@media\(max-width:760px\).*\.domain-overview\{grid-template-columns:1fr\}/s);
});
test('domain checks recognize the primary site and both Vercel redirects',async()=>{
 const responses=new Map([
  [DOMAIN_CONFIG.primaryUrl,{status:200,location:''}],
  [DOMAIN_CONFIG.apexUrl,{status:308,location:DOMAIN_CONFIG.primaryUrl}],
  [DOMAIN_CONFIG.platformUrl,{status:307,location:DOMAIN_CONFIG.primaryUrl}],
 ]);
 const fetchImpl=async url=>{const value=responses.get(url);return {status:value.status,headers:{get:name=>name==='location'?value.location:''}};};
 const report=await checkDomainStatus({fetchImpl,lookup:async()=>[{address:'203.0.113.10'}],timeoutMs:50});
 assert.equal(report.active,true);
 assert.equal(report.checks.dns.ok,true);
 assert.equal(report.checks.https.status,200);
 assert.equal(report.connections.apex.ok,true);
 assert.equal(report.connections.platform.ok,true);
});

test('every public page exposes the configured phone in a prominent click-to-call button',async()=>{
 for(const file of ['index.html','contact-us-7.html','air-compressor-252.html']){
  const html=await readFile(path.join(process.cwd(),'dist',file),'utf8');
  const $=load(html);
  const button=$('a.floating-call');
  assert.equal(button.length,1,file);
  assert.equal(button.attr('href'),'tel:+84 912 76 76 85',file);
  assert.equal(button.attr('aria-label'),'Gọi +84 912 76 76 85',file);
  assert.equal(button.find('.floating-call-number').text(),'+84 912 76 76 85',file);
  assert.equal(button.find('.floating-call-icon svg').length,1,file);
 }
 const css=await readFile(path.join(process.cwd(),'dist','templates','default','css','public.css'),'utf8');
 assert.match(css,/\.floating-call\{position:fixed;right:38px;bottom:72px/);
 assert.match(css,/@media screen and \(max-width:768px\)\{\.floating-call\{right:14px;bottom:60px/);
 assert.match(css,/@keyframes floating-call-ring/);
 assert.match(css,/@keyframes floating-call-pulse/);
 assert.match(css,/@keyframes floating-call-shake/);
});

test('the shared header constrains large logos uploaded from admin',async()=>{
 const css=await (await fetch(base+'/templates/default/css/public.css')).text();
 assert.match(css,/#logo img\s*\{[^}]*max-width:\s*481px;[^}]*max-height:\s*78px;/);
});
test('Máy móc uses the Vietnamese public URL and the imported URL redirects',async()=>{
 const legacy=await fetch(base+'/machinery-2.html',{redirect:'manual'});
 assert.equal(legacy.status,308);
 assert.equal(legacy.headers.get('location'),'/may-moc');
 const page=await fetch(base+'/may-moc');
 assert.equal(page.status,200);
 const html=await page.text();
 assert.match(html, /href="\/may-moc"/);
 assert.doesNotMatch(html, /href="\/machinery-2\.html"/);
 const $=load(html);
 assert.equal($('.proDisplay .box').length,20);
 assert.equal($('#pageNum a[title="1"]').attr('href'),'/may-moc');
});
test('machine category pages show their imported product cards and page 1 remains reachable',async()=>{
 for(const [source,minimum] of [['/aseptic-carton-filling-machine-69.html',12],['/filling-packing-machine-39.html',18],['/stainless-steel-tanks-28.html',11]]){
  const path=PUBLIC_PATHS[source];
  const response=await fetch(base+path);assert.equal(response.status,200,path);
  const $=load(await response.text());assert.ok($('.proDisplay .box').length>=minimum,path);
 }
 for(const route of [PUBLIC_PATHS['/2_2.html'],PUBLIC_PATHS['/2_6.html']]){
  const response=await fetch(base+route);assert.equal(response.status,200,route);
  const $=load(await response.text());assert.ok($('.proDisplay .box').length>0,route);
  assert.equal($('#pageNum a[title="1"]').attr('href'),'/may-moc',route);
 }
});
test('every imported page has one reversible Vietnamese URL and configured Vercel routing',async()=>{
 const config=JSON.parse(await readFile(path.join(process.cwd(),'vercel.json'),'utf8'));
 const entries=Object.entries(PUBLIC_PATHS);
 assert.equal(entries.length,278);
 assert.equal(new Set(entries.map(([,visitor])=>visitor)).size,entries.length);
 const redirects=new Map(config.redirects.map(item=>[item.source,item.destination]));
 const rewrites=new Map(config.rewrites.map(item=>[item.source,item.destination]));
 for(const [source,visitor] of entries){
  assert.equal(publicPathForSourcePath(source),visitor);
  assert.equal(sourcePathForPublicPath(visitor),source);
  assert.equal(redirects.get(source),visitor);
  assert.equal(rewrites.get(visitor),`/api/render?path=${source}`);
 }
});
test('old numbered visitor URLs redirect while new URLs omit imported record IDs',async()=>{
 const old=await fetch(base+'/day-chuyen-san-xuat-sua-bot-43?ref=old',{redirect:'manual'});
 assert.equal(old.status,308);assert.equal(old.headers.get('location'),PUBLIC_PATHS['/milk-powder-processing-line-43.html']+'?ref=old');
 assert.equal(publicPathForSourcePath('/san-pham-moi.html'),'/san-pham-moi');
 assert.equal(sourcePathForPublicPath('/san-pham-moi'),'/san-pham-moi.html');
 assert.ok(Object.values(PUBLIC_PATHS).every(path=>!/-trang-\d+$/.test(path)));
});
test('legacy product tabs can be edited as description, specifications, video and gallery',()=>{
 const fragment='<ul id="tags"><li>Mô tả</li></ul><div id="tagContent"><div class="tagContent"><p>Chi tiết</p></div><div class="tagContent"><table><tr><td>Công suất</td><td>1000L</td></tr></table></div><div class="tagContent"><a href="https://www.youtube.com/embed/abc"><img src="/video.jpg"></a></div></div>';
 const extracted=extractProductContent(fragment,'<div id="proimg"><img src="/main.jpg"></div><ul class="spec-list"><li><img src="/main.jpg"></li><li><img src="/other.jpg"></li></ul>');
 assert.match(extracted.descriptionHtml,/Chi tiết/);
 assert.deepEqual(extracted.specifications,[{label:'Công suất',value:'1000L'}]);
 assert.deepEqual(extracted.videos,[{url:'https://www.youtube.com/embed/abc',thumbnail:'/video.jpg'}]);
 assert.deepEqual(extracted.gallery,['/other.jpg']);
 const saved=normalizeResource('products',{name:'Máy thử',image:'/main.jpg',descriptionHtml:extracted.descriptionHtml,specifications:extracted.specifications,videos:extracted.videos,gallery:extracted.gallery});
 assert.equal(saved.specifications[0].value,'1000L');assert.equal(saved.videos[0].url,extracted.videos[0].url);
});
test('main navigation and content routes open at clean URLs; old URLs redirect',async()=>{
 const samples=['/complete-line-1.html','/solution-3.html','/service-4.html','/news-67.html','/about-us-6.html','/contact-us-7.html','/search.html','/air-compressor-252.html'];
 for(const source of samples){
  const visitor=PUBLIC_PATHS[source];
  const old=await fetch(base+source+'?ref=test',{redirect:'manual'});
  assert.equal(old.status,308,source);
  assert.equal(old.headers.get('location'),visitor+'?ref=test',source);
  const page=await fetch(base+visitor);
  assert.equal(page.status,200,visitor);
  assert.match(await page.text(),/<html lang="vi"/,visitor);
 }
 const home=await (await fetch(base+'/')).text();
 for(const visitor of ['/may-moc','/day-chuyen-hoan-chinh','/giai-phap','/dich-vu','/tin-tuc','/gioi-thieu','/lien-he'])assert.ok(home.includes(`href="${visitor}"`),visitor);
 assert.doesNotMatch(home,/href="\/(?:machinery-2|complete-line-1|solution-3|service-4|news-67|about-us-6|contact-us-7)\.html"/);
});
test('legacy contact helper never posts inquiry data to the cloned upstream site',async()=>{
 const script=await (await fetch(base+'/aifeedback/form.js')).text();
 assert.match(script,/\/api\/inquiries/);
 assert.doesNotMatch(script,/shjoylong\.com|console\.log\(form\.serialize\(\)\)/);
});
test('WeChat shortcuts copy the configured contact and attempt to open the app',async()=>{
 const script=await (await fetch(base+'/local-runtime.js')).text();
 assert.match(script,/data-contact-kind="wechat"/);
 assert.match(script,/navigator\.clipboard/);
 assert.match(script,/window\.location\.href=link\.href/);
 assert.match(script,/Add Contacts/);
});
test('both inquiry forms always notify the activated FormSubmit mailbox',async()=>{
 const page=load(await (await fetch(base+'/contact-us-7.html')).text());
 assert.equal(page('.crm-form form').length,2);
 const script=await (await fetch(base+'/local-runtime.js')).text();
 assert.match(script,/FORM_SUBMIT_RECIPIENT='sales@athenatech\.com\.vn'/);
 assert.match(script,/formsubmit\.co\/ajax/);
 assert.match(script,/'Accept':'application\/json'/);
 assert.match(script,/_replyto/);
 assert.match(script,/_template:'table'/);
 assert.match(script,/if\(result\?\.notification==='sent'\)return result/);
 assert.match(script,/notifyFormSubmit\(payload,result\?\.id\)/);
});
test('search returns Vietnamese results addressed at root routes',async()=>{
 const r=await fetch(base+'/api/search?q=máy');assert.equal(r.status,200);
 const data=await r.json();assert.ok(data.total>0);
 assert.ok(data.results.every(x=>x.path.startsWith('/')&&!x.path.startsWith('/languages/')));
 assert.ok(data.results.some(x=>/máy/i.test(x.title)));
 const none=await (await fetch(base+'/api/search?q=zzzzzzunfindable')).json();assert.equal(none.total,0);
});
test('search works without an API: the index ships as a static file',async()=>{
 const r=await fetch(base+'/search-index.json');
 assert.equal(r.status,200);
 const index=await r.json();
 assert.ok(index.length>200);
 assert.ok(index.every(x=>x.path.startsWith('/')&&!x.path.startsWith('/languages/')&&x.title));
 for(const slug of ['/lien-he','/dich-vu',PUBLIC_PATHS['/juice-solution-13.html']])
  assert.ok(index.some(x=>x.path===slug),`missing from index: ${slug}`);
 assert.ok(index.every(x=>!/^\/\d+_\d+\.html$/.test(x.path)),'pagination stubs must not be indexed');
 const js=await (await fetch(base+'/search.js')).text();
 assert.match(js,/search-index\.json/);
});
test('a Vietnamese not-found page is part of the deployable output',async()=>{
 const r=await fetch(base+'/404.html');assert.equal(r.status,200);
 const html=await r.text();
 assert.match(html,/<html lang="vi"/);
 assert.match(html,/Không tìm thấy trang/);
 assert.doesNotMatch(html,/\/languages\//);
});
test('the helper scripts and share popup carry no English UI text',async()=>{
 const form=await (await fetch(base+'/aifeedback/form.js')).text();
 assert.doesNotMatch(form,/This field is required|Please enter a valid email/);
 assert.match(form,/Trường này là bắt buộc/);
 const video=await (await fetch(base+'/templates/default/js/video.js')).text();
 assert.doesNotMatch(video,/Video will be uploaded soon/);
 const share=await (await fetch(base+'/templates/default/share.php')).text();
 assert.match(share,/Chia sẻ/);
 assert.doesNotMatch(share,/<p>Share<\/p>/);
});
test('retired locale routes redirect permanently to their Vietnamese page',async()=>{
 const vi=await fetch(base+'/languages/vi/contact-us-7.html',{redirect:'manual'});
 assert.equal(vi.status,301);assert.equal(vi.headers.get('location'),'/lien-he');
 for(const pathname of ['/languages/fr/index.html','/languages/cn/anything-123.html','/languages/vi']) {
  const r=await fetch(base+pathname,{redirect:'manual'});
  assert.equal(r.status,301);assert.equal(r.headers.get('location'),'/');
 }
});
test('legacy search form redirects to local search',async()=>{
 const r=await fetch(base+'/index.php?ac=search&at=list',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'keyword=milk+cooling',redirect:'manual'});
 assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/tim-kiem?q=milk%20cooling');
});
test('inquiry validates, persists all fields, and clearly reports local delivery',async()=>{
 const send=input=>fetch(base+'/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
 assert.equal((await send({Name:'A',Email:'invalid',Message:'Hello'})).status,400);
 const r=await send({Name:'Local test',Email:'test@example.invalid',Message:'Automated local persistence test',Company:'QA',page:'/contact-us-7.html'});
 assert.equal(r.status,201);assert.equal((await r.json()).delivery,'local');
 const record=JSON.parse((await readFile(path.join(dataDir,'inquiries.jsonl'),'utf8')).trim());
 assert.equal(record.name,'Local test');assert.equal(record.company,'QA');assert.equal(record.page,'/contact-us-7.html');
});
test('inquiry rejects requests from other sites',async()=>{
 const r=await fetch(base+'/api/inquiries',{method:'POST',headers:{Origin:'https://unrelated.example','Content-Type':'application/json'},body:'{}'});
 assert.equal(r.status,403);
 const malformed=await fetch(base+'/api/inquiries',{method:'POST',headers:{Origin:'not a url','Content-Type':'application/json'},body:'{}'});
 assert.equal(malformed.status,403);
 const broken=await fetch(base+'/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"Name":'});
 assert.equal(broken.status,400);
});
test('inquiry normalization maps the mirrored form fields and enforces limits',()=>{
 const {record}=normalizeInquiry({Name:' An ',Email:'an@example.com',Message:'Báo giá',Tel:'0909',Company:'ACME',Country:'VN',pagetitle:'Liên hệ'});
 assert.deepEqual(record,{name:'An',email:'an@example.com',message:'Báo giá',phone:'0909',company:'ACME',country:'VN',page:'Liên hệ'});
 assert.ok(normalizeInquiry({Name:'An',Email:'bad',Message:'x'}).error);
 assert.ok(normalizeInquiry({Name:'An',Email:'an@example.com',Message:'x',Tel:'9'.repeat(101)}).error);
 assert.ok(normalizeInquiry(['not','an','object']).error);
 assert.equal(isAllowedOrigin(undefined,'site.test'),true);
 assert.equal(isAllowedOrigin('https://site.test','site.test'),true);
 assert.equal(isAllowedOrigin('https://evil.test','site.test'),false);
 assert.equal(clientAddress({'x-forwarded-for':'203.0.113.9, 10.0.0.1'},'127.0.0.1'),'203.0.113.9');
});
test('no-account mail fallback lets the browser forward after storage',async()=>{
 const originalFetch=globalThis.fetch;
 const originalKey=process.env.RESEND_API_KEY;
 const originalWebhook=process.env.INQUIRY_EMAIL_WEBHOOK_URL;
 delete process.env.RESEND_API_KEY;
 delete process.env.INQUIRY_EMAIL_WEBHOOK_URL;
 const originalRecipient=process.env.INQUIRY_TO_EMAIL;
 process.env.INQUIRY_TO_EMAIL='wrong-recipient@example.com';
 const record={name:'An',email:'an@example.com',message:'Báo giá',phone:'',company:'',country:'',page:'/lien-he'};
 try{
  globalThis.fetch=async()=>{throw new Error('Serverless must not call FormSubmit');};
  const notification=await notifyByEmail(record,'123','another-wrong-recipient@example.com');
  assert.deepEqual(notification,{status:'client_required',provider:'formsubmit',to:'sales@athenatech.com.vn'});
 }finally{
  globalThis.fetch=originalFetch;
  if(originalKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=originalKey;
  if(originalWebhook===undefined)delete process.env.INQUIRY_EMAIL_WEBHOOK_URL;else process.env.INQUIRY_EMAIL_WEBHOOK_URL=originalWebhook;
  if(originalRecipient===undefined)delete process.env.INQUIRY_TO_EMAIL;else process.env.INQUIRY_TO_EMAIL=originalRecipient;
 }
});
test('the Vercel inquiry function rejects bad requests before touching storage',async()=>{
 const call=async req=>{
  const res={statusCode:200,headers:{},body:undefined,setHeader(k,v){this.headers[k.toLowerCase()]=v;},status(c){this.statusCode=c;return this;},json(b){this.body=b;return this;}};
  await inquiryFunction({headers:{host:'site.test'},socket:{},...req},res);return res;
 };
 const get=await call({method:'GET'});
 assert.equal(get.statusCode,405);assert.equal(get.headers.allow,'POST, PATCH');
 assert.equal((await call({method:'PATCH',body:{id:'invalid'}})).statusCode,400);
 assert.equal((await call({method:'POST',headers:{host:'site.test',origin:'https://evil.test'},body:{}})).statusCode,403);
 const invalid=await call({method:'POST',body:{Name:'An',Email:'bad',Message:'x'}});
 assert.equal(invalid.statusCode,400);assert.match(invalid.body.error,/email hợp lệ/);
 assert.equal(invalid.headers['cache-control'],'no-store');
});
test('private files and unknown pages are not exposed',async()=>{
 for(const pathname of ['/data/inquiries.jsonl','/.mirror-cache/','/server.mjs','/does-not-exist.html'])assert.equal((await fetch(base+pathname)).status,404);
});

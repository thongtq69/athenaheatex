import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server.mjs';

let server,base,dataDir;
before(async()=>{
 dataDir=await mkdtemp(path.join(os.tmpdir(),'joylong-test-'));
 server=createServer({dataDir});
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
 }
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
 for(const slug of ['/contact-us-7.html','/service-4.html','/juice-solution-13.html'])
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
 assert.equal(vi.status,301);assert.equal(vi.headers.get('location'),'/contact-us-7.html');
 for(const pathname of ['/languages/fr/index.html','/languages/cn/anything-123.html','/languages/vi']) {
  const r=await fetch(base+pathname,{redirect:'manual'});
  assert.equal(r.status,301);assert.equal(r.headers.get('location'),'/index.html');
 }
});
test('legacy search form redirects to local search',async()=>{
 const r=await fetch(base+'/index.php?ac=search&at=list',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'keyword=milk+cooling',redirect:'manual'});
 assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/search.html?q=milk%20cooling');
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
});
test('private files and unknown pages are not exposed',async()=>{
 for(const pathname of ['/data/inquiries.jsonl','/.mirror-cache/','/server.mjs','/does-not-exist.html'])assert.equal((await fetch(base+pathname)).status,404);
});

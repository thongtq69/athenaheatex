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
test('all seven homepages and search pages are served with correct content type',async()=>{
 for(const prefix of ['','/languages/al','/languages/es','/languages/fr','/languages/ru','/languages/cn','/languages/vi']) {
  for(const file of ['/index.html','/search.html']){
   const r=await fetch(base+prefix+file);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/html/);assert.match(await r.text(),/local-runtime\.js/);
  }
 }
});
test('search returns relevant local results and no cross-language leakage',async()=>{
 const r=await fetch(base+'/api/search?q=milk&lang=en');assert.equal(r.status,200);
 const data=await r.json();assert.ok(data.total>0);assert.match(data.results[0].title,/milk/i);
 assert.ok(data.results.every(x=>x.path.startsWith('/')&&!x.path.startsWith('/languages/')));
 const vi=await (await fetch(base+'/api/search?q=Máy&lang=vi')).json();assert.ok(vi.total>0);assert.ok(vi.results.every(x=>x.path.startsWith('/languages/vi/')));
 const none=await (await fetch(base+'/api/search?q=zzzzzzunfindable')).json();assert.equal(none.total,0);
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

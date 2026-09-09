import http from 'node:http';
import { readFile, stat, mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(root, 'dist');
const mime = {'.html':'text/html; charset=utf-8','.php':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.eot':'application/vnd.ms-fontobject','.pdf':'application/pdf','.mp4':'video/mp4'};
const escape = text => String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let cachedIndex;
async function index() { return cachedIndex ||= JSON.parse(await readFile(path.join(root,'reports/search-index.json'),'utf8')); }
async function body(req) {
  const chunks=[]; let size=0;
  for await (const chunk of req) {size+=chunk.length;if(size>65536)throw Object.assign(new Error('Request too large'),{status:413});chunks.push(chunk);}
  const raw=Buffer.concat(chunks).toString();
  if ((req.headers['content-type']||'').includes('application/json')) return JSON.parse(raw || '{}');
  return Object.fromEntries(new URLSearchParams(raw));
}
function json(res,status,data) {res.writeHead(status,{'Content-Type':mime['.json'],'Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function language(url) {return url.pathname.match(/^\/languages\/([a-z]+)\//)?.[1] || 'en';}
export function createServer({dataDir=path.join(root,'data')}={}) {
 return http.createServer(async(req,res)=>{
  try {
   const url=new URL(req.url,'http://localhost');
   res.setHeader('X-Content-Type-Options','nosniff');
   res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
   if(url.pathname==='/api/health') return json(res,200,{ok:true});
   if(url.pathname==='/api/inquiries') {
    if(req.method!=='POST') return json(res,405,{error:'Method not allowed'});
    if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host) return json(res,403,{error:'Invalid origin'});
    const input=await body(req);
    const name=String(input.Name||input.name||'').trim(), email=String(input.Email||input.email||'').trim(), message=String(input.Message||input.message||'').trim();
    if(!name||!message||!/^\S+@\S+\.\S+$/.test(email)) return json(res,400,{error:'Please enter your name, a valid email address, and a message.'});
    if(name.length>200||email.length>320||message.length>20000) return json(res,400,{error:'One or more fields are too long.'});
    const record={id:randomUUID(),createdAt:new Date().toISOString(),name,email,message,phone:String(input.Phone||input.Telephone||''),company:String(input.Company||''),country:String(input.Country||''),page:String(input.page||input.pagetitle||'')};
    await mkdir(dataDir,{recursive:true});
    await appendFile(path.join(dataDir,'inquiries.jsonl'),JSON.stringify(record)+'\n','utf8');
    return json(res,201,{ok:true,id:record.id,delivery:'local',message:'Your inquiry has been saved locally. It has not been emailed.'});
   }
   if(url.pathname==='/api/search') {
    const query=(url.searchParams.get('q')||'').trim().slice(0,200).toLowerCase(), lang=url.searchParams.get('lang')||'en';
    const terms=query.split(/\s+/).filter(Boolean);
    const found=query?(await index()).filter(x=>x.lang===lang && terms.every(t=>(x.title+' '+x.text).toLowerCase().includes(t))).map(x=>({...x,score:terms.reduce((n,t)=>n+(x.title.toLowerCase().includes(t)?10:1),0)})).sort((a,b)=>b.score-a.score):[];
    return json(res,200,{query,total:found.length,results:found.map(({text,score,...x})=>({...x,snippet:text.slice(0,260)}))});
   }
   if(/\/(search|index)\.php$/.test(url.pathname) && (url.searchParams.get('ac')==='search'||url.pathname.endsWith('/search.php'))) {
    const params=req.method==='POST'?await body(req):Object.fromEntries(url.searchParams);
    const prefix=language(url)==='en'?'':'/languages/'+language(url);
    res.writeHead(303,{Location:prefix+'/search.html?q='+encodeURIComponent(params.keyword||params.q||'')});return res.end();
   }
   if(!['GET','HEAD'].includes(req.method)) return json(res,405,{error:'Method not allowed'});
   let pathname=decodeURIComponent(url.pathname);
   if(pathname.includes('\0')||pathname.includes('\\'))return json(res,400,{error:'Invalid path'});
   let file=path.resolve(publicRoot,'.'+pathname);
   if(!file.startsWith(publicRoot+path.sep)&&file!==publicRoot) return json(res,403,{error:'Forbidden'});
   try {if((await stat(file)).isDirectory())file=path.join(file,'index.html');}catch{}
   let data;
   try {data=await readFile(file);}catch {
    res.writeHead(404,{'Content-Type':mime['.html']});return res.end('<!doctype html><html><head><meta charset="utf-8"><title>Page not found</title></head><body style="font:18px Arial;padding:4rem"><h1>Page not found</h1><p>'+escape(pathname)+'</p><a href="/index.html">Home</a></body></html>');
   }
   res.writeHead(200,{'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Content-Length':data.length,'Cache-Control':'no-cache'});
   res.end(req.method==='HEAD'?undefined:data);
  } catch(error) {json(res,error.status||500,{error:error.status?error.message:'Unable to process the request. Please try again.'});}
 });
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const port=Number(process.env.PORT||4173);
 createServer().listen(port,'127.0.0.1',()=>console.log(`Joylong local replica: http://127.0.0.1:${port}`));
}

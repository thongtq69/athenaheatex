import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientAddress, isAllowedOrigin, MESSAGES, submitInquiry } from './lib/inquiries.mjs';
import { healthReport } from './lib/health.mjs';
import { isDatabaseConfigured } from './lib/mongodb.mjs';
import { ensureCmsSeeded } from './lib/cms.mjs';
import { renderCmsPage } from './lib/cms-render.mjs';
import { publicPathForAliasPath, publicPathForSourcePath, rewritePublicLinks, sourcePathForPublicPath } from './lib/public-paths.mjs';
import { handleAdminApi } from './lib/admin-api.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(root, 'dist');
const adminRoot = path.join(root, 'admin');
const mime = {'.html':'text/html; charset=utf-8','.php':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.eot':'application/vnd.ms-fontobject','.pdf':'application/pdf','.mp4':'video/mp4'};
const escape = text => String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let cachedIndex;
async function index() { return cachedIndex ||= JSON.parse(await readFile(path.join(root,'reports/search-index.json'),'utf8')); }
async function body(req, limit=65536) {
  const chunks=[]; let size=0;
  for await (const chunk of req) {size+=chunk.length;if(size>limit)throw Object.assign(new Error('Nội dung gửi lên quá lớn.'),{status:413});chunks.push(chunk);}
  const raw=Buffer.concat(chunks).toString();
  if ((req.headers['content-type']||'').includes('application/json')) return JSON.parse(raw || '{}');
  return Object.fromEntries(new URLSearchParams(raw));
}
function json(res,status,data) {res.writeHead(status,{'Content-Type':mime['.json'],'Cache-Control':'no-store'});res.end(JSON.stringify(data));}
// The site used to publish one sub-tree per language. Vietnamese is now the
// only edition and lives at the root, so those routes redirect permanently:
// the Vietnamese pages keep their slug, the retired editions go to the home page.
function legacyLocaleTarget(pathname) {
  const match=pathname.match(/^\/languages\/([A-Za-z]{2})(?:\/(.*))?$/);
  if(!match)return null;
  const rest=match[2]||'';
  return match[1].toLowerCase()==='vi'&&rest?'/'+rest:'/index.html';
}
// useDatabase defaults to MongoDB whenever MONGODB_URI is set (see .env.local);
// tests pass false so they never touch a real database.
export function createServer({dataDir=path.join(root,'data'),useDatabase=isDatabaseConfigured(),useCms=useDatabase}={}) {
 return http.createServer(async(req,res)=>{
  try {
   const url=new URL(req.url,'http://localhost');
   res.setHeader('X-Content-Type-Options','nosniff');
   res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
   if(url.pathname.startsWith('/api/admin')) {
    if(!useCms)return json(res,503,{error:'CMS cần kết nối MongoDB.'});
    return handleAdminApi(req,res,url,body);
   }
   if(url.pathname==='/api/health') {const report=await healthReport();return json(res,report.ok?200:503,report);}
   // Same validation and storage as the deployed Vercel Function (api/inquiries.mjs).
   if(url.pathname==='/api/inquiries') {
    if(req.method!=='POST') {res.setHeader('Allow','POST');return json(res,405,{error:'Phương thức không được hỗ trợ.'});}
    if(!isAllowedOrigin(req.headers.origin,req.headers.host)) return json(res,403,{error:MESSAGES.forbidden});
    let input;
    try {input=await body(req);} catch(error) {if(error.status)throw error;return json(res,400,{error:MESSAGES.invalid});}
    const result=await submitInquiry(input,{address:clientAddress(req.headers,req.socket.remoteAddress),userAgent:req.headers['user-agent'],dataDir,useDatabase});
    return json(res,result.status,result.body);
   }
   if(url.pathname==='/api/search') {
    const query=(url.searchParams.get('q')||'').trim().slice(0,200).toLowerCase();
    const terms=query.split(/\s+/).filter(Boolean);
    const found=query?(await index()).filter(x=>terms.every(t=>(x.title+' '+x.text).toLowerCase().includes(t))).map(x=>({...x,score:terms.reduce((n,t)=>n+(x.title.toLowerCase().includes(t)?10:1),0)})).sort((a,b)=>b.score-a.score):[];
    return json(res,200,{query,total:found.length,results:found.map(({text,score,...x})=>({...x,path:publicPathForSourcePath(x.path),snippet:text.slice(0,260)}))});
   }
   if(/\/(search|index)\.php$/.test(url.pathname) && (url.searchParams.get('ac')==='search'||url.pathname.endsWith('/search.php'))) {
    const params=req.method==='POST'?await body(req):Object.fromEntries(url.searchParams);
    res.writeHead(303,{Location:'/tim-kiem?q='+encodeURIComponent(params.keyword||params.q||'')});return res.end();
   }
   {
    const target=legacyLocaleTarget(decodeURIComponent(url.pathname));
    if(target){res.writeHead(301,{Location:publicPathForSourcePath(target)});return res.end();}
   }
   const aliasTarget=publicPathForAliasPath(url.pathname);
   if(aliasTarget){res.writeHead(308,{Location:aliasTarget+url.search});return res.end();}
   const visitorPath=publicPathForSourcePath(url.pathname);
   if(visitorPath!==url.pathname && url.pathname!=='/index.html') {res.writeHead(308,{Location:visitorPath+url.search});return res.end();}
   if(url.pathname==='/admin'){res.writeHead(308,{Location:'/admin/'});return res.end();}
   if(url.pathname.startsWith('/admin/')) {
    if(!['GET','HEAD'].includes(req.method)) return json(res,405,{error:'Phương thức không được hỗ trợ.'});
    const relative=url.pathname==='/admin/'?'index.html':url.pathname.slice('/admin/'.length);
    const file=path.resolve(adminRoot,relative);
    if(!file.startsWith(adminRoot+path.sep))return json(res,403,{error:'Không được phép truy cập.'});
    try {
     const data=await readFile(file);
     res.writeHead(200,{'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Content-Length':data.length,'Cache-Control':'no-store'});
     return res.end(req.method==='HEAD'?undefined:data);
    } catch {return json(res,404,{error:'Không tìm thấy tài nguyên Admin.'});}
   }
   if(!['GET','HEAD'].includes(req.method)) return json(res,405,{error:'Phương thức không được hỗ trợ.'});
   let pathname=sourcePathForPublicPath(decodeURIComponent(url.pathname));
   if(pathname.includes('\0')||pathname.includes('\\'))return json(res,400,{error:'Đường dẫn không hợp lệ.'});
   let file=path.resolve(publicRoot,'.'+pathname);
   if(!file.startsWith(publicRoot+path.sep)&&file!==publicRoot) return json(res,403,{error:'Không được phép truy cập.'});
   try {if((await stat(file)).isDirectory())file=path.join(file,'index.html');}catch{}
   let data;
   if(useCms&&path.extname(file).toLowerCase()==='.html') {
    const rendered=await renderCmsPage(pathname==='/'?'/index.html':pathname);
    if(rendered!==null)data=Buffer.from(rendered);
   } else {
    try {data=await readFile(file);}catch {}
   }
   if(data&&path.extname(file).toLowerCase()==='.html')data=Buffer.from(rewritePublicLinks(data.toString('utf8')));
   if(!data) {
    res.writeHead(404,{'Content-Type':mime['.html']});return res.end('<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Không tìm thấy trang</title></head><body style="font:18px Arial;padding:4rem"><h1>Không tìm thấy trang</h1><p>'+escape(pathname)+'</p><a href="/index.html">Trang chủ</a></body></html>');
   }
   res.writeHead(200,{'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Content-Length':data.length,'Cache-Control':'no-cache'});
   res.end(req.method==='HEAD'?undefined:data);
  } catch(error) {json(res,error.status||500,{error:error.status?error.message:'Không thể xử lý yêu cầu. Vui lòng thử lại.'});}
 });
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const port=Number(process.env.PORT||4173);
 if(isDatabaseConfigured())await ensureCmsSeeded();
 createServer().listen(port,'127.0.0.1',()=>console.log(`Joylong CMS: http://127.0.0.1:${port} (admin: /admin/)`));
}

const $ = selector => document.querySelector(selector);
const PAGE_SIZE = 40;
const state = { view: 'dashboard', loadedView: null, dashboardCache: null, resourceCache: new Map(), items: [], categories: [], categoriesLoaded: false, products: [], productsLoaded: false, list: null, listRequest: 0, listAbort: null, navigation: 0, searchTimer: null, editing: null, admin: null, toastTimer: null };
const titles = { dashboard:'Tổng quan',pages:'Trang & nội dung',sections:'Section',products:'Sản phẩm',services:'Dịch vụ',categories:'Danh mục',banners:'Banner',media:'Thư viện ảnh',settings:'Liên hệ & SEO',inquiries:'Yêu cầu khách hàng' };
const hints = { dashboard:'Quản lý và đồng bộ website từ một nơi',pages:'Chỉnh sửa trang, tiêu đề và nội dung hiển thị',sections:'Quản lý các khối nội dung được đặt trên trang',products:'Thêm, sửa, ẩn và sắp xếp sản phẩm',services:'Quản lý dịch vụ đang hiển thị trên website',categories:'Quản lý nhóm sản phẩm và nhóm dịch vụ',banners:'Quản lý ảnh lớn và liên kết ở đầu trang',media:'Tìm và quản lý toàn bộ ảnh đã lưu',settings:'Cập nhật thông tin liên hệ và SEO toàn website',inquiries:'Xem và xử lý yêu cầu khách gửi'};
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

const configs = {
  pages: { singular:'trang', fields:[
    ['title','Tiêu đề','text',true],['path','Đường dẫn trang','text',true],['type','Loại trang','select',true,['page','product','category']],['enabled','Đang hiển thị','checkbox'],['sortOrder','Thứ tự','number'],
    ['seo.title','Tiêu đề tìm kiếm','text'],['seo.description','Mô tả tìm kiếm','textarea'],['seo.keywords','Từ khóa tìm kiếm','textarea'],['html','Nội dung trang','document-editor',true]
  ]},
  sections:{singular:'section',fields:[['name','Tên section','text',true],['pagePath','Trang áp dụng','text',true],['selector','Vị trí trên trang','text',true],['mode','Cách áp dụng','select',true,['inner','replace']],['enabled','Đang hiển thị','checkbox'],['sortOrder','Thứ tự','number'],['html','Nội dung section','richtext',true]]},
  products:{singular:'sản phẩm',fields:entityFields({withCategory:true,requireIdentity:false,requireImage:true})},
  services:{singular:'dịch vụ',fields:entityFields({withCategory:false,requireIdentity:false,requireImage:true})},
  categories:{singular:'danh mục',fields:[['name','Tên danh mục','text'],['path','Đường dẫn trang','text'],['parentId','Danh mục cha','category-select'],['kind','Nhóm','select',false,['product','service']],['productPaths','Sản phẩm trong danh mục','product-multi-select'],['enabled','Đang hiển thị','checkbox'],['sortOrder','Thứ tự','number'],['image','Ảnh đại diện','image',true],['descriptionHtml','Nội dung mô tả','richtext']]},
  banners:{singular:'banner',fields:[['title','Tên banner','text',true],['url','Liên kết','text',true],['alt','Alt ảnh','text'],['enabled','Đang hiển thị','checkbox'],['sortOrder','Thứ tự','number'],['image','Ảnh banner','image',true]]},
  media:{singular:'ảnh',fields:[['name','Tên ảnh','text',true],['alt','Alt ảnh','text'],['enabled','Đang sử dụng','checkbox'],['sortOrder','Thứ tự','number'],['url','Nguồn ảnh','image',true]]},
  inquiries:{singular:'yêu cầu',fields:[['name','Họ tên','readonly'],['email','Email khách','readonly'],['phone','Điện thoại','readonly'],['company','Công ty','readonly'],['country','Quốc gia','readonly'],['page','Trang gửi','readonly'],['message','Nội dung yêu cầu','readonly-tall'],['notificationRecipient','Email nhận thông báo','readonly'],['notificationStatus','Trạng thái email thông báo','readonly'],['status','Trạng thái xử lý','select',true,['new','processing','done','spam']]]},
};
function entityFields({withCategory,requireIdentity,requireImage}){const fields=[['name','Tên','text',requireIdentity],['path','Đường dẫn trang','text',requireIdentity]];if(withCategory)fields.push(['categoryId','Danh mục','category-select']);return [...fields,['enabled','Đang hiển thị','checkbox'],['sortOrder','Thứ tự','number'],['summary','Mô tả ngắn','textarea'],['image','Ảnh đại diện','image',requireImage],['descriptionHtml','Nội dung chi tiết','richtext'],['seo.title','Tiêu đề tìm kiếm','text'],['seo.description','Mô tả tìm kiếm','textarea'],['seo.keywords','Từ khóa tìm kiếm','textarea']];}

async function api(path, options={}) {
  const init = { credentials:'same-origin', ...options };
  if (init.body && !(init.body instanceof FormData)) { init.headers={...init.headers,'Content-Type':'application/json'}; init.body=JSON.stringify(init.body); }
  const response = await fetch(`/api/admin${path}`, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || `HTTP ${response.status}`),{status:response.status});
  if (init.method && !['GET','HEAD'].includes(init.method.toUpperCase())) {state.dashboardCache=null;state.resourceCache.clear();}
  return data;
}
function loading(show){ $('#loading').classList.toggle('hidden',!show); }
function toast(message,type='success'){const node=$('#toast');node.textContent=message;node.className=`toast ${type==='error'?'error':''}`;clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>node.classList.add('hidden'),3500);}
function getValue(object,path){return path.split('.').reduce((value,key)=>value?.[key],object);}
function setValue(object,path,value){const keys=path.split('.');let cursor=object;keys.forEach((key,index)=>{if(index===keys.length-1)cursor[key]=value;else cursor=cursor[key]??={};});}

async function boot(){
  loading(true);
  try { const {admin}=await api('/session'); state.admin=admin; showApp(); await navigate('dashboard'); }
  catch { $('#loginView').classList.remove('hidden'); }
  finally { loading(false); }
}
function showApp(){ $('#loginView').classList.add('hidden');$('#appView').classList.remove('hidden');$('#adminName').textContent=state.admin?.username||'Admin'; }

$('#loginForm').addEventListener('submit',async event=>{
  event.preventDefault();loading(true);$('#loginError').classList.add('hidden');
  try{const values=Object.fromEntries(new FormData(event.currentTarget));const {admin}=await api('/login',{method:'POST',body:values});state.admin=admin;showApp();await navigate('dashboard');toast('Đăng nhập thành công.');}
  catch(error){$('#loginError').textContent=error.message;$('#loginError').classList.remove('hidden');}
  finally{loading(false);}
});
$('#logoutBtn').addEventListener('click',async()=>{loading(true);try{await api('/logout',{method:'POST'});}finally{location.reload();}});
$('#nav').addEventListener('click',event=>{const button=event.target.closest('[data-view]');if(button)navigate(button.dataset.view);});
$('#content').addEventListener('click',event=>{const card=event.target.closest('[data-view]');if(card)navigate(card.dataset.view);});
$('#menuBtn').addEventListener('click',()=>$('.sidebar').classList.toggle('open'));

async function navigate(view){
  if(!titles[view])return;
  if(view===state.view&&(state.loadedView===view||$('#content').classList.contains('view-pending')))return;
  const navigation=++state.navigation;
  clearTimeout(state.searchTimer);state.listAbort?.abort();
  state.view=view;state.editing=null;document.querySelectorAll('#nav [data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===view));
  $('.sidebar').classList.remove('open');
  $('#content').classList.add('view-pending');$('#content').setAttribute('aria-busy','true');$('#viewLoading').classList.remove('hidden');
  try{
    if(view==='dashboard')await renderDashboard(navigation);else if(view==='settings')await renderSettings(navigation);else await renderResource(view,'',0,navigation);
    if(navigation===state.navigation){state.loadedView=view;$('#viewTitle').textContent=titles[view];$('#viewHint').textContent=hints[view]||'';}
  }
  catch(error){if(navigation!==state.navigation||error.name==='AbortError')return;state.loadedView=null;$('#content').innerHTML=`<div class="panel empty">${esc(error.message)}</div>`;$('#viewTitle').textContent=titles[view];$('#viewHint').textContent=hints[view]||'';toast(error.message,'error');if(error.status===401)setTimeout(()=>location.reload(),800);}
  finally{if(navigation===state.navigation){$('#content').classList.remove('view-pending');$('#content').removeAttribute('aria-busy');$('#viewLoading').classList.add('hidden');}}
}

async function renderDashboard(navigation=state.navigation){
  const cached=state.dashboardCache;
  const counts=cached&&Date.now()-cached.at<15_000?cached.counts:(await api('/dashboard')).counts;
  if(navigation!==state.navigation)return;
  state.dashboardCache={counts,at:Date.now()};
  const cards=[['pages','Trang'],['sections','Section'],['products','Sản phẩm'],['services','Dịch vụ'],['categories','Danh mục'],['banners','Banner'],['media','Ảnh'],['inquiries','Yêu cầu khách hàng']];
  const quick=[['products','Sản phẩm','Thêm hoặc đổi ảnh sản phẩm','＋'],['banners','Banner','Đổi ảnh đầu trang chủ','▣'],['media','Thư viện ảnh','Tìm ảnh đang được dùng','◈'],['settings','Liên hệ & SEO','Sửa thông tin toàn site','⚙']];
  $('#content').innerHTML=`<section class="dashboard-welcome"><div><p class="eyebrow">KHU VỰC QUẢN TRỊ</p><h2>Xin chào, ${esc(state.admin?.username||'Admin')}</h2><p>Mọi thay đổi được lưu qua API và đồng bộ trực tiếp ra website. Chọn một lối tắt bên phải để bắt đầu.</p></div><div class="welcome-actions"><button type="button" data-view="products">Mở sản phẩm</button><button type="button" data-view="pages">Mở trang</button></div></section><p class="dashboard-label">Tổng quan dữ liệu</p><div class="stats">${cards.map(([resource,label])=>`<button type="button" class="stat" data-view="${resource}" aria-label="Mở ${esc(titles[resource])}: ${Number(counts[resource]||0).toLocaleString('vi-VN')} mục"><strong>${Number(counts[resource]||0).toLocaleString('vi-VN')}</strong><span>${esc(label)}</span><span class="stat-arrow" aria-hidden="true">↗</span></button>`).join('')}</div><div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><p class="eyebrow">LỐI TẮT</p><h2>Thao tác thường dùng</h2></div><span class="sync-badge">Dữ liệu trực tiếp</span></div><div class="quick-list">${quick.map(([resource,label,detail,icon])=>`<button type="button" class="quick-link" data-view="${resource}"><span class="quick-icon" aria-hidden="true">${icon}</span><span><b>${label}</b><small>${detail}</small></span></button>`).join('')}</div></section><section class="panel"><div class="panel-head"><div><p class="eyebrow">GỢI Ý</p><h2>Quy trình an toàn</h2></div></div><ol class="guide-list"><li><b>Tìm đúng mục</b><span>Chọn menu theo loại nội dung cần sửa.</span></li><li><b>Sửa bằng trình trực quan</b><span>Gõ chữ, định dạng và chọn ảnh mà không cần biết mã.</span></li><li><b>Lưu rồi kiểm tra</b><span>Bấm Xem và tải lại trang để xác nhận thay đổi.</span></li></ol></section></div>`;
}

async function renderResource(resource,q=state.list?.resource===resource?state.list.q:'',page=state.list?.resource===resource?state.list.page:0,navigation=state.navigation){
  const request=++state.listRequest;
  state.listAbort?.abort();
  const controller=new AbortController();state.listAbort=controller;
  const searchFocused=document.activeElement?.id==='searchInput';
  $('#content').classList.add('is-updating');
  try{
  const skip=page*PAGE_SIZE;
  const cacheKey=JSON.stringify([resource,q,page]);
  const cached=state.resourceCache.get(cacheKey);
  const result=cached&&Date.now()-cached.at<15_000?cached.result:await api(`/${resource}?limit=${PAGE_SIZE}&skip=${skip}&q=${encodeURIComponent(q)}`,{signal:controller.signal});
  if(request!==state.listRequest||navigation!==state.navigation)return;
  if(!cached||result!==cached.result){state.resourceCache.set(cacheKey,{result,at:Date.now()});if(state.resourceCache.size>16)state.resourceCache.delete(state.resourceCache.keys().next().value);}
  if(page>0&&result.total<=skip)return renderResource(resource,q,Math.max(0,Math.ceil(result.total/PAGE_SIZE)-1),navigation);
  state.items=result.items;state.list={resource,q,page,total:result.total};
  const canAdd=resource!=='inquiries';
  const totalPages=Math.ceil(result.total/PAGE_SIZE);
  $('#content').innerHTML=`<div class="panel"><div class="panel-head"><div class="resource-heading"><div><p class="eyebrow">QUẢN LÝ NỘI DUNG</p><h2>${esc(titles[resource])}</h2><p>${esc(hints[resource]||'')}</p></div></div><span class="sync-badge">API trực tiếp</span></div><div class="toolbar"><input id="searchInput" aria-label="Tìm kiếm trong ${esc(titles[resource])}" placeholder="Tìm theo tên hoặc đường dẫn…" value="${esc(q)}"><button id="searchBtn" class="secondary">Tìm kiếm</button>${canAdd?`<button id="addBtn" class="primary">+ Thêm ${esc(configs[resource].singular)}</button>`:''}</div><div class="table-wrap">${table(resource,result.items,page*PAGE_SIZE,result.total)}</div><div class="pagination"><span>${result.total?`${skip+1}–${skip+result.items.length}`:'0'} / ${result.total} mục</span><div><button id="prevPage" class="secondary" ${page===0?'disabled':''}>← Trước</button><span>Trang ${totalPages?page+1:0}/${totalPages}</span><button id="nextPage" class="secondary" ${page+1>=totalPages?'disabled':''}>Tiếp →</button></div></div></div>`;
  $('#searchBtn').onclick=()=>renderResource(resource,$('#searchInput').value.trim(),0).catch(showListError);
  $('#searchInput').oninput=event=>{clearTimeout(state.searchTimer);state.listAbort?.abort();++state.listRequest;const value=event.currentTarget.value.trim();state.searchTimer=setTimeout(()=>renderResource(resource,value,0).catch(showListError),300);};
  $('#searchInput').onkeydown=event=>{if(event.key==='Enter'){clearTimeout(state.searchTimer);renderResource(resource,event.currentTarget.value.trim(),0).catch(showListError);}};
  if(searchFocused){$('#searchInput').focus();$('#searchInput').setSelectionRange($('#searchInput').value.length,$('#searchInput').value.length);}
  $('#prevPage').onclick=()=>renderResource(resource,q,page-1).catch(showListError);
  $('#nextPage').onclick=()=>renderResource(resource,q,page+1).catch(showListError);
  if(canAdd)$('#addBtn').onclick=()=>openEditor(resource);
  bindRows(resource);
  }finally{if(request===state.listRequest)$('#content').classList.remove('is-updating');}
}
function showListError(error){if(error.name!=='AbortError')toast(error.message,'error');}

function documentRegion(source){
  const document=new DOMParser().parseFromString(String(source||''),'text/html');
  const selectors=['#main','.mainpage','#content','.crm-form','.right','body'];
  const selector=selectors.find(candidate=>document.querySelector(candidate))||'body';
  const region=document.querySelector(selector);
  const clone=region?.cloneNode(true);
  clone?.querySelectorAll('script,style,noscript').forEach(node=>node.remove());
  clone?.querySelectorAll('*').forEach(node=>[...node.attributes].forEach(attribute=>{if(/^on/i.test(attribute.name)||attribute.name==='srcdoc')node.removeAttribute(attribute.name);}));
  return {selector,html:clone?.innerHTML||''};
}
function safeVisualFragment(source){
  const document=new DOMParser().parseFromString(`<body>${String(source||'')}</body>`,'text/html');
  document.querySelectorAll('script,style,noscript').forEach(node=>node.remove());
  document.querySelectorAll('*').forEach(node=>[...node.attributes].forEach(attribute=>{if(/^on/i.test(attribute.name)||attribute.name==='srcdoc')node.removeAttribute(attribute.name);}));
  return document.body.innerHTML;
}
function richEditorHtml(name,label,type,value,required){
  const source=String(value||'');
  const region=type==='document-editor'?documentRegion(source):{selector:'',html:safeVisualFragment(source)};
  return `<div class="field full rich-field" data-rich-path="${esc(name)}" data-rich-kind="${esc(type)}" data-rich-selector="${esc(region.selector)}"><span>${esc(label)}${required?' *':''}</span><p class="field-help">Bấm vào vùng nội dung để gõ. Dùng các nút bên trên để định dạng chữ, tạo danh sách, thêm liên kết hoặc chèn ảnh.</p><div class="rich-toolbar" role="toolbar" aria-label="Định dạng ${esc(label)}"><button type="button" data-command="bold" title="In đậm"><b>B</b></button><button type="button" data-command="italic" title="In nghiêng"><i>I</i></button><button type="button" data-command="insertUnorderedList" title="Danh sách dấu chấm">• Danh sách</button><button type="button" data-command="insertOrderedList" title="Danh sách số">1. Danh sách</button><button type="button" data-command="createLink" title="Thêm liên kết">Liên kết</button><button type="button" data-command="insertImage" title="Chèn ảnh">Ảnh</button><button type="button" data-command="removeFormat" title="Xoá định dạng">Xoá định dạng</button></div><div class="rich-surface" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${esc(label)}" data-placeholder="Bắt đầu nhập nội dung…">${region.html}</div><input type="hidden" class="rich-source" value="${esc(source)}"></div>`;
}
function serializeRichField(field){
  const surface=field.querySelector('.rich-surface');
  const source=field.querySelector('.rich-source');
  if(source.dataset.dirty==='true')return source.value;
  if(surface.dataset.dirty!=='true')return source.value;
  if(field.dataset.richKind!=='document-editor')return surface.innerHTML;
  const document=new DOMParser().parseFromString(source.value||'<!doctype html><html><head></head><body></body></html>','text/html');
  const region=document.querySelector(field.dataset.richSelector)||document.body;
  region.innerHTML=surface.innerHTML;
  return '<!DOCTYPE html>\n'+document.documentElement.outerHTML;
}
function bindRichEditors(){
  document.querySelectorAll('.rich-field').forEach(field=>{
    const surface=field.querySelector('.rich-surface'),source=field.querySelector('.rich-source');
    field.querySelector('.rich-toolbar').addEventListener('click',event=>{
      const button=event.target.closest('[data-command]');if(!button)return;
      surface.focus();
      const command=button.dataset.command;
      const value=['createLink','insertImage'].includes(command)?prompt(command==='createLink'?'Nhập đường dẫn liên kết (https://… hoặc /duong-dan):':'Dán đường dẫn ảnh (https://… hoặc /duong-dan/anh.jpg):','https://'):null;
      if(command==='createLink'&&!value)return;
      if(command==='insertImage'&&(!value||!/^https?:\/\//i.test(value)&&!value.startsWith('/'))){if(value)toast('Đường dẫn ảnh cần bắt đầu bằng https:// hoặc /','error');return;}
      document.execCommand(command,false,value);
      surface.dataset.dirty='true';
    });
    surface.addEventListener('input',()=>{surface.dataset.dirty='true';});
  });
}

function table(resource,items,offset=0,total=items.length){
  if(!items.length)return '<div class="empty">Chưa có dữ liệu.</div>';
  return `<table><thead><tr><th>Nội dung</th><th>Đường dẫn / thông tin</th><th>Trạng thái</th><th>Thứ tự</th><th style="text-align:right">Thao tác</th></tr></thead><tbody>${items.map((item,index)=>row(resource,item,index,offset,total)).join('')}</tbody></table>`;
}
function row(resource,item,index,offset,total){
  const name=item.title||item.name||item.email||item.path||item.url||'Không tên';
  const secondary=item.path||item.url||item.email||item.pagePath||item.company||'';
  const image=item.image||((resource==='media')?item.url:'');
  const notificationLabels={sent:'dịch vụ đã nhận',pending_activation:'chờ chủ hộp thư kích hoạt',failed:'gửi thất bại',not_configured:'chưa cấu hình'};
  const status=resource==='inquiries'?`${item.status||'new'} / email: ${notificationLabels[item.notificationStatus]||item.notificationStatus||'chưa gửi'}`:(item.enabled===false?'Đang tắt':'Đang bật');
  const statusClass=(item.enabled===false||['spam'].includes(item.status))?'off':'';
  const preview=item.path?`<a href="${esc(item.path)}" target="_blank">Xem ↗</a>`:image?`<a href="${esc(image)}" target="_blank">Ảnh ↗</a>`:'';
  const toggle=('enabled'in item)?`<button data-action="toggle" aria-label="${item.enabled===false?'Bật':'Tắt'} ${esc(name)}">${item.enabled===false?'Bật':'Tắt'}</button>`:'';
  const orderButtons=resource==='inquiries'?'':`<button data-action="up" aria-label="Di chuyển ${esc(name)} lên" ${offset+index===0?'disabled':''}>↑</button><button data-action="down" aria-label="Di chuyển ${esc(name)} xuống" ${offset+index===total-1?'disabled':''}>↓</button>`;
  return `<tr data-id="${item._id}"><td>${image?`<img class="thumb" src="${esc(image)}" alt="" loading="lazy" decoding="async">`:''}<b>${esc(name)}</b><small>${esc(item.type||item.kind||item.sourceType||'')}</small></td><td><small>${esc(secondary)}</small></td><td><span class="badge ${statusClass}">${esc(status||'new')}</span></td><td>${esc(item.sortOrder??'—')}</td><td><div class="actions">${preview}${toggle}${orderButtons}<button data-action="edit" aria-label="Sửa ${esc(name)}">Sửa</button><button data-action="delete" aria-label="Xoá ${esc(name)}">Xoá</button></div></td></tr>`;
}
function bindRows(resource){
  const body=$('#content tbody');if(!body)return;
  body.onclick=async event=>{
    const action=event.target.closest('[data-action]')?.dataset.action;if(!action)return;const id=event.target.closest('tr[data-id]')?.dataset.id;const item=state.items.find(entry=>entry._id===id);
    if(!item)return;
    try{
      if(action==='edit')return openEditor(resource,id);
      if(action==='delete')return removeItem(resource,item);
      if(action==='toggle'){loading(true);await api(`/${resource}/${id}`,{method:'PUT',body:{enabled:item.enabled===false}});toast('Đã cập nhật trạng thái.');return renderResource(resource);}
      if(action==='up'||action==='down'){
        loading(true);
        const {items}=await api(`/${resource}?idsOnly=true`);
        const ids=items.map(entry=>entry._id);
        const visibleIds=state.list.q?(await api(`/${resource}?idsOnly=true&q=${encodeURIComponent(state.list.q)}`)).items.map(entry=>entry._id):ids;
        const position=visibleIds.indexOf(id);
        const neighbor=visibleIds[position+(action==='up'?-1:1)];
        if(position<0||!neighbor)return;
        const first=ids.indexOf(id),second=ids.indexOf(neighbor);
        if(first<0||second<0)return;
        [ids[first],ids[second]]=[ids[second],ids[first]];
        await api(`/${resource}/reorder`,{method:'POST',body:{ids}});
        toast('Đã lưu thứ tự mới.');return renderResource(resource);
      }
    }catch(error){toast(error.message,'error');}finally{loading(false);}
  };
}
async function removeItem(resource,item){
  if(!confirm(`Xoá vĩnh viễn “${item.title||item.name||item.email||item.path}”? Thao tác này không thể hoàn tác.`))return;
  loading(true);try{await api(`/${resource}/${item._id}?confirm=true`,{method:'DELETE'});if(resource==='categories')state.categoriesLoaded=false;toast('Đã xoá nội dung.');await renderResource(resource);}catch(error){toast(error.message,'error');}finally{loading(false);}
}

async function openEditor(resource,id=null){
  loading(true);
  try{
    const needsCategories=(resource==='products'||resource==='categories')&&!state.categoriesLoaded;
    const needsProducts=resource==='categories'&&!state.productsLoaded;
    const [categories,products,detail]=await Promise.all([needsCategories?api('/categories?limit=500'):null,needsProducts?api('/products?limit=500'):null,id?api(`/${resource}/${id}`):null]);
    if(categories){state.categories=categories.items;state.categoriesLoaded=true;}
    if(products){state.products=products.items;state.productsLoaded=true;}
    const item=detail?.item||{enabled:true,sortOrder:state.list?.total??state.items.length};state.editing={resource,id,item};
    $('#editorEyebrow').textContent=titles[resource].toUpperCase();$('#editorTitle').textContent=id?'Chỉnh sửa':'Thêm mới';
    $('#editorFields').innerHTML=configs[resource].fields.map(field=>fieldHtml(field,item)).join('');
    bindImageInputs();bindRichEditors();$('#editorDialog').showModal();
  }catch(error){toast(error.message,'error');}finally{loading(false);}
}
function fieldHtml([name,label,type,required=false,options=[]],item){
  const value=getValue(item,name);const full=['textarea','textarea-tall','image'].includes(type);
  if(type==='readonly'||type==='readonly-tall')return `<label class="field full"><span>${esc(label)}</span>${type==='readonly-tall'?`<textarea readonly class="tall">${esc(value||'')}</textarea>`:`<input type="text" readonly value="${esc(value||'')}">`}</label>`;
  if(type==='checkbox')return `<label class="field check"><input data-path="${name}" type="checkbox" ${value!==false?'checked':''}> ${esc(label)}</label>`;
  if(type==='category-select')return `<label class="field"><span>${esc(label)}</span><select data-path="${name}"><option value="">— Không chọn —</option>${state.categories.filter(category=>category._id!==item._id).map(category=>`<option value="${esc(category._id)}" ${value===category._id?'selected':''}>${esc(category.name)} (${esc(category.path)})</option>`).join('')}</select></label>`;
  if(type==='product-multi-select'){const selected=new Set(Array.isArray(value)?value:[]);return `<label class="field full"><span>${esc(label)}</span><select data-path="${name}" multiple size="8" aria-label="${esc(label)}">${state.products.map(product=>`<option value="${esc(product.path)}" ${selected.has(product.path)?'selected':''}>${esc(product.name)} (${esc(product.path)})</option>`).join('')}</select><small>Giữ Ctrl/Cmd để chọn nhiều sản phẩm. Các sản phẩm có thể xuất hiện ở nhiều danh mục.</small></label>`;}
  if(type==='select')return `<label class="field"><span>${esc(label)}</span><select data-path="${name}" ${required?'required':''}>${options.map(option=>`<option value="${esc(option)}" ${value===option?'selected':''}>${esc(option)}</option>`).join('')}</select></label>`;
  if(type==='image')return `<div class="field full image-field" data-image-field="${name}" data-image-required="${required}" ${required?'aria-required="true"':''}><span>${esc(label)}${required?' *':''}</span><div class="image-inputs"><input class="image-url" aria-label="${esc(label)} bằng URL" placeholder="Nhập URL hoặc /đường-dẫn/ảnh.jpg" value="${esc(value||'')}"><input class="image-file" aria-label="${esc(label)} từ tệp" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"></div><small>${required?'Bắt buộc chọn một trong hai: nhập URL hoặc chọn file upload':'Chỉ dùng một nguồn: nhập URL hoặc chọn file upload'} (tối đa 10 MB).</small><img class="image-preview" src="${esc(value||'')}" alt="Xem trước ${esc(label)}"></div>`;
  if(type==='richtext'||type==='document-editor')return richEditorHtml(name,label,type,value,required);
  if(type.startsWith('textarea'))return `<label class="field full"><span>${esc(label)}${required?' *':''}</span><textarea data-path="${name}" class="${type==='textarea-tall'?'tall':''}" ${required?'required':''}>${esc(value||'')}</textarea></label>`;
  return `<label class="field ${full?'full':''}"><span>${esc(label)}${required?' *':''}</span><input data-path="${name}" type="${type}" value="${esc(value??'')}" ${name==='path'&&!required?'placeholder="Để trống để hệ thống tự tạo"':''} ${required?'required':''}></label>`;
}
function bindImageInputs(){
  document.querySelectorAll('.image-field').forEach(field=>{const url=field.querySelector('.image-url'),file=field.querySelector('.image-file'),preview=field.querySelector('.image-preview');
    url.addEventListener('input',()=>{if(url.value.trim())file.value='';preview.src=url.value.trim();});
    file.addEventListener('change',()=>{if(file.files[0]){url.value='';preview.src=URL.createObjectURL(file.files[0]);}});
  });
}
$('#closeEditor').onclick=$('#cancelEditor').onclick=()=>$('#editorDialog').close();
$('#editorForm').addEventListener('submit',async event=>{
  event.preventDefault();const {resource,id}=state.editing;loading(true);
  try{
    const payload={};$('#editorFields').querySelectorAll('[data-path]').forEach(input=>setValue(payload,input.dataset.path,input.multiple?[...input.selectedOptions].map(option=>option.value):input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value));
    $('#editorFields').querySelectorAll('[data-rich-path]').forEach(field=>setValue(payload,field.dataset.richPath,serializeRichField(field)));
    for(const field of $('#editorFields').querySelectorAll('[data-image-field]')){
      const name=field.dataset.imageField,url=field.querySelector('.image-url').value.trim(),file=field.querySelector('.image-file').files[0];
      if(url&&file)throw new Error('Mỗi ảnh chỉ được chọn URL hoặc file, không chọn cả hai.');
      if(field.dataset.imageRequired==='true'&&!url&&!file)throw new Error('Vui lòng nhập URL ảnh hoặc chọn một file ảnh đại diện.');
      if(file){if(file.size>10*1024*1024)throw new Error('Ảnh vượt quá 10 MB. Vui lòng chọn ảnh nhỏ hơn.');const form=new FormData();form.append('file',file);form.append('name',payload.title||payload.name||file.name);form.append('alt',payload.alt||payload.name||'');const uploadPath=resource==='media'&&id?`/media/${id}/upload`:'/media/upload';const uploaded=await api(uploadPath,{method:'POST',body:form});if(resource==='media'){$('#editorDialog').close();toast(id?'Đã thay ảnh và đồng bộ website.':'Đã tải ảnh lên thư viện.');await renderResource(resource);return;}setValue(payload,name,uploaded.item.url);}
      else setValue(payload,name,url);
    }
    await api(`/${resource}${id?`/${id}`:''}`,{method:id?'PUT':'POST',body:payload});if(resource==='categories')state.categoriesLoaded=false;$('#editorDialog').close();toast(id?'Đã lưu thay đổi.':'Đã tạo nội dung mới.');await renderResource(resource);
  }catch(error){toast(error.message,'error');}finally{loading(false);}
});

const settingFields=[['siteName','Tên website','text'],['phone','Điện thoại','text'],['mobile','Di động','text'],['fax','Fax','text'],['email','Email','email'],['secondaryEmail','Email phụ','email'],['whatsapp','WhatsApp (kèm mã quốc gia)','text'],['address','Địa chỉ','textarea'],['copyright','Copyright','text'],['defaultSeo.title','SEO title mặc định','text'],['defaultSeo.description','Meta description mặc định','textarea'],['defaultSeo.keywords','Meta keywords mặc định','textarea']];
async function renderSettings(navigation=state.navigation){
  const {item}=await api('/settings');
  if(navigation!==state.navigation)return;
  $('#content').innerHTML=`<form id="settingsForm" class="panel"><div class="panel-head"><h2>Thông tin liên hệ và SEO toàn site</h2></div><div class="form-grid settings-grid">${settingFields.map(field=>fieldHtml(field,item)).join('')}</div><div class="dialog-actions"><button class="primary" type="submit">Lưu & đồng bộ website</button></div></form>`;
  $('#settingsForm').onsubmit=async event=>{event.preventDefault();const payload={};event.currentTarget.querySelectorAll('[data-path]').forEach(input=>setValue(payload,input.dataset.path,input.value));loading(true);try{await api('/settings',{method:'PUT',body:payload});toast('Đã đồng bộ thông tin toàn website.');}catch(error){toast(error.message,'error');}finally{loading(false);}};
}

boot();

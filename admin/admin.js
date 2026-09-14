const $ = selector => document.querySelector(selector);
const PAGE_SIZE = 40;
const state = { view: 'dashboard', loadedView: null, dashboardCache: null, resourceCache: new Map(), items: [], categories: [], categoriesLoaded: false, list: null, listRequest: 0, listAbort: null, navigation: 0, searchTimer: null, editing: null, admin: null, toastTimer: null };
const titles = { dashboard:'Tổng quan',pages:'Trang & nội dung',sections:'Section',products:'Sản phẩm',services:'Dịch vụ',categories:'Danh mục',banners:'Banner',media:'Thư viện ảnh',settings:'Liên hệ & SEO',inquiries:'Yêu cầu khách hàng' };
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

const configs = {
  pages: { singular:'trang', fields:[
    ['title','Tiêu đề','text',true],['path','Đường dẫn (.html)','text',true],['type','Loại trang','select',true,['page','product','category']],['enabled','Đang hiển thị','checkbox'],['sortOrder','Thứ tự','number'],
    ['seo.title','SEO title','text'],['seo.description','Meta description','textarea'],['seo.keywords','Meta keywords','textarea'],['html','HTML toàn trang','textarea-tall',true]
  ]},
  sections:{singular:'section',fields:[['name','Tên section','text',true],['pagePath','Trang áp dụng','text',true],['selector','CSS selector','text',true],['mode','Cách áp dụng','select',true,['inner','replace']],['enabled','Đang hiển thị','checkbox'],['sortOrder','Thứ tự','number'],['html','HTML section','textarea-tall',true]]},
  products:{singular:'sản phẩm',fields:entityFields({withCategory:true,requireIdentity:false,requireImage:true})},
  services:{singular:'dịch vụ',fields:entityFields({withCategory:false,requireIdentity:true,requireImage:false})},
  categories:{singular:'danh mục',fields:[['name','Tên danh mục','text',true],['path','Đường dẫn (.html)','text',true],['parentId','Danh mục cha','category-select'],['kind','Nhóm','select',true,['product','service']],['enabled','Đang hiển thị','checkbox'],['sortOrder','Thứ tự','number'],['image','Ảnh đại diện','image'],['descriptionHtml','HTML mô tả','textarea-tall']]},
  banners:{singular:'banner',fields:[['title','Tên banner','text',true],['url','Liên kết','text',true],['alt','Alt ảnh','text'],['enabled','Đang hiển thị','checkbox'],['sortOrder','Thứ tự','number'],['image','Ảnh banner','image',true]]},
  media:{singular:'ảnh',fields:[['name','Tên ảnh','text',true],['alt','Alt ảnh','text'],['enabled','Đang sử dụng','checkbox'],['sortOrder','Thứ tự','number'],['url','Nguồn ảnh','image',true]]},
  inquiries:{singular:'yêu cầu',fields:[['status','Trạng thái','select',true,['new','processing','done','spam']]]},
};
function entityFields({withCategory,requireIdentity,requireImage}){const fields=[['name','Tên','text',requireIdentity],['path','Đường dẫn (.html)','text',requireIdentity]];if(withCategory)fields.push(['categoryId','Danh mục','category-select']);return [...fields,['enabled','Đang hiển thị','checkbox'],['sortOrder','Thứ tự','number'],['summary','Mô tả ngắn','textarea'],['image','Ảnh đại diện','image',requireImage],['descriptionHtml','HTML nội dung','textarea-tall'],['seo.title','SEO title','text'],['seo.description','Meta description','textarea'],['seo.keywords','Meta keywords','textarea']];}

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
$('#content').addEventListener('click',event=>{const card=event.target.closest('button.stat[data-view]');if(card)navigate(card.dataset.view);});
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
    if(navigation===state.navigation){state.loadedView=view;$('#viewTitle').textContent=titles[view];}
  }
  catch(error){if(navigation!==state.navigation||error.name==='AbortError')return;state.loadedView=null;$('#content').innerHTML=`<div class="panel empty">${esc(error.message)}</div>`;$('#viewTitle').textContent=titles[view];toast(error.message,'error');if(error.status===401)setTimeout(()=>location.reload(),800);}
  finally{if(navigation===state.navigation){$('#content').classList.remove('view-pending');$('#content').removeAttribute('aria-busy');$('#viewLoading').classList.add('hidden');}}
}

async function renderDashboard(navigation=state.navigation){
  const cached=state.dashboardCache;
  const counts=cached&&Date.now()-cached.at<15_000?cached.counts:(await api('/dashboard')).counts;
  if(navigation!==state.navigation)return;
  state.dashboardCache={counts,at:Date.now()};
  const cards=[['pages','Trang'],['sections','Section'],['products','Sản phẩm'],['services','Dịch vụ'],['categories','Danh mục'],['banners','Banner'],['media','Ảnh'],['inquiries','Yêu cầu khách hàng']];
  $('#content').innerHTML=`<div class="stats">${cards.map(([resource,label])=>`<button type="button" class="stat" data-view="${resource}" aria-label="Mở ${esc(titles[resource])}: ${Number(counts[resource]||0).toLocaleString('vi-VN')} mục"><strong>${Number(counts[resource]||0).toLocaleString('vi-VN')}</strong><span>${esc(label)}</span><span class="stat-arrow" aria-hidden="true">↗</span></button>`).join('')}</div>`;
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
  $('#content').innerHTML=`<div class="panel"><div class="toolbar"><input id="searchInput" placeholder="Tìm kiếm…" value="${esc(q)}"><button id="searchBtn" class="secondary">Tìm</button>${canAdd?`<button id="addBtn" class="primary">+ Thêm ${esc(configs[resource].singular)}</button>`:''}</div><div class="table-wrap">${table(resource,result.items,page*PAGE_SIZE,result.total)}</div><div class="pagination"><span>${result.total?`${skip+1}–${skip+result.items.length}`:'0'} / ${result.total} mục</span><div><button id="prevPage" class="secondary" ${page===0?'disabled':''}>← Trước</button><span>Trang ${totalPages?page+1:0}/${totalPages}</span><button id="nextPage" class="secondary" ${page+1>=totalPages?'disabled':''}>Tiếp →</button></div></div></div>`;
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

function table(resource,items,offset=0,total=items.length){
  if(!items.length)return '<div class="empty">Chưa có dữ liệu.</div>';
  return `<table><thead><tr><th>Nội dung</th><th>Đường dẫn / thông tin</th><th>Trạng thái</th><th>Thứ tự</th><th style="text-align:right">Thao tác</th></tr></thead><tbody>${items.map((item,index)=>row(resource,item,index,offset,total)).join('')}</tbody></table>`;
}
function row(resource,item,index,offset,total){
  const name=item.title||item.name||item.email||item.path||item.url||'Không tên';
  const secondary=item.path||item.url||item.email||item.pagePath||item.company||'';
  const image=item.image||((resource==='media')?item.url:'');
  const status=resource==='inquiries'?item.status:(item.enabled===false?'Đang tắt':'Đang bật');
  const statusClass=(item.enabled===false||['spam'].includes(item.status))?'off':'';
  const preview=item.path?`<a href="${esc(item.path)}" target="_blank">Xem ↗</a>`:image?`<a href="${esc(image)}" target="_blank">Ảnh ↗</a>`:'';
  const toggle=('enabled'in item)?`<button data-action="toggle">${item.enabled===false?'Bật':'Tắt'}</button>`:'';
  const orderButtons=resource==='inquiries'?'':`<button data-action="up" ${offset+index===0?'disabled':''}>↑</button><button data-action="down" ${offset+index===total-1?'disabled':''}>↓</button>`;
  return `<tr data-id="${item._id}"><td>${image?`<img class="thumb" src="${esc(image)}" alt="" loading="lazy" decoding="async">`:''}<b>${esc(name)}</b><small>${esc(item.type||item.kind||item.sourceType||'')}</small></td><td><small>${esc(secondary)}</small></td><td><span class="badge ${statusClass}">${esc(status||'new')}</span></td><td>${esc(item.sortOrder??'—')}</td><td><div class="actions">${preview}${toggle}${orderButtons}<button data-action="edit">Sửa</button><button data-action="delete">Xoá</button></div></td></tr>`;
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
    const [categories,detail]=await Promise.all([needsCategories?api('/categories?limit=500'):null,id?api(`/${resource}/${id}`):null]);
    if(categories){state.categories=categories.items;state.categoriesLoaded=true;}
    const item=detail?.item||{enabled:true,sortOrder:state.list?.total??state.items.length};state.editing={resource,id,item};
    $('#editorEyebrow').textContent=titles[resource].toUpperCase();$('#editorTitle').textContent=id?'Chỉnh sửa':'Thêm mới';
    $('#editorFields').innerHTML=configs[resource].fields.map(field=>fieldHtml(field,item)).join('');
    bindImageInputs();$('#editorDialog').showModal();
  }catch(error){toast(error.message,'error');}finally{loading(false);}
}
function fieldHtml([name,label,type,required=false,options=[]],item){
  const value=getValue(item,name);const full=['textarea','textarea-tall','image'].includes(type);
  if(type==='checkbox')return `<label class="field check"><input data-path="${name}" type="checkbox" ${value!==false?'checked':''}> ${esc(label)}</label>`;
  if(type==='category-select')return `<label class="field"><span>${esc(label)}</span><select data-path="${name}"><option value="">— Không chọn —</option>${state.categories.filter(category=>category._id!==item._id).map(category=>`<option value="${esc(category._id)}" ${value===category._id?'selected':''}>${esc(category.name)} (${esc(category.path)})</option>`).join('')}</select></label>`;
  if(type==='select')return `<label class="field"><span>${esc(label)}</span><select data-path="${name}" ${required?'required':''}>${options.map(option=>`<option value="${esc(option)}" ${value===option?'selected':''}>${esc(option)}</option>`).join('')}</select></label>`;
  if(type==='image')return `<div class="field full image-field" data-image-field="${name}" data-image-required="${required}" ${required?'aria-required="true"':''}><span>${esc(label)}${required?' *':''}</span><div class="image-inputs"><input class="image-url" placeholder="Nhập URL hoặc /đường-dẫn/ảnh.jpg" value="${esc(value||'')}"><input class="image-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"></div><small>${required?'Bắt buộc chọn một trong hai: nhập URL hoặc chọn file upload':'Chỉ dùng một nguồn: nhập URL hoặc chọn file upload'} (tối đa 10 MB).</small><img class="image-preview" src="${esc(value||'')}" alt="Preview"></div>`;
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
    const payload={};$('#editorFields').querySelectorAll('[data-path]').forEach(input=>setValue(payload,input.dataset.path,input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value));
    for(const field of $('#editorFields').querySelectorAll('[data-image-field]')){
      const name=field.dataset.imageField,url=field.querySelector('.image-url').value.trim(),file=field.querySelector('.image-file').files[0];
      if(url&&file)throw new Error('Mỗi ảnh chỉ được chọn URL hoặc file, không chọn cả hai.');
      if(field.dataset.imageRequired==='true'&&!url&&!file)throw new Error('Vui lòng nhập URL ảnh hoặc chọn một file ảnh đại diện.');
      if(file){if(file.size>10*1024*1024)throw new Error('Ảnh vượt quá 10 MB. Vui lòng chọn ảnh nhỏ hơn.');const form=new FormData();form.append('file',file);form.append('name',payload.title||payload.name||file.name);form.append('alt',payload.alt||payload.name||'');const uploaded=await api('/media/upload',{method:'POST',body:form});setValue(payload,name,uploaded.item.url);}
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

/* Adapters for services whose private server source is not publicly available. */
(() => {
  'use strict';
  // Vietnamese is the site's only edition, so every route lives at the root.
  // The third message is what a visitor sees when no inquiry endpoint is
  // reachable (a purely static deployment): give them the direct channels
  // rather than a dead end, so the enquiry is not simply lost.
  const messages=[
    'Yêu cầu của quý khách đã được lưu lại. Hệ thống chưa gửi email.',
    'Vui lòng nhập họ tên, địa chỉ email hợp lệ và nội dung tin nhắn.',
    'Hiện chưa gửi được yêu cầu trực tuyến. Quý khách vui lòng liên hệ trực tiếp: Điện thoại +86-21-50911019, WhatsApp +86-18616619098, Email info@shjoylong.com.'
  ];
  // Optional WebMCP integration mirrors the visible search and inquiry actions.
  const modelContext=document.modelContext;
  if(modelContext?.registerTool){
    try {
      modelContext.registerTool({name:'search_products',title:'Search products',description:'Tìm kiếm trang sản phẩm và trang giới thiệu của Joylong.',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},async execute(input){
        const q=String(input?.query||'').trim();if(!q)throw new Error('query is required');return fetch('/api/search?q='+encodeURIComponent(q)).then(r=>r.json());
      }});
      modelContext.registerTool({name:'submit_inquiry',title:'Submit inquiry',description:'Save an inquiry through the visible local contact form.',inputSchema:{type:'object',properties:{name:{type:'string'},email:{type:'string'},message:{type:'string'}},required:['name','email','message'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},async execute(input){
        const payload={Name:String(input?.name||''),Email:String(input?.email||''),Message:String(input?.message||''),page:location.pathname};const r=await fetch('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await r.json();if(!r.ok)throw new Error(result.error||'Unable to save inquiry');return result;
      }});
    } catch (error) { console.warn('WebMCP registration unavailable',error); }
  }
  function notice(text) {
    if(window._crmAlertText){window._crmAlertText(1,text);return;}
    const box=document.createElement('dialog');
    const content=document.createElement('p');content.textContent=text;
    const close=document.createElement('button');close.type='button';close.textContent='OK';close.onclick=()=>box.close();
    box.append(content,close);document.body.append(box);box.addEventListener('close',()=>box.remove());box.showModal();
  }
  document.addEventListener('submit',async event=>{
    const form=event.target;
    if(!(form instanceof HTMLFormElement))return;
    const fields=new FormData(form);
    if(form.matches('.searchForm')||fields.has('keyword')) {
      event.preventDefault();event.stopImmediatePropagation();
      location.href='/search.html?q='+encodeURIComponent(fields.get('keyword')||'');return;
    }
    if(!form.closest('.crm-form')&&!fields.has('Message'))return;
    event.preventDefault();event.stopImmediatePropagation();
    const payload=Object.fromEntries(fields);payload.page=location.pathname;
    if(!String(payload.Name||'').trim()||!/^\S+@\S+\.\S+$/.test(String(payload.Email||'').trim())||!String(payload.Message||'').trim()) {
      notice(messages[1]);return;
    }
    const button=form.querySelector('[type="submit"]');if(button?.disabled)return;
    if(button)button.disabled=true;
    try {
      const result=await fetch('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(!result.ok)throw new Error('Save failed');
      form.reset();notice(messages[0]);
    }catch{notice(messages[2]);}finally{if(button)button.disabled=false;}
  },true);
  // Enable keyboard access to the original hover navigation without changing its look.
  document.querySelectorAll('.smartmenu li').forEach(item=>{
    item.addEventListener('focusin',()=>{const menu=item.querySelector(':scope > ul');if(menu)menu.style.display='block';});
    item.addEventListener('focusout',e=>{if(!item.contains(e.relatedTarget)){const menu=item.querySelector(':scope > ul');if(menu)menu.style.display='none';}});
  });
})();

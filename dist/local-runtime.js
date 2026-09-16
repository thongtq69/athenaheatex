/* Adapters for services whose private server source is not publicly available. */
(() => {
  'use strict';
  // Vietnamese is the site's only edition, so every route lives at the root.
  // The server normally supplies the wording; these are fallbacks. The third is
  // shown when the inquiry endpoint cannot be reached, so the visitor gets the
  // direct channels instead of a dead end and the enquiry is not simply lost.
  const messages=[
    'Cảm ơn quý khách! Yêu cầu đã được gửi thành công, chúng tôi sẽ phản hồi trong thời gian sớm nhất.',
    'Vui lòng nhập họ tên, địa chỉ email hợp lệ và nội dung tin nhắn.',
    'Hiện chưa gửi được yêu cầu trực tuyến. Quý khách vui lòng liên hệ trực tiếp: Điện thoại +84 912 7676 85, Email sales@athenatech.com.vn.'
  ];
  async function sendInquiry(payload){
    const response=await fetch('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||messages[2]);
    if(result.notification!=='client_required')return result;
    let notification='failed';
    try{
      const text=[`Yêu cầu liên hệ mới trên Athena Heat Ex (mã ${result.id})`,`Họ tên: ${payload.Name||''}`,`Email: ${payload.Email||''}`,`Công ty: ${payload.Company||''}`,`Quốc gia: ${payload.Country||''}`,`Điện thoại: ${payload.Tel||''}`,`Trang gửi: ${payload.page||location.pathname}`,'Nội dung:',String(payload.Message||'')].join('\n');
      const sent=await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(result.notificationRecipient)}`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:String(payload.Name||''),email:String(payload.Email||''),message:text,
          _subject:`Yêu cầu liên hệ mới từ ${payload.Name||''}`,_url:location.href,_captcha:'false'})
      });
      const answer=await sent.json();
      if(sent.ok&&(answer.success===true||answer.success==='true'))notification='sent';
      else if(/needs activation|activate form/i.test(String(answer.message||'')))notification='pending_activation';
    }catch(error){console.warn('Không chuyển tiếp được email thông báo:',error);}
    try{
      const report=await fetch('/api/inquiries',{method:'PATCH',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:result.id,notificationToken:result.notificationToken,notification})});
      const updated=await report.json();
      if(report.ok)return {...result,notification,message:updated.message,notificationToken:undefined};
      console.warn('Không cập nhật được trạng thái email trong Admin:',updated.error);
    }catch(error){console.warn('Không cập nhật được trạng thái email trong Admin:',error);}
    return {...result,notification,message:notification==='pending_activation'?'Yêu cầu đã được lưu. Email thông báo đang chờ chủ hộp thư xác nhận kích hoạt.':notification==='sent'?messages[0]:'Yêu cầu đã được lưu, nhưng email thông báo chưa được gửi.',notificationToken:undefined};
  }
  // Optional WebMCP integration mirrors the visible search and inquiry actions.
  const modelContext=document.modelContext;
  if(modelContext?.registerTool){
    try {
      // Search reads the static index: there is no /api/search on the deployed site.
      modelContext.registerTool({name:'search_products',title:'Tìm kiếm sản phẩm',description:'Tìm kiếm trang sản phẩm và trang giới thiệu của ATHENA HEATEX.',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},async execute(input){
        const q=String(input?.query||'').trim().toLowerCase();if(!q)throw new Error('Thiếu từ khóa tìm kiếm');
        const terms=q.split(/\s+/).filter(Boolean);const index=await fetch('/search-index.json').then(r=>r.json());
        const found=index.filter(x=>terms.every(t=>(x.title+' '+x.text).toLowerCase().includes(t)));
        return {query:q,total:found.length,results:found.slice(0,20).map(({text,...x})=>({...x,snippet:text.slice(0,260)}))};
      }});
      modelContext.registerTool({name:'submit_inquiry',title:'Gửi yêu cầu',description:'Gửi yêu cầu báo giá qua biểu mẫu liên hệ của website.',inputSchema:{type:'object',properties:{name:{type:'string'},email:{type:'string'},message:{type:'string'}},required:['name','email','message'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},async execute(input){
        const payload={Name:String(input?.name||''),Email:String(input?.email||''),Message:String(input?.message||''),page:location.pathname};return sendInquiry(payload);
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
  function copyContactValue(value){
    if(navigator.clipboard?.writeText){navigator.clipboard.writeText(value).catch(()=>{});return;}
    const field=document.createElement('textarea');field.value=value;field.setAttribute('readonly','');field.style.position='fixed';field.style.opacity='0';
    document.body.append(field);field.select();try{document.execCommand('copy');}catch{}field.remove();
  }
  document.addEventListener('click',event=>{
    const link=event.target.closest?.('a[data-contact-kind="wechat"][href^="weixin:"]');
    if(!link)return;
    event.preventDefault();
    const value=String(link.dataset.contactValue||'+84 912 76 76 85');
    copyContactValue(value);
    window.location.href=link.href;
    setTimeout(()=>{
      if(document.visibilityState==='visible'&&document.hasFocus())notice(`Đã sao chép số/ID WeChat ${value}. Nếu ứng dụng chưa tự mở, hãy mở WeChat, chọn Add Contacts và dán số/ID này.`);
    },900);
  });
  document.addEventListener('submit',async event=>{
    const form=event.target;
    if(!(form instanceof HTMLFormElement))return;
    const fields=new FormData(form);
    if(form.matches('.searchForm')||fields.has('keyword')) {
      event.preventDefault();event.stopImmediatePropagation();
      location.href='/tim-kiem?q='+encodeURIComponent(fields.get('keyword')||'');return;
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
      const result=await sendInquiry(payload);
      form.reset();notice(result.message||messages[0]);
    }catch(error){notice(error.message||messages[2]);}finally{if(button)button.disabled=false;}
  },true);
  // Enable keyboard access to the original hover navigation without changing its look.
  document.querySelectorAll('.smartmenu li').forEach(item=>{
    item.addEventListener('focusin',()=>{const menu=item.querySelector(':scope > ul');if(menu)menu.style.display='block';});
    item.addEventListener('focusout',e=>{if(!item.contains(e.relatedTarget)){const menu=item.querySelector(':scope > ul');if(menu)menu.style.display='none';}});
  });
})();

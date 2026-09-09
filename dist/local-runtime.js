/* Adapters for services whose private server source is not publicly available. */
(() => {
  'use strict';
  const lang=location.pathname.match(/^\/languages\/([a-z]+)\//)?.[1]||'en';
  const prefix=lang==='en'?'':'/languages/'+lang;
  const messages={
    en:['Your inquiry has been saved locally. It has not been emailed.','Please enter your name, a valid email address, and a message.','Unable to save your inquiry. Please try again.'],
    fr:['Votre demande a été enregistrée localement. Aucun e-mail n’a été envoyé.','Veuillez saisir votre nom, une adresse e-mail valide et un message.','Impossible d’enregistrer votre demande. Réessayez.'],
    es:['Su consulta se ha guardado localmente. No se ha enviado por correo.','Introduzca su nombre, un correo válido y un mensaje.','No se pudo guardar. Inténtelo de nuevo.'],
    ru:['Ваш запрос сохранён локально. Письмо не отправлено.','Укажите имя, корректный email и сообщение.','Не удалось сохранить запрос. Повторите попытку.'],
    cn:['您的咨询已保存在本机，尚未发送电子邮件。','请输入姓名、有效的电子邮件地址和留言。','保存失败，请重试。'],
    al:['تم حفظ استفسارك محليًا. لم يتم إرساله بالبريد الإلكتروني.','يرجى إدخال الاسم وبريد إلكتروني صالح ورسالة.','تعذر حفظ الاستفسار. حاول مرة أخرى.']
  }[lang]||[];
  // Optional WebMCP integration mirrors the visible search and inquiry actions.
  const modelContext=document.modelContext;
  if(modelContext?.registerTool){
    try {
      modelContext.registerTool({name:'search_products',title:'Search products',description:'Search mirrored Joylong product and company pages.',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},async execute(input){
        const q=String(input?.query||'').trim();if(!q)throw new Error('query is required');return fetch('/api/search?q='+encodeURIComponent(q)+'&lang='+lang).then(r=>r.json());
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
      location.href=prefix+'/search.html?q='+encodeURIComponent(fields.get('keyword')||'');return;
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

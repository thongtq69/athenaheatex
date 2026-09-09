(() => {
  const config=window.localSearchConfig;
  const params=new URLSearchParams(location.search);
  const query=(params.get('q')||'').trim();
  const page=Math.max(1,Number.parseInt(params.get('page')||'1',10)||1);
  const input=document.querySelector('#local-search input');input.value=query;
  const status=document.querySelector('#search-status');
  const results=document.querySelector('#search-results');
  fetch('/api/search?q='+encodeURIComponent(query)+'&lang='+config.lang)
    .then(response=>{if(!response.ok)throw new Error();return response.json();})
    .then(data=>{
      status.textContent=query?`${config.label}: “${query}” (${data.total})`:config.label;
      if(!data.total){if(query)status.textContent+=' — '+config.empty;return;}
      const pageCount=Math.ceil(data.total/15),current=Math.min(page,pageCount);
      for(const record of data.results.slice((current-1)*15,current*15)) {
        const item=document.createElement('li');item.className='box';
        const link=document.createElement('a');link.href=record.path;
        if(record.image){const image=document.createElement('img');image.src=record.image;image.alt=record.title;image.loading='lazy';link.append(image);}
        const title=document.createElement('span');title.textContent=record.title;link.append(title);item.append(link);results.append(item);
      }
      const pagination=document.querySelector('#pageNum');
      for(let i=1;i<=pageCount;i++) {
        const link=document.createElement(i===current?'span':'a');
        link.textContent=i;
        if(i!==current)link.href='?q='+encodeURIComponent(query)+'&page='+i;
        else link.setAttribute('aria-current','page');
        pagination.append(link,document.createTextNode(' '));
      }
    }).catch(()=>{status.textContent='Search is unavailable. Please try again.';});
})();

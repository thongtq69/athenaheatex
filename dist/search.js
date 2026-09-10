/* Site search. The index is a static JSON file shipped with the site, so search
   works on a plain static host with no API behind it. */
(() => {
  const config=window.localSearchConfig||{};
  const params=new URLSearchParams(location.search);
  // ?keyword= is what the header form submits when JavaScript has not loaded.
  const query=(params.get('q')||params.get('keyword')||'').trim();
  const page=Math.max(1,Number.parseInt(params.get('page')||'1',10)||1);
  const perPage=15;
  const input=document.querySelector('#local-search input');if(input)input.value=query;
  const status=document.querySelector('#search-status');
  const results=document.querySelector('#search-results');
  const pagination=document.querySelector('#pageNum');

  const fold=text=>String(text).toLowerCase();
  function search(index,text) {
    const terms=fold(text).split(/\s+/).filter(Boolean);
    if(!terms.length)return[];
    return index
      .map(record=>({record,haystack:fold(record.title+' '+record.text)}))
      .filter(({haystack})=>terms.every(term=>haystack.includes(term)))
      .map(({record})=>({...record,score:terms.reduce((total,term)=>total+(fold(record.title).includes(term)?10:1),0)}))
      .sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title,'vi'));
  }

  function render(found) {
    status.textContent=query?`${config.label||'Tìm kiếm'}: “${query}” (${found.length})`:(config.label||'Tìm kiếm');
    if(!found.length){if(query)status.textContent+=' — '+(config.empty||'Không tìm thấy kết quả.');return;}
    const pageCount=Math.max(1,Math.ceil(found.length/perPage)),current=Math.min(page,pageCount);
    for(const record of found.slice((current-1)*perPage,current*perPage)) {
      const item=document.createElement('li');item.className='box';
      const link=document.createElement('a');link.href=record.path;
      if(record.image){const image=document.createElement('img');image.src=record.image;image.alt=record.title;image.loading='lazy';link.append(image);}
      const title=document.createElement('span');title.textContent=record.title;link.append(title);item.append(link);results.append(item);
    }
    for(let i=1;i<=pageCount;i++) {
      const link=document.createElement(i===current?'span':'a');
      link.textContent=i;
      if(i!==current)link.href='?q='+encodeURIComponent(query)+'&page='+i;
      else link.setAttribute('aria-current','page');
      pagination.append(link,document.createTextNode(' '));
    }
  }

  fetch('/search-index.json')
    .then(response=>{if(!response.ok)throw new Error('index unavailable');return response.json();})
    .then(index=>render(search(index,query)))
    .catch(()=>{status.textContent=config.error||'Không thể tìm kiếm lúc này. Vui lòng thử lại.';});
})();

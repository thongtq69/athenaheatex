import { load } from 'cheerio';

function normalizeTree($, fallbackAlt) {
  let changed = false;
  $('link[href="https://jimeishcn.com/templates/default/css/chat.css"]').each((_, node) => {
    $(node).remove();
    changed = true;
  });
  $('img').each((_, node) => {
    if (!String($(node).attr('alt') || '').trim()) {
      $(node).attr('alt', fallbackAlt || 'Athena Heat Ex');
      changed = true;
    }
  });
  $('.crm-form form').each((_, node) => {
    if ($(node).attr('action') !== '/api/inquiries') {
      $(node).attr('action', '/api/inquiries');
      changed = true;
    }
    if (String($(node).attr('method') || '').toLowerCase() !== 'post') {
      $(node).attr('method', 'post');
      changed = true;
    }
  });
  $('form[role="search"]').each((_, node) => {
    if ($(node).attr('action') !== '/tim-kiem') {
      $(node).attr('action', '/tim-kiem');
      changed = true;
    }
    if (String($(node).attr('method') || '').toLowerCase() !== 'get') {
      $(node).attr('method', 'get');
      changed = true;
    }
  });
  $('input:not([type="hidden"]),textarea,select').each((_, node) => {
    const field = $(node);
    const hasLabel = Boolean(field.attr('aria-label') || field.attr('aria-labelledby') || field.attr('id') && $(`label[for="${field.attr('id')}"]`).length);
    const placeholder = String(field.attr('placeholder') || '').trim();
    const name = String(field.attr('name') || '').trim();
    const label = placeholder.replace(/^\*+\s*/, '') || ({ Name: 'Họ tên', Email: 'E-mail', Message: 'Lời nhắn', keyword: 'Tìm kiếm' }[name]) || name;
    if (!hasLabel && label) {
      field.attr('aria-label', label);
      changed = true;
    }
    if (placeholder.startsWith('*') && field.attr('required') === undefined) {
      field.attr('required', '');
      changed = true;
    }
    if (name.toLowerCase() === 'email' && String(field.attr('type') || '').toLowerCase() !== 'email') {
      field.attr({ type: 'email', autocomplete: 'email' });
      changed = true;
    }
    if (name.toLowerCase() === 'name' && !field.attr('autocomplete')) {
      field.attr('autocomplete', 'name');
      changed = true;
    }
  });
  $('.searchForm button, form[role="search"] button').each((_, node) => {
    if (!$(node).attr('aria-label')) {
      $(node).attr('aria-label', 'Tìm kiếm');
      changed = true;
    }
  });
  const socialLabels = [
    ['facebook.com', 'Facebook'], ['twitter.com', 'X/Twitter'], ['youtube.com', 'YouTube'],
    ['linkedin.com', 'LinkedIn'], ['wa.me', 'WhatsApp'], ['whatsapp.com', 'WhatsApp'],
  ];
  $('a[href]').each((_, node) => {
    const link = $(node);
    if (link.attr('aria-label')) return;
    const href = String(link.attr('href') || '').toLowerCase();
    const match = socialLabels.find(([host]) => href.includes(host));
    if (match) {
      link.attr('aria-label', match[1]);
      changed = true;
    }
  });
  const ids = new Set();
  $('[id]').each((_, node) => {
    const id = $(node).attr('id');
    if (ids.has(id)) {
      $(node).removeAttr('id');
      changed = true;
    } else {
      ids.add(id);
    }
  });
  return changed;
}

export function normalizeDocumentHtml(html, fallbackAlt = 'Athena Heat Ex') {
  const source = String(html || '');
  const $ = load(source, { decodeEntities: false });
  let changed = normalizeTree($, fallbackAlt);
  if (!$('h1').length) {
    const target = $('#main,.mainpage,#content,body').first();
    if (target.length) {
      target.prepend($('<h1 class="cms-visually-hidden">').attr('style', 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0').text(fallbackAlt || 'Athena Heat Ex'));
      changed = true;
    }
  }
  return changed ? $.html() : source;
}

export function normalizeFragmentHtml(html, fallbackAlt = 'Athena Heat Ex') {
  const source = String(html || '');
  const $ = load(source, { decodeEntities: false }, false);
  return normalizeTree($, fallbackAlt) ? $.root().html() : source;
}

export const ATHENA_BRAND = 'ATHENA HEATEX';
export const ATHENA_PHONE = '+84 912 76 76 85';
export const ATHENA_EMAIL = 'sales@athenatech.com.vn';

export const ATHENA_CONTACT_DEFAULTS = Object.freeze({
  siteName: ATHENA_BRAND,
  phone: ATHENA_PHONE,
  mobile: ATHENA_PHONE,
  fax: '',
  email: ATHENA_EMAIL,
  secondaryEmail: '',
  whatsapp: ATHENA_PHONE,
  whatsappUrl: 'https://wa.me/84912767685',
  zalo: ATHENA_PHONE,
  zaloUrl: 'https://zalo.me/84912767685',
  wechat: ATHENA_PHONE,
  wechatUrl: 'weixin://dl/chat?84912767685',
  socialLinks: [],
});

const BRAND_PATTERNS = [
  [/Shanghai\s+Joylong\s+Industry\s+Co\.?\s*,?\s*Ltd\.?/gi, ATHENA_BRAND],
  [/China\s+Joylong\s+Group\s+Co\.?\s*,?\s*Ltd\.?/gi, ATHENA_BRAND],
  [/Shanghai\s+Joylong\s+Industry/gi, ATHENA_BRAND],
  [/\bJoylong\b/gi, ATHENA_BRAND],
  [/shjoylong(?:\.com)?/gi, 'athenatech.com.vn'],
];

export function replaceLegacyBrand(value) {
  let output = String(value ?? '');
  for (const [pattern, replacement] of BRAND_PATTERNS) output = output.replace(pattern, replacement);
  return output;
}

export function replaceLegacyContact(value) {
  return String(value ?? '')
    .replace(/(?:info|sales)@shjoylong\.com/gi, ATHENA_EMAIL)
    .replace(/shjoylong@(gmail|hotmail)\.com/gi, ATHENA_EMAIL)
    .replace(/info@athenatech\.com\.vn/gi, ATHENA_EMAIL)
    .replace(/athenatech\.com\.vn@(gmail|hotmail)\.com/gi, ATHENA_EMAIL)
    .replace(/\+?86[-\s]?18616619098/gi, ATHENA_PHONE)
    .replace(/(?:\+?86[-\s]?0086|0086)18616619098/gi, ATHENA_PHONE)
    .replace(/\+?86[-\s]?21[-\s]?509110(?:19|20|21)/gi, ATHENA_PHONE);
}

export function replaceLegacySiteText(value) {
  return replaceLegacyBrand(replaceLegacyContact(value))
    // These are technical source paths/assets, not visitor-facing branding.
    // Preserve them so the friendly-URL mapper and mirrored image fallback work.
    .replace(/ATHENA HEATEX-manufacturing-workshop/gi, 'joylong-manufacturing-workshop')
    .replace(/https?:\/\/(?:www\.)?athenatech\.com\.vn\/upfile/gi, 'https://www.shjoylong.com/upfile');
}

export function rebrandTree($) {
  let changed = false;
  $('*').contents().each((_, node) => {
    if (node.type !== 'text') return;
    const parent = node.parent?.name?.toLowerCase();
    if (parent === 'script' || parent === 'style') return;
    const next = replaceLegacySiteText(node.data);
    if (next !== node.data) { node.data = next; changed = true; }
  });
  $('[title],[alt],meta[content],input[value]').each((_, node) => {
    for (const attribute of ['title', 'alt', 'content', 'value']) {
      const current = $(node).attr(attribute);
      if (current === undefined) continue;
      const next = replaceLegacySiteText(current);
      if (next !== current) { $(node).attr(attribute, next); changed = true; }
    }
  });
  $('a[href]').each((_, node) => {
    const current = String($(node).attr('href') || '');
    let next = current;
    if (/^mailto:/i.test(current)) next = `mailto:${replaceLegacySiteText(current.slice(7))}`;
    else if (/^tel:/i.test(current) && /(?:8618616619098|8621509110(?:19|20|21))/i.test(current.replace(/\D/g, ''))) next = `tel:${ATHENA_PHONE}`;
    else if (/(?:wa\.me|whatsapp\.com|api\.whatsapp\.com)/i.test(current) && /8618616619098/.test(current.replace(/\D/g, ''))) next = 'https://wa.me/84912767685';
    if (next !== current) { $(node).attr('href', next); changed = true; }
  });
  return changed;
}

export function contactUrl(kind, value, explicitUrl = '') {
  if (String(explicitUrl || '').trim()) return String(explicitUrl).trim();
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (kind === 'whatsapp') return `https://wa.me/${digits}`;
  if (kind === 'zalo') return `https://zalo.me/${digits}`;
  if (kind === 'wechat') return `weixin://dl/chat?${digits}`;
  return '';
}

export function contactChannels(settings = {}) {
  return [
    { kind: 'whatsapp', label: 'WhatsApp', value: settings.whatsapp, url: contactUrl('whatsapp', settings.whatsapp, settings.whatsappUrl) },
    { kind: 'zalo', label: 'Zalo', value: settings.zalo, url: contactUrl('zalo', settings.zalo, settings.zaloUrl) },
    { kind: 'wechat', label: 'WeChat', value: settings.wechat, url: contactUrl('wechat', settings.wechat, settings.wechatUrl) },
  ].filter(channel => channel.value && channel.url);
}

export function channelIcon(kind) {
  if (kind === 'whatsapp') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a9.6 9.6 0 0 0-8.2 14.6L2.5 21.5l5-1.3A9.7 9.7 0 1 0 12 2Zm0 17.5a7.8 7.8 0 0 1-4-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A7.8 7.8 0 1 1 12 19.5Zm4.3-5.8c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-1.4-.7-2.4-1.3-3.3-3-.2-.3.2-.5.6-1 .1-.2.1-.4 0-.5L9.4 8c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.5-.4l-1.4-.7Z"/></svg>';
  if (kind === 'wechat') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 4C5.9 4 3 6.4 3 9.3c0 1.6.9 3.1 2.3 4.1l-.6 2.1 2.4-1.2c.7.2 1.5.3 2.4.3h.4a5.7 5.7 0 0 1-.1-1.1c0-3.1 2.7-5.7 6.2-6.2C15 5.3 12.5 4 9.5 4Zm-2.2 3.1c.5 0 .8.3.8.8s-.3.8-.8.8-.9-.3-.9-.8.4-.8.9-.8Zm4.4 0c.5 0 .9.3.9.8s-.4.8-.9.8-.8-.3-.8-.8.3-.8.8-.8ZM16 8.5c-2.9 0-5.2 2-5.2 4.5s2.3 4.5 5.2 4.5c.7 0 1.3-.1 1.9-.3l1.9 1-.5-1.8c1.1-.9 1.8-2.1 1.8-3.4 0-2.5-2.3-4.5-5.1-4.5Zm-1.8 2.7c-.4 0-.7-.3-.7-.7 0-.3.3-.6.7-.6s.7.3.7.6c0 .4-.3.7-.7.7Zm3.6 0c-.4 0-.7-.3-.7-.7 0-.3.3-.6.7-.6s.7.3.7.6c0 .4-.3.7-.7.7Z"/></svg>';
  return '<span aria-hidden="true">Zalo</span>';
}

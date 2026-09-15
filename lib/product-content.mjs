import { load } from 'cheerio';

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();

// Imported product pages keep the three tabs inside one legacy HTML fragment.
// Split that fragment only for the editor; the original page stays untouched
// until the administrator explicitly saves it.
export function extractProductContent(fragment = '', pageHtml = '') {
  const $ = load(`<div id="cms-source">${fragment}</div>`, { decodeEntities: false });
  const tabs = $('#cms-source #tagContent > .tagContent');
  const descriptionHtml = tabs.length ? (tabs.eq(0).html() || '') : fragment;
  const specifications = [];
  tabs.eq(1).find('tr').each((_, row) => {
    const cells = $(row).children('th,td');
    if (cells.length < 2) return;
    const label = clean(cells.eq(0).text());
    const value = clean(cells.slice(1).map((__, cell) => $(cell).text()).get().join(' / '));
    if (label || value) specifications.push({ label, value });
  });
  const videos = [];
  tabs.eq(2).find('a[href],iframe[src],video[src],video source[src]').each((_, node) => {
    const url = clean($(node).attr('href') || $(node).attr('src'));
    if (url && !videos.some(video => video.url === url)) videos.push({ url, thumbnail: clean($(node).find('img').first().attr('src')) });
  });
  const page = load(pageHtml || '', { decodeEntities: false });
  const mainImage = clean(page('#proimg img').first().attr('src'));
  const gallery = [...new Set(page('.spec-list img').map((_, node) => clean(page(node).attr('src'))).get().filter(url => url && url !== mainImage))];
  return { descriptionHtml, specifications, videos, gallery };
}

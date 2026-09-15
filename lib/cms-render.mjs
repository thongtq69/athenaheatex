import { load } from 'cheerio';
import { CMS, ensureCmsSeeded } from './cms.mjs';
import { normalizeDocumentHtml, normalizePagination } from './html-normalize.mjs';
import { getDb } from './mongodb.mjs';
import { publicPathForSourcePath, rewritePublicLinks, sourcePathForPublicPath } from './public-paths.mjs';

const safePath = value => String(value || '').startsWith('/') ? String(value) : '/' + String(value || '');

function setMeta($, name, value) {
  if (!value) return;
  let node = $(`meta[name="${name}"]`).first();
  if (!node.length) {
    $('head').append(`<meta name="${name}">`);
    node = $(`meta[name="${name}"]`).last();
  }
  node.attr('content', value);
}

function applySeo($, seo = {}, defaults = {}) {
  const values = { ...defaults, ...Object.fromEntries(Object.entries(seo || {}).filter(([, value]) => value)) };
  if (values.title) $('title').text(values.title);
  setMeta($, 'description', values.description);
  setMeta($, 'keywords', values.keywords);
}

function renderContact($, settings = {}) {
  const { phone = '', mobile = '', fax = '', email = '', secondaryEmail = '', address = '', whatsapp = '', copyright = '' } = settings;
  if (phone || email) {
    const list = $('#header .contop').empty();
    if (phone) list.append($('<li>').append($('<a class="tel-number">').attr({ href: `tel:${phone}`, title: phone }).text(phone)));
    if (email) list.append($('<li>').append($('<a>').attr('href', `mailto:${email}`).text(email)));
  }
  const footer = $('.footContact dl');
  if (footer.length) {
    footer.empty();
    if (phone) footer.append('<dd>Điện thoại: </dd>').children().last().append($('<a class="tel-number">').attr({ href: `tel:${phone}`, title: phone }).text(phone));
    if (fax) footer.append($('<dd>').text(`Fax: ${fax}`));
    if (mobile) footer.append('<dd>Di động: </dd>').children().last().append($('<a class="tel-number">').attr({ href: `tel:${mobile}`, title: mobile }).text(mobile));
    if (email) footer.append('<dd>Email: </dd>').children().last().append($('<a>').attr('href', `mailto:${email}`).text(email));
    if (address) footer.append($('<dd>').text(`Địa chỉ: ${address}`));
  }
  const contactList = $('.contactLeft ul');
  if (contactList.length) {
    contactList.empty();
    const row = (klass, label, value, href) => {
      const li = $('<li>').addClass(klass).append($('<span>').text(label));
      li.append(href ? $('<a>').attr('href', href).text(value) : documentText($, value));
      contactList.append(li);
    };
    if (phone) row('l2', 'Điện thoại: ', phone, `tel:${phone}`);
    if (fax) row('l4', 'Fax: ', fax);
    if (mobile) row('l3', 'Di động: ', mobile, `tel:${mobile}`);
    if (email) row('l5', 'Email: ', email, `mailto:${email}`);
    if (secondaryEmail) row('l5', 'Email phụ: ', secondaryEmail, `mailto:${secondaryEmail}`);
    if (whatsapp) row('l6', 'Whatsapp/Wechat: ', whatsapp, `https://wa.me/${whatsapp.replace(/\D/g, '')}`);
    if (address) row('l1', 'Địa chỉ: ', address);
  }
  if (copyright) $('.footBot p').text(copyright);
  if (email) $('#footerBar a[href^="mailto:"]').attr('href', `mailto:${email}`);
  if (whatsapp) $('a.sharewh, #footerBar a[href*="whatsapp"], #footerBar a[href*="wa.me"]').attr('href', `https://wa.me/${whatsapp.replace(/\D/g, '')}`);
}

function renderGlobalControls($, settings = {}) {
  if (settings.logo) $('#logo img').first().attr({ src: settings.logo, alt: settings.siteName || 'Athena Heat Ex' });
  if (settings.logoLink) $('#logo a').first().attr('href', settings.logoLink);
  if (settings.favicon) { $('link[rel="icon"]').remove();$('head').append($('<link rel="icon">').attr('href', settings.favicon)); }
  if (Array.isArray(settings.navLinks)) {
    $('#nav > .center > ul > li').each((index, node) => {
      const link = settings.navLinks[index];
      if (!link) { $(node).remove();return; }
      $(node).children('a.bt').first().attr('href', link.url).find('span').first().text(link.label);
    });
  }
  if (Array.isArray(settings.socialLinks)) {
    $('.footShare li').each((index, node) => {
      const link = settings.socialLinks[index];
      if (!link) { $(node).remove();return; }
      $(node).find('a').first().attr({ href: link.url, 'aria-label': link.label, title: link.label });
    });
  }
}

function syncCategoryLinks($, categories = []) {
  const byPath = new Map(categories.map(item => [item.path, item]));
  $('#nav ul ul a[href], #aside a[href], .footPro a[href]').each((_, node) => {
    const category = byPath.get($(node).attr('href'));
    if (!category) return;
    if (!category.enabled) { $(node).closest('li').remove();return; }
    $(node).text(category.name);
  });
}

function documentText($, value) {
  return $('<span>').text(value).contents();
}

function applyProduct($, product) {
  $('#proimg img').attr({ src: product.image || '', alt: product.name });
  if (Array.isArray(product.gallery)) {
    const gallery = $('.spec-list').first().empty();
    for (const url of [product.image, ...product.gallery].filter(Boolean)) {
      gallery.append($('<li>').append($('<img>').attr({ src: url, 'data-img': url, alt: product.name })));
    }
  }
  $('.proright h1').first().text(product.name);
  if (product.summary) {
    let summary = $('.proright .cms-product-summary');
    if (!summary.length) summary = $('<p class="cms-product-summary">').insertAfter($('.proright h1').first());
    summary.text(product.summary);
  }
  if (Array.isArray(product.specifications) || Array.isArray(product.videos)) {
    const description = $('#proDes').first().empty();
    const tags = $('<ul class="clearfix" id="tags">');
    for (const title of ['Mô tả', 'Thông số', 'Video']) tags.append($('<li>').append($('<span>').text(title)));
    tags.children().first().addClass('selectTag');description.append(tags);
    const content = $('<div id="tagContent">');
    const overview = $('<div class="tagContent">').html(product.descriptionHtml || '');
    const technical = $('<div class="tagContent">').attr('style', 'display: none;');
    if (product.specifications?.length) {
      technical.append($('<p>').append($('<strong>').text('Thông số kỹ thuật:')));
      const table = $('<table border="1" cellpadding="0" cellspacing="0">');
      for (const row of product.specifications) table.append($('<tr>').append($('<td>').text(row.label)).append($('<td>').text(row.value)));
      technical.append(table);
    }
    const videos = $('<div class="tagContent">').attr('style', 'display: none;');
    for (const video of product.videos || []) {
      const url = video.url || '';
      if (/\.mp4(?:[?#]|$)/i.test(url)) videos.append($('<video controls preload="metadata">').attr('src', url));
      else {
        const link = $('<a class="fancyVideo">').attr({ href: videoEmbedUrl(url), 'aria-label': 'Xem video sản phẩm' });
        if (video.thumbnail) link.append($('<img>').attr({ src: video.thumbnail, alt: `Video ${product.name}`, loading: 'lazy' }));
        else link.text('Xem video');
        videos.append($('<div class="v">').append(link));
      }
    }
    content.append(overview, technical, videos);description.append(content);
  } else $('#proDes').html(product.descriptionHtml || '');
  $('#location a').last().text(product.name).attr('href', product.path);
  applySeo($, product.seo);
}

function videoEmbedUrl(value) {
  try {
    const url = new URL(value);
    if (url.hostname === 'youtu.be') return `https://www.youtube.com/embed/${url.pathname.slice(1)}`;
    if (url.hostname.endsWith('youtube.com') && url.pathname === '/watch') return `https://www.youtube.com/embed/${url.searchParams.get('v') || ''}`;
    if (url.hostname.endsWith('vimeo.com') && /^\/\d+$/.test(url.pathname)) return `https://player.vimeo.com/video${url.pathname}`;
  } catch {}
  return value;
}

function applyService($, service) {
  const container = $('.right').first();
  if (container.length) {
    container.children().not('.mainTop').remove();
    if (service.image) container.append($('<img class="cms-entity-image">').attr({ src: service.image, alt: service.name || 'Dịch vụ', loading: 'lazy', decoding: 'async', style: 'display:block;max-width:100%;height:auto;margin:0 auto 24px' }));
    if (service.source === 'imported') {
      const content = $('<div>').html(service.descriptionHtml || '');
      const legacyRight = content.find('.right').first();
      // Previously imported services captured the whole page, including the
      // sidebar and breadcrumb. Keep only the actual service body.
      const body = legacyRight.length && content.find('#aside').length
        ? legacyRight.children().not('.mainTop').toArray().map(node => $.html(node)).join('')
        : service.descriptionHtml || '';
      container.append(body);
    } else {
      container.append($('<div class="cms-service-content">').html(service.descriptionHtml || ''));
    }
  }
  $('#location a').last().text(service.name).attr('href', service.path);
  applySeo($, service.seo);
}

function productCard(product) {
  const box = load('<div class="box"><a><img><span></span></a></div>', { decodeEntities: false });
  box('a').attr('href', product.path);
  box('img').attr({ src: product.image || '', alt: product.name });
  box('span').text(product.name);
  return box('body').html();
}

async function applyCategory($, db, category) {
  // Imported categories can contain products that are shared by several
  // categories. During the initial import each product keeps only its first
  // categoryId, so filtering by categoryId alone makes the main "Máy móc"
  // page appear empty even though the category's productPaths are populated.
  // Prefer the explicit path membership and keep categoryId as a fallback for
  // products created/assigned from the admin editor.
  const productPaths = Array.isArray(category.productPaths)
    ? category.productPaths.map(path => String(path || '').trim()).filter(Boolean)
    : [];
  const filter = productPaths.length
    ? { enabled: true, $or: [{ path: { $in: productPaths } }, { categoryId: String(category._id) }] }
    : { categoryId: String(category._id), enabled: true };
  const products = await db.collection(CMS.products)
    .find(filter)
    .sort({ sortOrder: 1, name: 1 }).toArray();
  const list = $('.proDisplay').first();
  if (category.image && list.length) list.before($('<img class="cms-entity-image">').attr({ src: category.image, alt: category.name || 'Danh mục', loading: 'lazy', decoding: 'async', style: 'display:block;max-width:100%;height:auto;margin:0 auto 24px' }));
  if (list.length) list.html(products.map(productCard).join('') + '<div class="line"></div><div class="line"></div>');
  $('#location a').last().text(category.name).attr('href', category.path);
  if (category.descriptionHtml) {
    // Early imports stored the entire product grid and pagination as the
    // category "description". Never render those a second time.
    const content = $('<div>').html(category.descriptionHtml);
    content.find('.proDisplay,#pageNum').remove();
    if (content.text().trim() || content.find('img,video,iframe').length) {
      let description = $('.cms-category-description');
      if (!description.length) description = $('<div class="cms-category-description">').insertBefore(list);
      description.html(content.html());
    }
  }
}

export async function renderCmsPage(pathname) {
  await ensureCmsSeeded();
  const db = await getDb();
  const normalized = sourcePathForPublicPath(pathname === '/' ? '/index.html' : safePath(pathname));
  const page = await db.collection(CMS.pages).findOne({ path: normalized });
  if (!page || !page.enabled) return null;
  const $ = load(normalizeDocumentHtml(page.html, page.title), { decodeEntities: false });

  const sections = await db.collection(CMS.sections).find({ pagePath: { $in: [normalized, '*'] } }).sort({ sortOrder: 1 }).toArray();
  const movable = [];
  for (const section of sections) {
    try {
      const target = $(section.selector).first();
      if (!target.length) continue;
      if (!section.enabled) { target.remove(); continue; }
      if (section.mode === 'replace') target.replaceWith(section.html || '');
      else target.html(section.html || '');
      if (section.pagePath === normalized) movable.push($(section.selector).first());
    } catch {
      // Invalid selectors are rejected by the API; legacy bad data must not break the site.
    }
  }
  if (movable.length > 1 && $('#footer').length) {
    for (const element of movable) {
      element.remove();
      $('#footer').first().before(element);
    }
  }
  // Page-specific sections are applied after the initial document
  // normalization and may contain the legacy disabled paginator markup.
  // Normalize once more so CMS-rendered pages behave like the static build.
  normalizePagination($);

  const [settings, product, service, category, categoryLinks] = await Promise.all([
    db.collection(CMS.settings).findOne({ _id: 'global' }),
    db.collection(CMS.products).findOne({ path: normalized }),
    db.collection(CMS.services).findOne({ path: normalized }),
    db.collection(CMS.categories).findOne({ path: normalized }),
    db.collection(CMS.categories).find({}, { projection: { path: 1, name: 1, enabled: 1 } }).toArray(),
  ]);
  if ((product && !product.enabled) || (service && !service.enabled) || (category && !category.enabled)) return null;
  if (product) applyProduct($, product);
  if (service) applyService($, service);
  if (category) await applyCategory($, db, category);

  if (normalized === '/index.html') {
    const banners = await db.collection(CMS.banners).find({ enabled: true }).sort({ sortOrder: 1 }).toArray();
    const wrapper = $('#banner .swiper-wrapper');
    if (wrapper.length) {
      wrapper.empty();
      for (const banner of banners) {
        const slide = $('<div class="swiper-slide"><a><img></a></div>');
        slide.find('a').attr('href', banner.url || '/index.html');
        slide.find('img').attr({ src: banner.image, alt: banner.alt || banner.title || '' });
        wrapper.append(slide);
      }
    }
  }
  renderContact($, settings || {});
  renderGlobalControls($, settings || {});
  syncCategoryLinks($, categoryLinks);
  applySeo($, page.seo, settings?.defaultSeo);
  $('link[rel="canonical"]').remove();
  $('head').append($('<link rel="canonical">').attr('href', `https://athenaheatex.vercel.app${publicPathForSourcePath(normalized)}`));
  $('img').each((_, node) => {
    if (!String($(node).attr('alt') || '').trim()) $(node).attr('alt', page.title || settings?.siteName || 'Athena Heat Ex');
  });
  // The mirrored forms omit their destination and reuse the same hidden ID on
  // product pages. Keep the markup visually identical but make the fallback
  // submission local and the document IDs unambiguous.
  $('.crm-form form').attr({ action: '/api/inquiries', method: 'post' });
  const seenIds = new Set();
  $('[id]').each((_, node) => {
    const id = $(node).attr('id');
    if (id === 'pagetitle' && seenIds.has(id)) $(node).removeAttr('id');
    else seenIds.add(id);
  });
  $('head').append('<meta name="cms-rendered" content="mongodb">');
  return '<!DOCTYPE html>\n' + rewritePublicLinks($.html());
}

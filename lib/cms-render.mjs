import { load } from 'cheerio';
import { CMS, ensureCmsSeeded } from './cms.mjs';
import { normalizeDocumentHtml } from './html-normalize.mjs';
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

function documentText($, value) {
  return $('<span>').text(value).contents();
}

function applyProduct($, product) {
  $('#proimg img').attr({ src: product.image || '', alt: product.name });
  $('.proright h1').first().text(product.name);
  if (product.summary) {
    let summary = $('.proright .cms-product-summary');
    if (!summary.length) summary = $('<p class="cms-product-summary">').insertAfter($('.proright h1').first());
    summary.text(product.summary);
  }
  $('#proDes').html(product.descriptionHtml || '');
  $('#location a').last().text(product.name).attr('href', product.path);
  applySeo($, product.seo);
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
  const products = await db.collection(CMS.products)
    .find({ categoryId: String(category._id), enabled: true })
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

  const [settings, product, service, category] = await Promise.all([
    db.collection(CMS.settings).findOne({ _id: 'global' }),
    db.collection(CMS.products).findOne({ path: normalized }),
    db.collection(CMS.services).findOne({ path: normalized }),
    db.collection(CMS.categories).findOne({ path: normalized }),
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

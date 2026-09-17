import { load } from 'cheerio';
import { CMS, ensureCmsSeeded } from './cms.mjs';
import { normalizeDocumentHtml, normalizePagination } from './html-normalize.mjs';
import { getDb } from './mongodb.mjs';
import { publicPathForSourcePath, rewritePublicLinks, sourcePathForPublicPath } from './public-paths.mjs';
import { ATHENA_CONTACT_DEFAULTS, channelIcon, contactChannels, rebrandTree } from './site-settings.mjs';

const safePath = value => String(value || '').startsWith('/') ? String(value) : '/' + String(value || '');
const DEFAULT_FAVICON = '/favicon.ico?v=20260917';

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

function appendChannelLink($, list, channel) {
  const anchor = $('<a>').attr({ href: channel.url, 'aria-label': `Liên hệ qua ${channel.label}`, title: `${channel.label}: ${channel.value}`, 'data-contact-kind': channel.kind, 'data-contact-value': channel.value });
  if (/^https?:/i.test(channel.url)) anchor.attr({ target: '_blank', rel: 'noopener noreferrer' });
  anchor.append($(`<span class="contact-channel-icon contact-channel-${channel.kind}">${channelIcon(channel.kind)}</span>`));
  anchor.append($('<span class="contact-channel-label">').text(channel.label));
  list.append($('<li class="contact-channel-item">').append(anchor));
}

function socialIconClass(link = {}) {
  const value = `${link.label || ''} ${link.url || ''}`.toLowerCase();
  if (value.includes('facebook')) return 'qico-facebook';
  if (value.includes('twitter') || /(^|\W)x(\W|$)/.test(value)) return 'qico-twitter';
  if (value.includes('youtube')) return 'qico-youtube';
  if (value.includes('linkedin')) return 'qico-linkedin';
  return 'qico-share';
}

export function renderContact($, settings = ATHENA_CONTACT_DEFAULTS) {
  const { phone = '', mobile = '', fax = '', email = '', secondaryEmail = '', address = '', copyright = '' } = settings;
  const channels = contactChannels(settings);

  // The fixed call shortcut is shared by static builds and CMS-rendered pages.
  // Recreate it on every render so a phone changed in admin is reflected here too.
  $('.floating-call').remove();
  if (phone && $('body').length) {
    const call = $('<a class="floating-call">').attr({
      href: `tel:${phone}`,
      'aria-label': `Gọi ${phone}`,
      title: `Gọi ${phone}`,
    });
    call.append($('<span class="floating-call-number">').text(phone));
    call.append($('<span class="floating-call-icon" aria-hidden="true">').html('<svg viewBox="0 0 24 24" focusable="false"><path d="M6.62 10.79a15.46 15.46 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2Z"/></svg>'));
    $('body').append(call);
  }
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
    if (mobile && mobile !== phone) footer.append('<dd>Di động: </dd>').children().last().append($('<a class="tel-number">').attr({ href: `tel:${mobile}`, title: mobile }).text(mobile));
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
    if (mobile && mobile !== phone) row('l3', 'Di động: ', mobile, `tel:${mobile}`);
    if (email) row('l5', 'Email: ', email, `mailto:${email}`);
    if (secondaryEmail) row('l5', 'Email phụ: ', secondaryEmail, `mailto:${secondaryEmail}`);
    for (const channel of channels) row('l6', `${channel.label}: `, channel.value, channel.url);
    if (address) row('l1', 'Địa chỉ: ', address);
  }
  if (copyright) $('.footBot p').text(copyright);
  const productContact = $('.proContact').first();
  if (productContact.length) {
    productContact.empty();
    if (phone) productContact.append($('<li>').append($('<a class="tel-number">').attr({ href: `tel:${phone}`, title: phone }).text(phone)));
    if (email) productContact.append($('<li>').append($('<a>').attr('href', `mailto:${email}`).text(email)));
  }

  $('.footShare ul').each((_, node) => {
    const list = $(node).empty();
    for (const link of Array.isArray(settings.socialLinks) ? settings.socialLinks : []) {
      const anchor = $('<a>').attr({ href: link.url, 'aria-label': link.label, title: link.label, target: '_blank', rel: 'noopener noreferrer' });
      anchor.append($('<i class="qico">').addClass(socialIconClass(link)));
      list.append($('<li class="social-link-item">').append(anchor));
    }
    for (const channel of channels) appendChannelLink($, list, channel);
  });

  // Keep the compact footer form uncluttered, but expose the configured
  // messaging channels inside the full request form on the contact page.
  $('.form-contact-channels').remove();
  $('.inquiry-contact-channels').remove();
  const inquiryForm = $('.contactRight .crm-form').first();
  if (inquiryForm.length && channels.length) {
    const list = $('<ul>');
    for (const channel of channels) appendChannelLink($, list, channel);
    const block = $('<div class="inquiry-contact-channels" aria-label="Kênh liên hệ">').append(list);
    const title = inquiryForm.find('.create-form-title').first();
    if (title.length) title.after(block); else inquiryForm.prepend(block);
  }

  const mobileBar = $('#footerBar ul');
  if (mobileBar.length) {
    mobileBar.empty().append('<li><a href="/"><i class="qico qico-home"></i><span>Trang chủ</span></a></li>');
    for (const channel of channels.slice(0, 3)) {
      const item = $('<li>');
      const anchor = $('<a>').attr({ href: channel.url, 'aria-label': channel.label, title: channel.value, 'data-contact-kind': channel.kind, 'data-contact-value': channel.value });
      anchor.append($(`<span class="footer-channel-icon contact-channel-${channel.kind}">${channelIcon(channel.kind)}</span>`), $('<span>').text(channel.label));
      mobileBar.append(item.append(anchor));
    }
    if (email) mobileBar.append($('<li>').append($('<a>').attr({ href: `mailto:${email}`, 'aria-label': 'Email' }).append('<i class="qico qico-youxiang"></i><span>Email</span>')));
    const width = `${100 / mobileBar.children().length}%`;
    mobileBar.children().css('width', width);
  }
  const wechat = channels.find(channel => channel.kind === 'wechat');
  if (wechat) $('a[href^="weixin:"]').attr({ 'data-contact-kind': 'wechat', 'data-contact-value': wechat.value });
}

export function renderGlobalControls($, settings = {}) {
  if (settings.logo) $('#logo img').first().attr({ src: settings.logo, alt: settings.siteName || 'Athena Heat Ex' });
  if (settings.logoLink) $('#logo a').first().attr('href', settings.logoLink);
  $('link[rel~="icon"]').remove();
  $('head').append($('<link rel="icon" sizes="any">').attr('href', settings.favicon || DEFAULT_FAVICON));
  if (Array.isArray(settings.navLinks)) {
    $('#nav > .center > ul > li').each((index, node) => {
      const link = settings.navLinks[index];
      if (!link) { $(node).remove();return; }
      $(node).children('a.bt').first().attr('href', link.url).find('span').first().text(link.label);
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
  renderGlobalControls($, settings || {});
  renderContact($, settings || ATHENA_CONTACT_DEFAULTS);
  syncCategoryLinks($, categoryLinks);
  applySeo($, page.seo, settings?.defaultSeo);
  $('link[rel="canonical"]').remove();
  $('head').append($('<link rel="canonical">').attr('href', `https://athenaheatex.vercel.app${publicPathForSourcePath(normalized)}`));
  $('img').each((_, node) => {
    if (!String($(node).attr('alt') || '').trim()) $(node).attr('alt', page.title || settings?.siteName || 'Athena Heat Ex');
  });
  rebrandTree($);
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

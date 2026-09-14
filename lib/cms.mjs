import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { ObjectId } from 'mongodb';
import { getDb, isDatabaseConfigured } from './mongodb.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distRoot = path.join(projectRoot, 'dist');

export const CMS = Object.freeze({
  meta: 'cms_meta', pages: 'cms_pages', sections: 'cms_sections', products: 'cms_products',
  services: 'cms_services', categories: 'cms_categories', banners: 'cms_banners',
  media: 'cms_media', settings: 'cms_settings', sessions: 'cms_sessions',
});

const SEED_ID = 'website-import-v1';
let seedPromise;

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const pagePath = relative => '/' + relative.split(path.sep).join('/');
const seoFrom = $ => ({
  title: clean($('title').first().text()),
  description: clean($('meta[name="description"]').attr('content')),
  keywords: clean($('meta[name="keywords"]').attr('content')),
});

function contentTitle($, fallback) {
  return clean($('#content h1, #content .mainTop, #main h1, .mainpage h1').first().text()) ||
    clean($('#location a').last().text()) || clean($('title').text().split('-')[0]) || fallback;
}

function sectionSeeds($, pathname, now) {
  const candidates = pathname === '/index.html'
    ? [['#banner', 'Banner trang chủ'], ['.showCen', 'Khối giới thiệu'], ['.showPro', 'Sản phẩm nổi bật']]
    : [['#main', 'Nội dung chính'], ['.mainpage', 'Nội dung chính']];
  const result = [];
  for (const [selector, name] of candidates) {
    const element = $(selector).first();
    if (!element.length) continue;
    result.push({
      _id: new ObjectId(), pagePath: pathname, name, selector, mode: 'inner', html: element.html() || '',
      enabled: true, sortOrder: result.length, source: 'imported', createdAt: now, updatedAt: now,
    });
    if (pathname !== '/index.html') break;
  }
  return result;
}

async function ensureIndexes(db) {
  await Promise.all([
    db.collection(CMS.pages).createIndex({ path: 1 }, { unique: true }),
    db.collection(CMS.sections).createIndex({ pagePath: 1, sortOrder: 1 }),
    db.collection(CMS.products).createIndex({ path: 1 }, { unique: true }),
    db.collection(CMS.services).createIndex({ path: 1 }, { unique: true }),
    db.collection(CMS.categories).createIndex({ path: 1 }, { unique: true }),
    db.collection(CMS.banners).createIndex({ sortOrder: 1 }),
    db.collection(CMS.media).createIndex({ url: 1 }, { unique: true }),
    db.collection(CMS.sessions).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection(CMS.sessions).createIndex({ tokenHash: 1 }, { unique: true }),
  ]);
}

export async function ensureCmsSeeded({ force = false } = {}) {
  if (!isDatabaseConfigured()) return { skipped: true, reason: 'database-not-configured' };
  if (!force && seedPromise) return seedPromise;
  const run = async () => {
    const db = await getDb();
    const existing = await db.collection(CMS.meta).findOne({ _id: SEED_ID });
    if (existing && !force) return { seeded: false, ...existing.counts };
    // Indexes are created during the initial import; checking them on every
    // serverless cold start adds several unnecessary database round trips.
    await ensureIndexes(db);

    const files = (await readdir(distRoot, { recursive: true }))
      .filter(file => file.toLowerCase().endsWith('.html'))
      .sort((a, b) => a.localeCompare(b));
    const now = new Date();
    const pages = [];
    const sections = [];
    const mediaByUrl = new Map();
    const categoryCandidates = [];
    const productCandidates = [];
    let home$;

    for (let index = 0; index < files.length; index += 1) {
      const relative = files[index];
      const pathname = pagePath(relative);
      const html = await readFile(path.join(distRoot, relative), 'utf8');
      const $ = load(html, { decodeEntities: false });
      const isProduct = $('#proDes').length > 0 && $('#proimg img').length > 0;
      const isCategory = $('.proDisplay .box').length > 0;
      const title = contentTitle($, path.basename(relative, '.html'));
      const pageId = new ObjectId();
      pages.push({
        _id: pageId, path: pathname, title, html, seo: seoFrom($),
        type: isProduct ? 'product' : isCategory ? 'category' : 'page',
        enabled: true, sortOrder: index, source: 'imported', createdAt: now, updatedAt: now,
      });
      sections.push(...sectionSeeds($, pathname, now));
      if (pathname === '/index.html') home$ = $;

      $('img[src]').each((_, node) => {
        const url = clean($(node).attr('src'));
        if (!url || mediaByUrl.has(url)) return;
        mediaByUrl.set(url, {
          _id: new ObjectId(), name: clean($(node).attr('alt')) || path.basename(url), url,
          alt: clean($(node).attr('alt')), sourceType: /^https?:\/\//i.test(url) ? 'external' : 'local',
          enabled: true, sortOrder: mediaByUrl.size, createdAt: now, updatedAt: now,
        });
      });

      if (isCategory) {
        const links = [];
        $('.proDisplay .box a[href]').each((_, node) => {
          const href = clean($(node).attr('href'));
          if (href && !links.includes(href)) links.push(href);
        });
        const description = $('.content .info').first().clone();
        description.find('.proDisplay,#pageNum,.line').remove();
        categoryCandidates.push({ pathname, title, links, descriptionHtml: description.html()?.trim() || '' });
      }
      if (isProduct) {
        productCandidates.push({
          pathname, title: clean($('.proright h1').first().text()) || title,
          image: clean($('#proimg img').first().attr('src')), summary: clean($('.prode').first().text()),
          descriptionHtml: $('#proDes').first().html() || '', seo: seoFrom($), pageId,
        });
      }
    }

    if (force) {
      await Promise.all(Object.values(CMS).filter(name => ![CMS.sessions].includes(name)).map(name => db.collection(name).deleteMany({})));
    }

    const categories = categoryCandidates.map((candidate, index) => ({
      _id: new ObjectId(), name: candidate.title, path: candidate.pathname,
      descriptionHtml: candidate.descriptionHtml, image: '', kind: 'product', enabled: true,
      sortOrder: index, productPaths: candidate.links, source: 'imported', createdAt: now, updatedAt: now,
    }));
    const categoryByProduct = new Map();
    for (const category of categories) for (const productPath of category.productPaths) {
      if (!categoryByProduct.has(productPath)) categoryByProduct.set(productPath, String(category._id));
    }
    const products = productCandidates.map((candidate, index) => ({
      _id: new ObjectId(), name: candidate.title, path: candidate.pathname,
      categoryId: categoryByProduct.get(candidate.pathname) || '', summary: candidate.summary,
      descriptionHtml: candidate.descriptionHtml, image: candidate.image, seo: candidate.seo,
      enabled: true, sortOrder: index, pageId: String(candidate.pageId), source: 'imported', createdAt: now, updatedAt: now,
    }));
    const productByPath = new Map(products.map(product => [product.path, product]));
    for (const page of pages) {
      const product = productByPath.get(page.path);
      if (product) page.sourceEntityId = String(product._id);
      const category = categories.find(item => item.path === page.path);
      if (category) page.sourceEntityId = String(category._id);
    }

    const servicePage = pages.find(page => page.path === '/service-4.html');
    const service$ = load(servicePage?.html || '');
    const serviceBody = service$('.right').first().children().not('.mainTop').toArray().map(node => service$.html(node)).join('');
    const services = servicePage ? [{
      _id: new ObjectId(), name: servicePage.title, path: servicePage.path, summary: '',
      descriptionHtml: serviceBody, image: '',
      seo: servicePage.seo, enabled: true, sortOrder: 0, pageId: String(servicePage._id),
      source: 'imported', createdAt: now, updatedAt: now,
    }] : [];
    if (services.length) servicePage.sourceEntityId = String(services[0]._id);

    const banners = [];
    if (home$) home$('#banner .swiper-slide').each((index, node) => {
      const anchor = home$(node).find('a').first();
      const image = home$(node).find('img').first();
      banners.push({
        _id: new ObjectId(), title: clean(image.attr('alt')) || `Banner ${index + 1}`,
        image: clean(image.attr('src')), url: clean(anchor.attr('href')) || '/index.html',
        alt: clean(image.attr('alt')), enabled: true, sortOrder: index, source: 'imported', createdAt: now, updatedAt: now,
      });
    });

    const firstPage = pages.find(page => page.path === '/index.html') || pages[0];
    const $default = load(firstPage?.html || '');
    const settings = {
      _id: 'global', siteName: 'Athena Heat Ex',
      phone: clean($default('.contop a[href^="tel:"]').first().text()),
      mobile: clean($default('.footContact a[href^="tel:"]').last().text()),
      fax: clean($default('.footContact dd').filter((_, el) => $default(el).text().includes('Fax')).first().text().replace(/^Fax:\s*/i, '')),
      email: clean($default('a[href^="mailto:"]').first().text()), secondaryEmail: 'shjoylong@gmail.com',
      address: clean($default('.footContact dd').last().text().replace(/^Địa chỉ:\s*/i, '')),
      whatsapp: '8618616619098', copyright: clean($default('.footBot p').first().text()),
      defaultSeo: firstPage?.seo || {}, updatedAt: now,
    };

    if (pages.length) await db.collection(CMS.pages).insertMany(pages, { ordered: false });
    if (sections.length) await db.collection(CMS.sections).insertMany(sections, { ordered: false });
    if (products.length) await db.collection(CMS.products).insertMany(products, { ordered: false });
    if (services.length) await db.collection(CMS.services).insertMany(services, { ordered: false });
    if (categories.length) await db.collection(CMS.categories).insertMany(categories, { ordered: false });
    if (banners.length) await db.collection(CMS.banners).insertMany(banners, { ordered: false });
    const media = [...mediaByUrl.values()];
    if (media.length) await db.collection(CMS.media).insertMany(media, { ordered: false });
    await db.collection(CMS.settings).replaceOne({ _id: 'global' }, settings, { upsert: true });
    const counts = { pages: pages.length, sections: sections.length, products: products.length, services: services.length, categories: categories.length, banners: banners.length, media: media.length };
    await db.collection(CMS.meta).replaceOne({ _id: SEED_ID }, { _id: SEED_ID, counts, seededAt: now }, { upsert: true });
    return { seeded: true, ...counts };
  };
  seedPromise = run().catch(error => { seedPromise = null; throw error; });
  return seedPromise;
}

export function objectId(value) {
  return ObjectId.isValid(String(value || '')) ? new ObjectId(String(value)) : null;
}

export async function cmsCounts() {
  const db = await getDb();
  const entries = await Promise.all([
    ['pages', CMS.pages], ['sections', CMS.sections], ['products', CMS.products], ['services', CMS.services],
    ['categories', CMS.categories], ['banners', CMS.banners], ['media', CMS.media], ['inquiries', 'inquiries'],
  ].map(async ([key, collection]) => [key, await db.collection(collection).countDocuments()]));
  return Object.fromEntries(entries);
}

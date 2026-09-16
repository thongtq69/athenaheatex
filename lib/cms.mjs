import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { ObjectId } from 'mongodb';
import { normalizeDocumentHtml, normalizeFragmentHtml } from './html-normalize.mjs';
import { getDb, isDatabaseConfigured } from './mongodb.mjs';
import { ATHENA_BRAND, ATHENA_CONTACT_DEFAULTS, replaceLegacyBrand, replaceLegacySiteText } from './site-settings.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distRoot = path.join(projectRoot, 'dist');

export const CMS = Object.freeze({
  meta: 'cms_meta', pages: 'cms_pages', sections: 'cms_sections', products: 'cms_products',
  services: 'cms_services', categories: 'cms_categories', banners: 'cms_banners',
  media: 'cms_media', settings: 'cms_settings', sessions: 'cms_sessions',
});

const SEED_ID = 'website-import-v1';
const ATHENA_MIGRATION_ID = 'athena-brand-contact-v1';
const ATHENA_LINK_REPAIR_ID = 'athena-brand-contact-v2-link-repair';
let seedPromise;

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const pagePath = relative => '/' + relative.split(path.sep).join('/');
const isPublicHtml = file => {
  const normalized = file.split(path.sep).join('/').toLowerCase();
  return normalized.endsWith('.html') && !normalized.startsWith('admin/');
};
const seoFrom = $ => ({
  title: clean($('title').first().text()),
  description: clean($('meta[name="description"]').attr('content')),
  keywords: clean($('meta[name="keywords"]').attr('content')),
});

function brandedSeo(seo = {}) {
  return Object.fromEntries(Object.entries(seo || {}).map(([key, value]) => [key, replaceLegacyBrand(value)]));
}

function brandedDocument(document, fields) {
  const next = { ...document };
  let changed = false;
  for (const field of fields) {
    const value = replaceLegacySiteText(document[field]);
    if (value !== String(document[field] ?? '')) { next[field] = value; changed = true; }
  }
  if (document.seo) {
    const seo = brandedSeo(document.seo);
    if (JSON.stringify(seo) !== JSON.stringify(document.seo)) { next.seo = seo; changed = true; }
  }
  return changed ? next : null;
}

async function ensureAthenaBrandContactMigration(db) {
  if (await db.collection(CMS.meta).findOne({ _id: ATHENA_MIGRATION_ID })) return { migrated: false };
  const plans = [
    [CMS.pages, ['title', 'html']], [CMS.sections, ['name', 'html']],
    [CMS.products, ['name', 'summary', 'descriptionHtml']], [CMS.services, ['name', 'summary', 'descriptionHtml']],
    [CMS.categories, ['name', 'descriptionHtml']], [CMS.banners, ['title', 'alt']], [CMS.media, ['name', 'alt']],
  ];
  let branded = 0;
  for (const [collectionName, fields] of plans) {
    const collection = db.collection(collectionName);
    const documents = await collection.find({}).toArray();
    const updates = documents.flatMap(document => {
      const next = brandedDocument(document, fields);
      return next ? [{ replaceOne: { filter: { _id: document._id }, replacement: { ...next, updatedAt: new Date() } } }] : [];
    });
    if (updates.length) { await collection.bulkWrite(updates, { ordered: false }); branded += updates.length; }
  }
  const current = await db.collection(CMS.settings).findOne({ _id: 'global' }) || {};
  const settings = {
    ...current,
    ...ATHENA_CONTACT_DEFAULTS,
    _id: 'global',
    siteName: ATHENA_BRAND,
    copyright: replaceLegacyBrand(current.copyright) || `Copyright © ${new Date().getFullYear()} ${ATHENA_BRAND}.`,
    defaultSeo: brandedSeo(current.defaultSeo),
    updatedAt: new Date(),
  };
  await db.collection(CMS.settings).replaceOne({ _id: 'global' }, settings, { upsert: true });
  await db.collection(CMS.meta).replaceOne({ _id: ATHENA_MIGRATION_ID }, { _id: ATHENA_MIGRATION_ID, branded, migratedAt: new Date() }, { upsert: true });
  return { migrated: true, branded };
}

function repairMigratedTechnicalValues(value) {
  return String(value ?? '')
    .replace(/ATHENA HEATEX-manufacturing-workshop/gi, 'joylong-manufacturing-workshop')
    .replace(/https?:\/\/(?:www\.)?athenatech\.com\.vn\/upfile/gi, 'https://www.shjoylong.com/upfile');
}

async function ensureAthenaLinkRepair(db) {
  if (await db.collection(CMS.meta).findOne({ _id: ATHENA_LINK_REPAIR_ID })) return { linksRepaired: false };
  const plans = [
    [CMS.pages, ['html']], [CMS.sections, ['html']], [CMS.products, ['descriptionHtml']],
    [CMS.services, ['descriptionHtml']], [CMS.categories, ['descriptionHtml']],
  ];
  let repaired = 0;
  for (const [collectionName, fields] of plans) {
    const collection = db.collection(collectionName);
    const documents = await collection.find({}).toArray();
    const updates = documents.flatMap(document => {
      const set = {};
      for (const field of fields) {
        const value = repairMigratedTechnicalValues(document[field]);
        if (value !== String(document[field] ?? '')) set[field] = value;
      }
      return Object.keys(set).length ? [{ updateOne: { filter: { _id: document._id }, update: { $set: { ...set, updatedAt: new Date() } } } }] : [];
    });
    if (updates.length) { await collection.bulkWrite(updates, { ordered: false }); repaired += updates.length; }
  }
  await db.collection(CMS.meta).replaceOne({ _id: ATHENA_LINK_REPAIR_ID }, { _id: ATHENA_LINK_REPAIR_ID, repaired, migratedAt: new Date() }, { upsert: true });
  return { linksRepaired: true, repaired };
}

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
    if (existing && !force) {
      const migration = await ensureAthenaBrandContactMigration(db);
      const repair = await ensureAthenaLinkRepair(db);
      return { seeded: false, ...existing.counts, ...migration, ...repair };
    }
    // Indexes are created during the initial import; checking them on every
    // serverless cold start adds several unnecessary database round trips.
    await ensureIndexes(db);

    const files = (await readdir(distRoot, { recursive: true }))
      .filter(isPublicHtml)
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
      const sourceHtml = await readFile(path.join(distRoot, relative), 'utf8');
      let $ = load(sourceHtml, { decodeEntities: false });
      const isProduct = $('#proDes').length > 0 && $('#proimg img').length > 0;
      const isCategory = $('.proDisplay .box').length > 0;
      const title = contentTitle($, path.basename(relative, '.html'));
      const html = normalizeDocumentHtml(sourceHtml, title);
      if (html !== sourceHtml) $ = load(html, { decodeEntities: false });
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
      _id: 'global', ...ATHENA_CONTACT_DEFAULTS,
      address: clean($default('.footContact dd').last().text().replace(/^Địa chỉ:\s*/i, '')),
      copyright: replaceLegacyBrand(clean($default('.footBot p').first().text())),
      defaultSeo: brandedSeo(firstPage?.seo || {}), updatedAt: now,
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
    await ensureAthenaBrandContactMigration(db);
    await ensureAthenaLinkRepair(db);
    return { seeded: true, ...counts };
  };
  seedPromise = run().catch(error => { seedPromise = null; throw error; });
  return seedPromise;
}

/**
 * Restore public HTML entries that are still shipped by the build but were
 * accidentally removed from the CMS. This is deliberately an explicit repair
 * operation: running it automatically on every request would resurrect pages
 * that an administrator intentionally deleted.
 */
export async function repairMissingCmsContent() {
  if (!isDatabaseConfigured()) return { skipped: true, reason: 'database-not-configured' };
  const db = await getDb();
  await ensureIndexes(db);
  const files = (await readdir(distRoot, { recursive: true }))
    .filter(isPublicHtml)
    .sort((a, b) => a.localeCompare(b));
  const existingPaths = new Set(await db.collection(CMS.pages).distinct('path'));
  const missing = files.filter(relative => !existingPaths.has(pagePath(relative)));
  const result = { pages: 0, sections: 0, products: 0, services: 0, categories: 0, media: 0, normalizedPages: 0, normalizedSections: 0, normalizedDescriptions: 0, paths: [] };

  for (const relative of missing) {
    const pathname = pagePath(relative);
    const sourceHtml = await readFile(path.join(distRoot, relative), 'utf8');
    let $ = load(sourceHtml, { decodeEntities: false });
    const isProduct = $('#proDes').length > 0 && $('#proimg img').length > 0;
    const isCategory = $('.proDisplay .box').length > 0;
    const title = contentTitle($, path.basename(relative, '.html'));
    const html = normalizeDocumentHtml(sourceHtml, title);
    if (html !== sourceHtml) $ = load(html, { decodeEntities: false });
    const pageId = new ObjectId();
    const now = new Date();
    let sourceEntityId = '';

    if (isProduct) {
      let product = await db.collection(CMS.products).findOne({ path: pathname });
      if (!product) {
        const category = await db.collection(CMS.categories).findOne({ productPaths: pathname });
        product = {
          _id: new ObjectId(), name: clean($('.proright h1').first().text()) || title, path: pathname,
          categoryId: category ? String(category._id) : '', summary: clean($('.prode').first().text()),
          descriptionHtml: $('#proDes').first().html() || '', image: clean($('#proimg img').first().attr('src')),
          seo: seoFrom($), enabled: true, sortOrder: files.indexOf(relative), pageId: String(pageId),
          source: 'imported', createdAt: now, updatedAt: now,
        };
        await db.collection(CMS.products).insertOne(product);
        result.products += 1;
      } else {
        await db.collection(CMS.products).updateOne({ _id: product._id }, { $set: { pageId: String(pageId), updatedAt: now } });
      }
      sourceEntityId = String(product._id);
    } else if (isCategory) {
      const links = [];
      $('.proDisplay .box a[href]').each((_, node) => {
        const href = clean($(node).attr('href'));
        if (href && !links.includes(href)) links.push(href);
      });
      let category = await db.collection(CMS.categories).findOne({ path: pathname });
      if (!category) {
        const description = $('.content .info').first().clone();
        description.find('.proDisplay,#pageNum,.line').remove();
        category = {
          _id: new ObjectId(), name: title, path: pathname, descriptionHtml: description.html()?.trim() || '',
          image: '', kind: 'product', enabled: true, sortOrder: files.indexOf(relative), productPaths: links,
          source: 'imported', createdAt: now, updatedAt: now,
        };
        await db.collection(CMS.categories).insertOne(category);
        result.categories += 1;
      }
      if (links.length) {
        await db.collection(CMS.products).updateMany(
          { path: { $in: links }, categoryId: '' },
          { $set: { categoryId: String(category._id), updatedAt: now } },
        );
      }
      sourceEntityId = String(category._id);
    } else if (pathname === '/service-4.html') {
      let service = await db.collection(CMS.services).findOne({ path: pathname });
      if (!service) {
        const body = $('.right').first().children().not('.mainTop').toArray().map(node => $.html(node)).join('');
        service = {
          _id: new ObjectId(), name: title, path: pathname, summary: '', descriptionHtml: body, image: '',
          seo: seoFrom($), enabled: true, sortOrder: 0, pageId: String(pageId), source: 'imported',
          createdAt: now, updatedAt: now,
        };
        await db.collection(CMS.services).insertOne(service);
        result.services += 1;
      } else {
        await db.collection(CMS.services).updateOne({ _id: service._id }, { $set: { pageId: String(pageId), updatedAt: now } });
      }
      sourceEntityId = String(service._id);
    }

    await db.collection(CMS.pages).insertOne({
      _id: pageId, path: pathname, title, html, seo: seoFrom($),
      type: isProduct ? 'product' : isCategory ? 'category' : 'page',
      enabled: true, sortOrder: files.indexOf(relative), source: 'imported',
      ...(sourceEntityId ? { sourceEntityId } : {}), createdAt: now, updatedAt: now,
    });
    result.pages += 1;
    result.paths.push(pathname);

    const sections = sectionSeeds($, pathname, now);
    if (sections.length) {
      await db.collection(CMS.sections).insertMany(sections, { ordered: false });
      result.sections += sections.length;
    }

    const media = [];
    $('img[src]').each((_, node) => {
      const url = clean($(node).attr('src'));
      if (!url || media.some(item => item.url === url)) return;
      media.push({
        name: clean($(node).attr('alt')) || path.basename(url), url, alt: clean($(node).attr('alt')),
        sourceType: /^https?:\/\//i.test(url) ? 'external' : 'local', enabled: true,
        sortOrder: Date.now() + media.length, source: 'imported', createdAt: now, updatedAt: now,
      });
    });
    if (media.length) {
      const mediaResult = await db.collection(CMS.media).bulkWrite(media.map(item => ({
        updateOne: { filter: { url: item.url }, update: { $setOnInsert: item }, upsert: true },
      })), { ordered: false });
      result.media += mediaResult.upsertedCount;
    }
  }

  const pages = await db.collection(CMS.pages).find({}, { projection: { title: 1, html: 1 } }).toArray();
  const pageUpdates = pages.flatMap(page => {
    const html = normalizeDocumentHtml(page.html, page.title);
    return html === page.html ? [] : [{ updateOne: { filter: { _id: page._id }, update: { $set: { html, updatedAt: new Date() } } } }];
  });
  if (pageUpdates.length) await db.collection(CMS.pages).bulkWrite(pageUpdates, { ordered: false });
  result.normalizedPages = pageUpdates.length;

  const sections = await db.collection(CMS.sections).find({}, { projection: { name: 1, html: 1 } }).toArray();
  const sectionUpdates = sections.flatMap(section => {
    const html = normalizeFragmentHtml(section.html, section.name);
    return html === section.html ? [] : [{ updateOne: { filter: { _id: section._id }, update: { $set: { html, updatedAt: new Date() } } } }];
  });
  if (sectionUpdates.length) await db.collection(CMS.sections).bulkWrite(sectionUpdates, { ordered: false });
  result.normalizedSections = sectionUpdates.length;

  for (const collection of [CMS.products, CMS.services, CMS.categories]) {
    const entities = await db.collection(collection).find({}, { projection: { name: 1, descriptionHtml: 1 } }).toArray();
    const updates = entities.flatMap(entity => {
      const descriptionHtml = normalizeFragmentHtml(entity.descriptionHtml, entity.name);
      return descriptionHtml === entity.descriptionHtml ? [] : [{ updateOne: { filter: { _id: entity._id }, update: { $set: { descriptionHtml, updatedAt: new Date() } } } }];
    });
    if (updates.length) await db.collection(collection).bulkWrite(updates, { ordered: false });
    result.normalizedDescriptions += updates.length;
  }

  return result;
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

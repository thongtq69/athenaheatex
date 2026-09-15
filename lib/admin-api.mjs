import Busboy from 'busboy';
import { load } from 'cheerio';
import { ObjectId } from 'mongodb';
import { currentAdmin, createAdminSession, destroyAdminSession, loginAllowed, noteFailedLogin } from './admin-auth.mjs';
import { CMS, cmsCounts, ensureCmsSeeded, objectId } from './cms.mjs';
import { getCloudinary } from './cloudinary.mjs';
import { getDb } from './mongodb.mjs';
import { normalizeDocumentHtml, normalizeFragmentHtml } from './html-normalize.mjs';
import { clientAddress, isAllowedOrigin } from './inquiries.mjs';
import { extractProductContent } from './product-content.mjs';
import { publicPathForAliasPath, publicPathForSourcePath, sourcePathForPublicPath } from './public-paths.mjs';

const RESOURCES = Object.freeze({
  pages: CMS.pages, sections: CMS.sections, products: CMS.products, services: CMS.services,
  categories: CMS.categories, banners: CMS.banners, media: CMS.media, inquiries: 'inquiries',
});
const LONG_FIELDS = new Set(['html', 'descriptionHtml']);
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const bool = (value, fallback = true) => value === undefined ? fallback : value === true || value === 'true' || value === 1;
const order = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const validImage = value => !value || /^https?:\/\//i.test(value) || /^\/[\w!$&'()*+,;=:@%./~-]+$/i.test(value);
const validPath = value => /^\/[\w!$&'()*+,;=:@%./~-]+\.html$/i.test(value) && !value.includes('..');
const validVideo = value => /^https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|vimeo\.com)\//i.test(value) || /^https?:\/\/[^\s]+\.mp4(?:[?#].*)?$/i.test(value) || /^\/[\w./~-]+\.mp4(?:[?#].*)?$/i.test(value);
const validLink = value => /^https?:\/\/[^\s]+$/i.test(value) || /^\/(?!\/)[^\s]*$/.test(value) || /^mailto:[^\s]+$/i.test(value) || /^tel:[^\s]+$/i.test(value);
const slug = value => text(value, 180).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `noi-dung-${Date.now()}`;

export function normalizeResource(resource, input = {}, current = {}) {
  const base = { ...current };
  delete base._id;
  delete base.createdAt;
  if (resource === 'pages') {
    const title = text(input.title ?? base.title, 500);
    const path = text(input.path ?? base.path, 500) || `/${slug(title)}.html`;
    const sourceHtml = String(input.html ?? base.html ?? '');
    if (!validPath(path)) throw new Error('Đường dẫn trang phải bắt đầu bằng / và kết thúc bằng .html.');
    if (!title || !sourceHtml || sourceHtml.length > 2_000_000) throw new Error('Tiêu đề và nội dung trang là bắt buộc (tối đa 2 MB).');
    const html = normalizeDocumentHtml(sourceHtml, title);
    return { ...base, path, title, html, type: text(input.type ?? base.type ?? 'page', 30), enabled: bool(input.enabled, base.enabled), sortOrder: order(input.sortOrder ?? base.sortOrder), seo: normalizeSeo(input.seo ?? base.seo) };
  }
  if (resource === 'sections') {
    const pagePath = text(input.pagePath ?? base.pagePath, 500);
    const name = text(input.name ?? base.name, 300);
    const selector = text(input.selector ?? base.selector ?? '#main', 300);
    const sourceHtml = String(input.html ?? base.html ?? '');
    try { loadSelector(selector); } catch { throw new Error('CSS selector của section không hợp lệ.'); }
    if ((!validPath(pagePath) && pagePath !== '*') || !name || !selector || sourceHtml.length > 1_000_000) throw new Error('Trang, tên và nội dung khối hợp lệ là bắt buộc.');
    const html = normalizeFragmentHtml(sourceHtml, name);
    return { ...base, pagePath, name, selector, html, mode: input.mode === 'replace' ? 'replace' : 'inner', enabled: bool(input.enabled, base.enabled), sortOrder: order(input.sortOrder ?? base.sortOrder) };
  }
  if (resource === 'products') {
    const name = text(input.name ?? base.name, 500);
    const legacy = extractProductContent(base.descriptionHtml || '');
    // A public page still needs a stable key. When the editor leaves the path
    // blank, retain the existing key or create one automatically for a new item.
    const path = text(input.path, 500) || text(base.path, 500) || `/${slug(name || 'san-pham')}.html`;
    const image = text(input.image ?? base.image, 2000);
    if (!validPath(path)) throw new Error('Đường dẫn sản phẩm không hợp lệ. Hãy để trống để hệ thống tự tạo.');
    if (!image || !validImage(image)) throw new Error('Ảnh đại diện là bắt buộc: hãy nhập URL http(s), đường dẫn nội bộ hoặc upload một file ảnh.');
    const specifications = (Array.isArray(input.specifications) ? input.specifications : base.specifications ?? legacy.specifications)
      .slice(0, 200).map(row => ({ label: text(row?.label, 300), value: text(row?.value, 3000) })).filter(row => row.label || row.value);
    const videos = (Array.isArray(input.videos) ? input.videos : base.videos ?? legacy.videos)
      .slice(0, 30).map(video => ({ url: text(video?.url, 2000), thumbnail: text(video?.thumbnail, 2000) })).filter(video => video.url);
    if (videos.some(video => !validVideo(video.url) || !validImage(video.thumbnail))) throw new Error('Video phải là link YouTube, Vimeo hoặc MP4 hợp lệ.');
    const gallery = [...new Set((Array.isArray(input.gallery) ? input.gallery : base.gallery ?? []).map(url => text(url, 2000)).filter(Boolean))].slice(0, 40);
    if (gallery.some(url => !validImage(url))) throw new Error('Ảnh bổ sung không hợp lệ.');
    const description = input.descriptionHtml ?? (Array.isArray(base.specifications) ? base.descriptionHtml : legacy.descriptionHtml);
    return { ...base, name, path, categoryId: text(input.categoryId ?? base.categoryId, 100), summary: text(input.summary ?? base.summary, 3000), descriptionHtml: normalizeFragmentHtml(String(description || '').slice(0, 1_000_000), name), specifications, videos, gallery, image, seo: normalizeSeo(input.seo ?? base.seo), enabled: bool(input.enabled, base.enabled), sortOrder: order(input.sortOrder ?? base.sortOrder) };
  }
  if (resource === 'services') {
    const name = text(input.name ?? base.name, 500);
    const path = text(input.path, 500) || text(base.path, 500) || `/${slug(name || 'dich-vu')}.html`;
    const image = text(input.image ?? base.image, 2000);
    if (!validPath(path)) throw new Error('Đường dẫn dịch vụ không hợp lệ. Hãy để trống để hệ thống tự tạo.');
    if (!image || !validImage(image)) throw new Error('Ảnh đại diện là bắt buộc: hãy nhập URL http(s), đường dẫn nội bộ hoặc upload một file ảnh.');
    return { ...base, name, path, categoryId: text(input.categoryId ?? base.categoryId, 100), summary: text(input.summary ?? base.summary, 3000), descriptionHtml: normalizeFragmentHtml(String(input.descriptionHtml ?? base.descriptionHtml ?? '').slice(0, 1_000_000), name), image, seo: normalizeSeo(input.seo ?? base.seo), enabled: bool(input.enabled, base.enabled), sortOrder: order(input.sortOrder ?? base.sortOrder) };
  }
  if (resource === 'categories') {
    const name = text(input.name ?? base.name, 500);
    const path = text(input.path, 500) || text(base.path, 500) || `/${slug(name || 'danh-muc')}.html`;
    const image = text(input.image ?? base.image, 2000);
    if (!validPath(path)) throw new Error('Đường dẫn danh mục không hợp lệ. Hãy để trống để hệ thống tự tạo.');
    if (!image || !validImage(image)) throw new Error('Ảnh đại diện là bắt buộc: hãy nhập URL http(s), đường dẫn nội bộ hoặc upload một file ảnh.');
    const productPaths = Array.isArray(input.productPaths)
      ? [...new Set(input.productPaths.map(value => text(value, 500)).filter(value => validPath(value)))].slice(0, 500)
      : Array.isArray(base.productPaths) ? base.productPaths : [];
    return { ...base, name, path, parentId: text(input.parentId ?? base.parentId, 100), productPaths, descriptionHtml: normalizeFragmentHtml(String(input.descriptionHtml ?? base.descriptionHtml ?? '').slice(0, 1_000_000), name), image, kind: input.kind === 'service' ? 'service' : 'product', enabled: bool(input.enabled, base.enabled), sortOrder: order(input.sortOrder ?? base.sortOrder) };
  }
  if (resource === 'banners') {
    const title = text(input.title ?? base.title, 500);
    const image = text(input.image ?? base.image, 2000);
    const url = text(input.url ?? base.url ?? '/index.html', 2000);
    if (!title || !image || !validImage(image) || !(validImage(url) || validPath(url))) throw new Error('Tên, ảnh và liên kết banner không hợp lệ.');
    return { ...base, title, image, url, alt: text(input.alt ?? base.alt ?? title, 500), enabled: bool(input.enabled, base.enabled), sortOrder: order(input.sortOrder ?? base.sortOrder) };
  }
  if (resource === 'media') {
    const name = text(input.name ?? base.name, 500);
    const url = text(input.url ?? base.url, 2000);
    if (!name || !url || !validImage(url)) throw new Error('Tên và URL ảnh hợp lệ là bắt buộc.');
    const value = { ...base, name, url, alt: text(input.alt ?? base.alt, 500), sourceType: /^https?:\/\//i.test(url) ? 'external' : 'local', enabled: bool(input.enabled, base.enabled), sortOrder: order(input.sortOrder ?? base.sortOrder) };
    if (url !== base.url) {
      delete value.publicId;
      delete value.width;
      delete value.height;
      delete value.bytes;
    }
    return value;
  }
  if (resource === 'inquiries') {
    const allowed = ['new', 'processing', 'done', 'spam'];
    const status = text(input.status ?? base.status, 30);
    if (!allowed.includes(status)) throw new Error('Trạng thái inquiry không hợp lệ.');
    return { status };
  }
  throw new Error('Loại nội dung không được hỗ trợ.');
}

function normalizeSeo(value = {}) {
  return { title: text(value.title, 500), description: text(value.description, 1000), keywords: text(value.keywords, 1000) };
}

function loadSelector(selector) {
  // CSS.escape is not available in Node; Cheerio's selector parser is exercised
  // by a tiny detached document without retaining any user content.
  return load('<div></div>')(selector);
}

function normalizeSettings(input = {}, current = {}) {
  const links = (name, limit) => {
    if (!Array.isArray(input[name]) && !Array.isArray(current[name])) return undefined;
    const source = Array.isArray(input[name]) ? input[name] : current[name];
    const items = source.slice(0, limit).map(item => ({ label: text(item?.label, 120), url: text(item?.url, 2000) })).filter(item => item.label || item.url);
    if (items.some(item => !item.label || !item.url || !validLink(item.url))) throw new Error(`Liên kết trong ${name} không hợp lệ.`);
    return items;
  };
  const value = {
    ...current, _id: 'global', siteName: text(input.siteName ?? current.siteName, 300),
    phone: text(input.phone ?? current.phone, 100), mobile: text(input.mobile ?? current.mobile, 100), fax: text(input.fax ?? current.fax, 100),
    email: text(input.email ?? current.email, 320), secondaryEmail: text(input.secondaryEmail ?? current.secondaryEmail, 320),
    address: text(input.address ?? current.address, 1000), whatsapp: text(input.whatsapp ?? current.whatsapp, 100),
    copyright: text(input.copyright ?? current.copyright, 500), logo: text(input.logo ?? current.logo, 2000), logoLink: text(input.logoLink ?? current.logoLink ?? '/', 2000), favicon: text(input.favicon ?? current.favicon, 2000),
    navLinks: links('navLinks', 8), socialLinks: links('socialLinks', 5), defaultSeo: normalizeSeo(input.defaultSeo ?? current.defaultSeo), updatedAt: new Date(),
  };
  if (value.email && !/^\S+@\S+\.\S+$/.test(value.email)) throw new Error('Email liên hệ không hợp lệ.');
  if (value.secondaryEmail && !/^\S+@\S+\.\S+$/.test(value.secondaryEmail)) throw new Error('Email phụ không hợp lệ.');
  if (!validImage(value.logo) || !validImage(value.favicon) || !validLink(value.logoLink)) throw new Error('Logo, favicon hoặc liên kết logo không hợp lệ.');
  return value;
}

function globalControlsFromHtml(html = '') {
  const $ = load(html);
  return {
    logo: $('#logo img').first().attr('src') || '', logoLink: $('#logo a').first().attr('href') || '/',
    navLinks: $('#nav > .center > ul > li > a.bt').map((_, node) => ({ label: text($(node).text(), 120), url: $(node).attr('href') || '/' })).get(),
    socialLinks: $('.footShare a[href]').map((_, node) => ({ label: $(node).attr('aria-label') || $(node).attr('title') || 'Liên kết', url: $(node).attr('href') || '' })).get(),
  };
}

async function pageSections(db, path) {
  return db.collection(CMS.sections).find({ pagePath: path, enabled: true }).sort({ sortOrder: 1 }).toArray();
}
function effectivePageHtml(html, sections) {
  const $ = load(html || '', { decodeEntities: false });
  for (const section of sections) { try { const target=$(section.selector).first();if(target.length && section.mode==='inner')target.html(section.html || ''); } catch {} }
  return $.html();
}

function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}

function cleanDocument(document) {
  if (!document) return document;
  return { ...document, _id: String(document._id), pageId: document.pageId ? String(document.pageId) : document.pageId,
    ...(document.path ? { publicUrl: publicPathForSourcePath(document.path) } : {}) };
}

async function ensureEntityPage(db, resource, entity, id) {
  if (!['products', 'services', 'categories'].includes(resource)) return;
  const type = resource === 'products' ? 'product' : resource === 'categories' ? 'category' : 'page';
  let page = await db.collection(CMS.pages).findOne({ sourceEntityId: String(id) });
  if (!page) {
    const template = resource === 'services'
      ? await db.collection(CMS.pages).findOne({ path: '/service-4.html' })
      : await db.collection(CMS.pages).findOne({ type }, { sort: { source: 1, sortOrder: 1 } });
    if (!template) throw new Error('Không tìm thấy trang mẫu để tạo trang public.');
    const { _id, ...copy } = template;
    page = { ...copy, path: entity.path, title: entity.name, source: 'cms', sourceEntityId: String(id), createdAt: new Date(), updatedAt: new Date(), enabled: entity.enabled };
    await db.collection(CMS.pages).insertOne(page);
  } else {
    await db.collection(CMS.pages).updateOne({ _id: page._id }, { $set: { path: entity.path, title: entity.name, enabled: entity.enabled, updatedAt: new Date() } });
  }
}

async function assertEntityPathAvailable(db, path, entityId = '') {
  const page = await db.collection(CMS.pages).findOne({ path }, { projection: { sourceEntityId: 1 } });
  if (page && page.sourceEntityId !== String(entityId)) {
    throw Object.assign(new Error('Đường dẫn đã được một trang khác sử dụng.'), { status: 409 });
  }
}

async function availableGeneratedPath(db, candidate) {
  const stem = candidate.endsWith('.html') ? candidate.slice(0, -5) : candidate;
  for (let suffix = 1; suffix <= 10_000; suffix += 1) {
    let ordinal = suffix, letters = '';
    while (ordinal > 0) { ordinal -= 1; letters = String.fromCharCode(97 + ordinal % 26) + letters; ordinal = Math.floor(ordinal / 26); }
    const path = suffix === 1 ? `${stem}.html` : `${stem}-ban-${letters}.html`;
    const visitor = publicPathForSourcePath(path);
    if (sourcePathForPublicPath(visitor) !== path || publicPathForAliasPath(visitor)) continue;
    if (!await db.collection(CMS.pages).findOne({ path }, { projection: { _id: 1 } })) return path;
  }
  throw new Error('Không thể tự tạo đường dẫn sản phẩm. Vui lòng thử lại.');
}

async function mediaUsage(db, url) {
  if (!url) return 0;
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const counts = await Promise.all([
    db.collection(CMS.products).countDocuments({ image: url }), db.collection(CMS.services).countDocuments({ image: url }),
    db.collection(CMS.categories).countDocuments({ image: url }), db.collection(CMS.banners).countDocuments({ image: url }),
    db.collection(CMS.products).countDocuments({ gallery: url }), db.collection(CMS.products).countDocuments({ 'videos.thumbnail': url }),
    db.collection(CMS.settings).countDocuments({ $or: [{ logo: url }, { favicon: url }] }),
    db.collection(CMS.pages).countDocuments({ html: { $regex: escaped } }), db.collection(CMS.sections).countDocuments({ html: { $regex: escaped } }),
  ]);
  return counts.reduce((sum, value) => sum + value, 0);
}

async function replaceMediaReferences(db, oldUrl, newUrl) {
  if (!oldUrl || oldUrl === newUrl) return;
  await Promise.all([CMS.products, CMS.services, CMS.categories, CMS.banners].map(name => db.collection(name).updateMany({ image: oldUrl }, { $set: { image: newUrl, updatedAt: new Date() } })));
  const products = await db.collection(CMS.products).find({ $or: [{ gallery: oldUrl }, { 'videos.thumbnail': oldUrl }] }, { projection: { gallery: 1, videos: 1 } }).toArray();
  if (products.length) await db.collection(CMS.products).bulkWrite(products.map(item => ({ updateOne: { filter: { _id: item._id }, update: { $set: {
    gallery: (item.gallery || []).map(url => url === oldUrl ? newUrl : url),
    videos: (item.videos || []).map(video => video.thumbnail === oldUrl ? { ...video, thumbnail: newUrl } : video), updatedAt: new Date(),
  } } } })));
  await db.collection(CMS.settings).updateOne({ _id: 'global', logo: oldUrl }, { $set: { logo: newUrl, updatedAt: new Date() } });
  await db.collection(CMS.settings).updateOne({ _id: 'global', favicon: oldUrl }, { $set: { favicon: newUrl, updatedAt: new Date() } });
  for (const [collectionName, field] of [[CMS.pages, 'html'], [CMS.sections, 'html']]) {
    const documents = await db.collection(collectionName).find({ [field]: { $regex: oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') } }, { projection: { [field]: 1 } }).toArray();
    if (documents.length) await db.collection(collectionName).bulkWrite(documents.map(document => ({ updateOne: { filter: { _id: document._id }, update: { $set: { [field]: String(document[field] || '').split(oldUrl).join(newUrl), updatedAt: new Date() } } } })));
  }
}

async function parseUpload(req) {
  return new Promise((resolve, reject) => {
    let uploadPromise;
    let fileSeen = false;
    const fields = {};
    let parser;
    try { parser = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 10 * 1024 * 1024, fields: 10 } }); }
    catch (error) { reject(new Error('Dữ liệu upload không hợp lệ.')); return; }
    parser.on('field', (name, value) => { fields[name] = text(value, 500); });
    parser.on('file', (_, file, info) => {
      fileSeen = true;
      if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/i.test(info.mimeType)) {
        file.resume(); uploadPromise = Promise.reject(new Error('Chỉ chấp nhận PNG, JPG, WEBP, GIF hoặc SVG.')); return;
      }
      uploadPromise = new Promise((done, fail) => {
        const stream = getCloudinary().uploader.upload_stream({ folder: process.env.CLOUDINARY_FOLDER || 'athenaheatex', resource_type: 'image', use_filename: true, unique_filename: true }, (error, result) => error ? fail(error) : done(result));
        file.on('limit', () => fail(new Error('Ảnh vượt quá giới hạn 10 MB.')));
        file.pipe(stream);
      });
    });
    parser.on('error', reject);
    parser.on('finish', async () => {
      try {
        if (!fileSeen || !uploadPromise) throw new Error('Vui lòng chọn một file ảnh.');
        resolve({ result: await uploadPromise, fields });
      } catch (error) { reject(error); }
    });
    if (req.readableEnded && Buffer.isBuffer(req.body)) parser.end(req.body);
    else req.pipe(parser);
  });
}

function searchFilter(resource, query) {
  const filter = {};
  if (query) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fields = resource === 'inquiries' ? ['name', 'email', 'company', 'message'] : resource === 'pages' ? ['title', 'path'] : ['name', 'title', 'path', 'url'];
    filter.$or = fields.map(field => ({ [field]: { $regex: escaped, $options: 'i' } }));
  }
  return filter;
}

export async function handleAdminApi(req, res, url, readJson) {
  await ensureCmsSeeded();
  const parts = url.pathname.replace(/^\/api\/admin\/?/, '').split('/').filter(Boolean);
  const action = parts[0] || 'session';
  const method = req.method || 'GET';
  const address = clientAddress(req.headers, req.socket?.remoteAddress);

  if (action === 'login' && method === 'POST') {
    if (!loginAllowed(address)) return send(res, 429, { error: 'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau.' });
    const input = await readJson(req, 64 * 1024);
    const admin = await createAdminSession(req, res, text(input.username, 200), String(input.password || ''));
    if (!admin) { noteFailedLogin(address); return send(res, 401, { error: 'Tên đăng nhập hoặc mật khẩu không đúng.' }); }
    return send(res, 200, { ok: true, admin });
  }

  const admin = await currentAdmin(req);
  if (action === 'session' && method === 'GET') return send(res, admin ? 200 : 401, admin ? { ok: true, admin } : { error: 'Chưa đăng nhập.' });
  if (!admin) return send(res, 401, { error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  if (!['GET', 'HEAD'].includes(method) && !isAllowedOrigin(req.headers.origin, req.headers.host)) return send(res, 403, { error: 'Yêu cầu khác nguồn bị từ chối.' });
  if (action === 'logout' && method === 'POST') { await destroyAdminSession(req, res); return send(res, 200, { ok: true }); }

  const db = await getDb();
  if (action === 'dashboard' && method === 'GET') {
    return send(res, 200, { counts: await cmsCounts() });
  }
  if (action === 'settings') {
    const current = await db.collection(CMS.settings).findOne({ _id: 'global' }) || { _id: 'global' };
    if (method === 'GET') {
      const home = await db.collection(CMS.pages).findOne({ path: '/index.html' }, { projection: { html: 1 } });
      const imported = globalControlsFromHtml(home?.html || '');
      if (current.whatsapp && !current.socialLinks) imported.socialLinks = imported.socialLinks.map(link => /whatsapp/i.test(link.label) ? { ...link, url: `https://wa.me/${current.whatsapp.replace(/\D/g, '')}` } : link);
      return send(res, 200, { item: cleanDocument({ ...current, logo: current.logo ?? imported.logo, logoLink: current.logoLink ?? imported.logoLink,
        navLinks: current.navLinks ?? imported.navLinks, socialLinks: current.socialLinks ?? imported.socialLinks }) });
    }
    if (method === 'PUT') {
      const input = await readJson(req, 256 * 1024);
      const value = normalizeSettings(input, current);
      await db.collection(CMS.settings).replaceOne({ _id: 'global' }, value, { upsert: true });
      return send(res, 200, { ok: true, item: cleanDocument(value) });
    }
    return send(res, 405, { error: 'Phương thức không được hỗ trợ.' });
  }
  if (action === 'media' && parts[1] === 'upload' && method === 'POST') {
    try {
      const { result, fields } = await parseUpload(req);
      const now = new Date();
      const item = { name: fields.name || result.original_filename || result.public_id, url: result.secure_url, alt: fields.alt || '', publicId: result.public_id, width: result.width, height: result.height, bytes: result.bytes, sourceType: 'upload', enabled: true, sortOrder: Date.now(), createdAt: now, updatedAt: now };
      const inserted = await db.collection(CMS.media).insertOne(item);
      return send(res, 201, { ok: true, item: cleanDocument({ _id: inserted.insertedId, ...item }) });
    } catch (error) { return send(res, 400, { error: error.message || 'Không upload được ảnh.' }); }
  }
  if (action === 'media' && parts[2] === 'upload' && method === 'POST') {
    const id = objectId(parts[1]);
    if (!id) return send(res, 400, { error: 'ID ảnh không hợp lệ.' });
    const collection = db.collection(CMS.media);
    const current = await collection.findOne({ _id: id });
    if (!current) return send(res, 404, { error: 'Không tìm thấy ảnh.' });
    let uploaded;
    try {
      const { result, fields } = await parseUpload(req);
      uploaded = result;
      const now = new Date();
      const item = {
        ...current,
        name: fields.name || current.name || result.original_filename || result.public_id,
        url: result.secure_url,
        alt: fields.alt || current.alt || '',
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        sourceType: 'upload',
        updatedAt: now,
      };
      await collection.replaceOne({ _id: id }, item);
      try { await replaceMediaReferences(db, current.url, item.url); }
      catch (error) {
        await collection.replaceOne({ _id: id }, current);
        throw error;
      }
      if (current.publicId && current.publicId !== item.publicId) {
        await getCloudinary().uploader.destroy(current.publicId, { resource_type: 'image', invalidate: true }).catch(() => {});
      }
      return send(res, 200, { ok: true, item: cleanDocument(item) });
    } catch (error) {
      if (uploaded?.public_id) await getCloudinary().uploader.destroy(uploaded.public_id, { resource_type: 'image', invalidate: true }).catch(() => {});
      return send(res, 400, { error: error.message || 'Không thay được ảnh.' });
    }
  }

  const collectionName = RESOURCES[action];
  if (!collectionName) return send(res, 404, { error: 'API không tồn tại.' });
  const collection = db.collection(collectionName);
  if (parts[1] === 'reorder' && method === 'POST') {
    const input = await readJson(req, 256 * 1024);
    if (!Array.isArray(input.ids) || input.ids.length > 10000) return send(res, 400, { error: 'Danh sách sắp xếp không hợp lệ.' });
    const operations = input.ids.map((id, index) => objectId(id)).filter(Boolean).map((_id, index) => ({ updateOne: { filter: { _id }, update: { $set: { sortOrder: index, updatedAt: new Date() } } } }));
    if (operations.length) await collection.bulkWrite(operations);
    return send(res, 200, { ok: true, updated: operations.length });
  }

  const id = parts[1] ? objectId(parts[1]) : null;
  if (parts[1] && !id) return send(res, 400, { error: 'ID không hợp lệ.' });
  try {
    if (method === 'GET' && id) {
      const item = await collection.findOne({ _id: id });
      if (item && action === 'pages') {
        const sections = await pageSections(db, item.path);
        return send(res, 200, { item: cleanDocument({ ...item, html: effectivePageHtml(item.html, sections) }) });
      }
      if (item && action === 'products') {
        const page = await db.collection(CMS.pages).findOne({ path: item.path }, { projection: { html: 1 } });
        const imported = extractProductContent(item.descriptionHtml || '', page?.html || '');
        return send(res, 200, { item: cleanDocument({ ...item,
          descriptionHtml: Array.isArray(item.specifications) ? item.descriptionHtml : imported.descriptionHtml,
          specifications: item.specifications ?? imported.specifications,
          videos: item.videos ?? imported.videos,
          gallery: item.gallery ?? imported.gallery,
        }) });
      }
      return item ? send(res, 200, { item: cleanDocument(item) }) : send(res, 404, { error: 'Không tìm thấy nội dung.' });
    }
    if (method === 'GET') {
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100) || 100, 1), 500);
      const skip = Math.max(Number(url.searchParams.get('skip') || 0) || 0, 0);
      const filter = searchFilter(action, text(url.searchParams.get('q'), 200));
      if (url.searchParams.get('pagePath')) filter.pagePath = url.searchParams.get('pagePath');
      if (url.searchParams.get('categoryId')) filter.categoryId = url.searchParams.get('categoryId');
      if (url.searchParams.get('idsOnly') === 'true') {
        const items = await collection.find(filter, { projection: { _id: 1 } }).sort({ sortOrder: 1, updatedAt: -1, createdAt: -1 }).limit(10001).toArray();
        if (items.length > 10000) return send(res, 400, { error: 'Quá nhiều mục để sắp xếp cùng lúc.' });
        return send(res, 200, { items: items.map(cleanDocument) });
      }
      const projection = Object.fromEntries([...LONG_FIELDS].map(field => [field, 0]));
      const [items, total] = await Promise.all([collection.find(filter, { projection }).sort({ sortOrder: 1, updatedAt: -1, createdAt: -1 }).skip(skip).limit(limit).toArray(), collection.countDocuments(filter)]);
      return send(res, 200, { items: items.map(cleanDocument), total, limit, skip });
    }
    if (method === 'POST') {
      const input = await readJson(req, 2_200_000);
      const now = new Date();
      const value = { ...normalizeResource(action, input), source: 'cms', createdAt: now, updatedAt: now };
      if (['pages', 'products', 'services', 'categories'].includes(action) && !text(input.path, 500)) value.path = await availableGeneratedPath(db, value.path);
      if (['products', 'services', 'categories'].includes(action)) await assertEntityPathAvailable(db, value.path);
      const inserted = await collection.insertOne(value);
      try { await ensureEntityPage(db, action, value, inserted.insertedId); }
      catch (error) { await collection.deleteOne({ _id: inserted.insertedId }); throw error; }
      return send(res, 201, { ok: true, item: cleanDocument({ _id: inserted.insertedId, ...value }) });
    }
    if (method === 'PUT' && id) {
      const current = await collection.findOne({ _id: id });
      if (!current) return send(res, 404, { error: 'Không tìm thấy nội dung.' });
      const input = await readJson(req, 2_200_000);
      const value = { ...normalizeResource(action, input, current), updatedAt: new Date() };
      if (['products', 'services', 'categories'].includes(action) && value.path !== current.path) await assertEntityPathAvailable(db, value.path, id);
      if (action === 'media' && current.enabled !== false && value.enabled === false && await mediaUsage(db, current.url)) {
        return send(res, 409, { error: 'Ảnh đang được sử dụng trên website nên không thể tắt. Hãy thay ảnh tại nội dung liên quan trước.' });
      }
      if (action === 'media' && value.url !== current.url) {
        const existing = await collection.findOne({ url: value.url, _id: { $ne: id } });
        if (existing) {
          await replaceMediaReferences(db, current.url, existing.url);
          const merged = { ...existing, enabled: true, updatedAt: new Date() };
          await collection.replaceOne({ _id: existing._id }, merged);
          await collection.deleteOne({ _id: id });
          if (current.publicId) await getCloudinary().uploader.destroy(current.publicId, { resource_type: 'image', invalidate: true }).catch(() => {});
          return send(res, 200, { ok: true, merged: true, item: cleanDocument(merged) });
        }
        await replaceMediaReferences(db, current.url, value.url);
      }
      await collection.updateOne({ _id: id }, { $set: value });
      if (action === 'pages' && input.html !== undefined) {
        try {
          const $ = load(value.html, { decodeEntities: false });
          for (const section of await pageSections(db, current.path)) {
            if (section.mode !== 'inner') continue;
            const target = $(section.selector).first();
            if (target.length) await db.collection(CMS.sections).updateOne({ _id: section._id }, { $set: { html: target.html() || '', updatedAt: new Date() } });
          }
        } catch (error) { await collection.replaceOne({ _id: id }, current);throw error; }
      }
      if (action === 'media' && value.url !== current.url && current.publicId) {
        await getCloudinary().uploader.destroy(current.publicId, { resource_type: 'image', invalidate: true }).catch(() => {});
      }
      try { await ensureEntityPage(db, action, value, id); }
      catch (error) { await collection.replaceOne({ _id: id }, current); throw error; }
      return send(res, 200, { ok: true, item: cleanDocument({ ...current, ...value }) });
    }
    if (method === 'DELETE' && id) {
      if (url.searchParams.get('confirm') !== 'true') return send(res, 400, { error: 'Cần xác nhận xoá.' });
      const current = await collection.findOne({ _id: id });
      if (!current) return send(res, 404, { error: 'Không tìm thấy nội dung.' });
      if (action === 'media' && await mediaUsage(db, current.url)) return send(res, 409, { error: 'Ảnh đang được dùng trên website. Hãy thay ảnh tại nội dung liên quan trước khi xoá.' });
      if (action === 'media' && current.publicId) await getCloudinary().uploader.destroy(current.publicId, { resource_type: 'image', invalidate: true });
      await collection.deleteOne({ _id: id });
      if (['products', 'services', 'categories'].includes(action)) await db.collection(CMS.pages).deleteOne({ sourceEntityId: String(id) });
      if (action === 'categories') await db.collection(CMS.products).updateMany({ categoryId: String(id) }, { $set: { categoryId: '', updatedAt: new Date() } });
      if (action === 'pages') {
        await db.collection(CMS.sections).deleteMany({ pagePath: current.path });
        if (current.sourceEntityId) {
          const entityId = objectId(current.sourceEntityId);
          if (entityId) await Promise.all([CMS.products, CMS.services, CMS.categories].map(name => db.collection(name).deleteOne({ _id: entityId })));
        }
      }
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'Phương thức không được hỗ trợ.' });
  } catch (error) {
    if (error?.code === 11000) return send(res, 409, { error: 'Đường dẫn hoặc URL đã tồn tại.' });
    return send(res, error?.status || 400, { error: error.message || 'Không xử lý được yêu cầu.' });
  }
}

import { once } from 'node:events';
import { load } from 'cheerio';
import { createServer } from '../server.mjs';
import { ensureCmsSeeded } from '../lib/cms.mjs';
import { closeDatabase } from '../lib/mongodb.mjs';
import { PUBLIC_PATHS } from '../lib/public-path-map.mjs';

if (!process.env.ADMIN_PASSWORD) throw new Error('test:cms requires ADMIN_PASSWORD');
const externalBase = String(process.env.CMS_BASE_URL || '').replace(/\/+$/, '');
let server;
let base = externalBase;
if (!externalBase) {
  if (!process.env.MONGODB_URI) throw new Error('local test:cms requires MONGODB_URI');
  await ensureCmsSeeded();
  server = createServer({ useDatabase: true, useCms: true });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
}
let cookie = '';
const created = { pages: [], sections: [], products: [], services: [], categories: [], banners: [], media: [] };
let originalSettings;
const checks = [];

function check(condition, name) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  checks.push(name);
  console.log(`ok  ${name}`);
}

async function request(path, { method = 'GET', body, form, authenticated = true } = {}) {
  const headers = { Origin: base };
  if (authenticated && cookie) headers.Cookie = cookie;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const response = await fetch(base + path, { method, headers, body: payload, redirect: 'manual' });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('json') ? await response.json() : await response.text();
  return { response, data };
}

async function create(resource, body) {
  const result = await request(`/api/admin/${resource}`, { method: 'POST', body });
  if (result.response.status !== 201) throw new Error(`${resource} create failed: ${JSON.stringify(result.data)}`);
  created[resource].push(result.data.item._id);
  return result.data.item;
}

async function remove(resource, id) {
  const result = await request(`/api/admin/${resource}/${id}?confirm=true`, { method: 'DELETE' });
  if (result.response.ok) created[resource] = created[resource].filter(value => value !== id);
  return result;
}

const tag = `cms-e2e-${Date.now()}`;
try {
  let result = await request('/api/admin/pages', { authenticated: false });
  check(result.response.status === 401, 'API Admin từ chối truy cập chưa đăng nhập');

  result = await request('/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'wrong-password' }, authenticated: false });
  check(result.response.status === 401, 'đăng nhập sai bị từ chối');
  result = await request('/api/admin/login', { method: 'POST', body: { username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD }, authenticated: false });
  check(result.response.status === 200 && result.data.ok, 'đăng nhập đúng tạo session');
  cookie = String(result.response.headers.get('set-cookie') || '').split(';')[0];
  check(Boolean(cookie), 'session dùng cookie HttpOnly');

  result = await request('/api/admin/dashboard');
  check(result.response.ok && result.data.counts.pages >= 280, 'dashboard đọc số liệu database thật');
  result = await request('/machinery-2.html');
  check(result.response.status === 308 && result.response.headers.get('location') === '/may-moc', 'đường dẫn Máy móc cũ chuyển sang /may-moc');
  result = await request('/may-moc');
  check(result.response.ok && result.data.includes('href="/may-moc"') && !result.data.includes('href="/machinery-2.html"') && result.data.includes('rel="canonical"'), 'Máy móc hiển thị tại URL tiếng Việt với liên kết và canonical đúng');
  result = await request('/api/admin/products', { method: 'POST', body: { name: `${tag} collision`, path: '/index.html', image: 'https://example.com/collision.jpg' } });
  check(result.response.status === 409, 'CREATE sản phẩm từ chối đường dẫn trang đã dùng');
  result = await request(`/api/admin/products?q=${encodeURIComponent(`${tag} collision`)}`);
  check(result.response.ok && result.data.total === 0, 'CREATE lỗi không để lại sản phẩm mồ côi');
  result = await request('/api/admin/media?limit=2&skip=2');
  check(result.response.ok && result.data.items.length === 2 && result.data.total >= 432, 'phân trang API chỉ tải số mục cần hiển thị');
  result = await request('/api/admin/media?idsOnly=true');
  check(result.response.ok && result.data.items.length >= 432 && result.data.items.every(item => item._id && !item.url), 'API sắp xếp chỉ tải ID, không tải ảnh');

  const category = await create('categories', { name: `${tag} category`, path: `/${tag}-category.html`, image: 'https://example.com/cms-category.jpg', kind: 'product', enabled: true, sortOrder: 99999, descriptionHtml: '<p>Danh mục kiểm thử</p>' });
  check(Boolean(category._id), 'CREATE danh mục');
  const product = await create('products', { name: `${tag} product`, path: `/${tag}-product.html`, categoryId: category._id, summary: 'URL image test', descriptionHtml: '<p>Nội dung sản phẩm từ CMS</p>', image: 'https://example.com/cms-image-url.jpg', enabled: true, sortOrder: 99999, seo: { title: `${tag} SEO` } });
  check(Boolean(product._id), 'CREATE sản phẩm với URL ảnh');
  result = await request('/api/admin/products', { method: 'POST', body: { name: '', path: '', image: '' } });
  check(result.response.status === 400, 'ảnh đại diện vẫn bắt buộc khi không nhập URL và không upload file');
  const optionalProduct = await create('products', { name: '', path: '', image: 'https://example.com/optional-product.jpg', enabled: true, sortOrder: 99998 });
  check(optionalProduct.name === '' && /^\/san-pham(?:-\d+)?\.html$/.test(optionalProduct.path), 'tên và đường dẫn được phép để trống, đường dẫn public tự tạo duy nhất');
  const secondOptionalProduct = await create('products', { name: '', path: '', image: 'https://example.com/optional-product-2.jpg', enabled: true, sortOrder: 99997 });
  check(secondOptionalProduct.path !== optionalProduct.path, 'nhiều sản phẩm cùng để trống đường dẫn vẫn được lưu với URL không trùng');
  result = await request(optionalProduct.path);
  check(result.response.ok && result.data.includes('https://example.com/optional-product.jpg'), 'sản phẩm chỉ có URL ảnh được lưu và đồng bộ ra website');
  result = await request(`/api/admin/products/${optionalProduct._id}`, { method: 'PUT', body: { name: '', path: '' } });
  check(result.response.ok && result.data.item.path === optionalProduct.path, 'chỉnh sửa để trống tên và đường dẫn vẫn lưu, giữ nguyên URL public');
  result = await request('/api/admin/categories', { method: 'POST', body: { name: '', path: '', image: '' } });
  check(result.response.status === 400, 'danh mục chỉ chặn lưu khi thiếu ảnh đại diện');
  const optionalCategory = await create('categories', { name: '', path: '', image: 'https://example.com/optional-category.jpg', kind: 'product', enabled: true, sortOrder: 99996 });
  check(optionalCategory.name === '' && /^\/danh-muc(?:-\d+)?\.html$/.test(optionalCategory.path), 'danh mục cho phép để trống tên và đường dẫn');
  result = await request(optionalCategory.path);
  check(result.response.ok && result.data.includes('https://example.com/optional-category.jpg'), 'ảnh đại diện danh mục đồng bộ ra website');
  result = await request(PUBLIC_PATHS['/2_2.html']);
  const renderedCategory = load(result.data);
  check(result.response.ok && renderedCategory('.proDisplay').length === 1 && renderedCategory('[id="pageNum"]').length === 1, 'danh mục import không nhân đôi lưới sản phẩm và phân trang');
  result = await request('/dich-vu');
  const renderedService = load(result.data);
  check(result.response.ok && renderedService('#aside').length === 1 && renderedService('#location').length === 1, 'dịch vụ import không nhân đôi sidebar và breadcrumb');
  result = await request(`/api/admin/products/${product._id}`, { method: 'PUT', body: { path: '/index.html' } });
  check(result.response.status === 409, 'UPDATE sản phẩm từ chối đường dẫn trang đã dùng');
  result = await request(`/api/admin/products/${product._id}`);
  check(result.data.item.path === `/${tag}-product.html`, 'UPDATE lỗi giữ nguyên sản phẩm và trang public');
  result = await request(`/${tag}-product.html`);
  check(result.response.status === 200 && result.data.includes(`${tag} product`) && result.data.includes('https://example.com/cms-image-url.jpg'), 'Admin → website đồng bộ sản phẩm và URL ảnh');
  const renderedProduct = load(result.data);
  check(renderedProduct('[id="pagetitle"]').length <= 1, 'HTML sản phẩm không có ID biểu mẫu trùng');
  check(renderedProduct('.crm-form form').toArray().every(formNode => renderedProduct(formNode).attr('action') === '/api/inquiries' && renderedProduct(formNode).attr('method') === 'post'), 'biểu mẫu public dùng API cùng website');

  result = await request(`/api/admin/products/${product._id}`, { method: 'PUT', body: { name: `${tag} product updated` } });
  check(result.response.ok, 'UPDATE sản phẩm');
  result = await request(`/${tag}-product.html`);
  check(result.data.includes(`${tag} product updated`), 'website public nhận UPDATE ngay');
  result = await request(`/api/admin/products/${product._id}`, { method: 'PUT', body: { enabled: false } });
  result = await request(`/${tag}-product.html`);
  check(result.response.status === 404, 'bật/tắt sản phẩm điều khiển public');
  await request(`/api/admin/products/${product._id}`, { method: 'PUT', body: { enabled: true } });

  const service = await create('services', { name: `${tag} service`, path: `/${tag}-service.html`, image: 'https://example.com/cms-service.jpg', descriptionHtml: '<h1>Dịch vụ CMS thật</h1>', enabled: true, sortOrder: 99999 });
  result = await request(`/${tag}-service.html`);
  check(result.response.ok && result.data.includes('Dịch vụ CMS thật') && result.data.includes('https://example.com/cms-service.jpg'), 'CRUD dịch vụ và ảnh đại diện đồng bộ trang public thật');
  const optionalService = await create('services', { name: '', path: '', image: 'https://example.com/optional-service.jpg', enabled: true, sortOrder: 99995 });
  check(optionalService.name === '' && /^\/dich-vu(?:-\d+)?\.html$/.test(optionalService.path), 'dịch vụ cho phép để trống tên và đường dẫn');
  result = await request(optionalService.path);
  check(result.response.ok && result.data.includes('https://example.com/optional-service.jpg'), 'dịch vụ chỉ có ảnh đại diện vẫn đồng bộ ra website');

  const page = await create('pages', { title: `${tag} page`, path: `/${tag}-page.html`, type: 'page', enabled: true, sortOrder: 99999, seo: { title: `${tag} page SEO` }, html: '<!doctype html><html><head><title>base</title></head><body><main id="main"><div id="cms-target">Nội dung cũ</div></main></body></html>' });
  const section = await create('sections', { name: `${tag} section`, pagePath: `/${tag}-page.html`, selector: '#cms-target', mode: 'inner', html: '<strong>Nội dung section persistent</strong>', enabled: true, sortOrder: 0 });
  result = await request(`/${tag}-page.html`);
  check(result.response.ok && result.data.includes('Nội dung section persistent') && result.data.includes(`${tag} page SEO`), 'page + section + SEO render từ database');
  result = await request('/api/admin/sections/reorder', { method: 'POST', body: { ids: [section._id] } });
  check(result.response.ok && result.data.updated === 1, 'API sắp xếp section lưu thành công');

  const banner = await create('banners', { title: `${tag} banner`, image: 'https://example.com/cms-banner-url.jpg', url: `/${tag}-page.html`, alt: 'CMS E2E banner', enabled: true, sortOrder: 99999 });
  result = await request('/index.html');
  check(result.response.ok && result.data.includes('https://example.com/cms-banner-url.jpg'), 'banner URL đồng bộ trang chủ');

  const externalMedia = await create('media', { name: `${tag} external`, url: 'https://example.com/cms-library-url.jpg', alt: 'External CMS image', enabled: true });
  check(externalMedia.sourceType === 'external', 'thư viện ảnh nhận URL');
  await request(`/api/admin/products/${product._id}`, { method: 'PUT', body: { image: externalMedia.url } });
  const replacedMediaUrl = 'https://example.com/cms-library-url-updated.jpg';
  result = await request(`/api/admin/media/${externalMedia._id}`, { method: 'PUT', body: { url: replacedMediaUrl } });
  check(result.response.ok, 'UPDATE ảnh trong thư viện');
  result = await request(`/${tag}-product.html`);
  check(result.data.includes(replacedMediaUrl), 'đổi URL thư viện đồng bộ nơi đang sử dụng');

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), `${tag}.png`);
  form.append('name', `${tag} upload`);
  form.append('alt', 'Upload E2E');
  result = await request('/api/admin/media/upload', { method: 'POST', form });
  check(result.response.status === 201 && /^https:\/\//.test(result.data.item.url), 'upload file thật lên Cloudinary');
  const uploadedMedia = result.data.item;
  created.media.push(uploadedMedia._id);
  await request(`/api/admin/products/${product._id}`, { method: 'PUT', body: { image: uploadedMedia.url } });
  result = await request(`/${tag}-product.html`);
  check(result.data.includes(uploadedMedia.url), 'ảnh upload đồng bộ vào sản phẩm public');

  result = await request('/api/admin/settings');
  originalSettings = result.data.item;
  const testPhone = '+84 000 CMS E2E';
  result = await request('/api/admin/settings', { method: 'PUT', body: { ...originalSettings, phone: testPhone } });
  check(result.response.ok, 'UPDATE thông tin liên hệ');
  result = await request('/index.html');
  check(result.data.includes(testPhone), 'liên hệ Admin đồng bộ toàn site public');
  await request('/api/admin/settings', { method: 'PUT', body: originalSettings });
  originalSettings = null;

  await remove('products', secondOptionalProduct._id);
  await remove('products', optionalProduct._id);
  await remove('products', product._id);
  result = await request(`/${tag}-product.html`);
  check(result.response.status === 404, 'DELETE sản phẩm xoá trang public tương ứng');
  await remove('services', optionalService._id);
  await remove('services', service._id);
  await remove('banners', banner._id);
  await remove('media', uploadedMedia._id);
  check(true, 'DELETE media upload gọi xoá Cloudinary');
  await remove('media', externalMedia._id);
  await remove('sections', section._id);
  await remove('pages', page._id);
  await remove('categories', optionalCategory._id);
  await remove('categories', category._id);
  result = await request('/api/admin/logout', { method: 'POST' });
  check(result.response.ok, 'đăng xuất huỷ session');
  cookie = '';
  result = await request('/api/admin/dashboard', { authenticated: false });
  check(result.response.status === 401, 'session sau logout không còn truy cập được');

  console.log(`\nCMS E2E PASS — ${checks.length} checks`);
} finally {
  if (originalSettings && cookie) await request('/api/admin/settings', { method: 'PUT', body: originalSettings }).catch(() => {});
  for (const resource of ['products','services','banners','media','sections','pages','categories']) {
    for (const id of [...created[resource]]) await remove(resource,id).catch(() => {});
  }
  if (server) {
    await new Promise(resolve => server.close(resolve));
    await closeDatabase();
  }
}

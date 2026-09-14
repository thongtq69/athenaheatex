/* Server-side public page renderer used by Vercel rewrites. */
import { renderCmsPage } from '../lib/cms-render.mjs';

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-store');
  const raw = Array.isArray(req.query?.path) ? req.query.path.join('/') : String(req.query?.path || '/index.html');
  const pathname = raw.startsWith('/') ? raw : '/' + raw;
  try {
    const html = await renderCmsPage(pathname);
    if (html === null) return res.status(404).send('<!doctype html><html lang="vi"><meta charset="utf-8"><title>Không tìm thấy trang</title><h1>Không tìm thấy trang</h1><a href="/index.html">Trang chủ</a></html>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (error) {
    console.error('CMS render failed:', error?.name, error?.message);
    return res.status(500).send('<!doctype html><html lang="vi"><meta charset="utf-8"><title>Lỗi hệ thống</title><h1>Không thể tải nội dung</h1></html>');
  }
}

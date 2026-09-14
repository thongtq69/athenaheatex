/* Vercel entry point for the authenticated CMS API. The local server calls the
   same handler directly, so validation and behavior stay identical. */
import { handleAdminApi } from '../lib/admin-api.mjs';

async function readJson(req, limit = 2_200_000) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
    if (Buffer.byteLength(raw) > limit) throw Object.assign(new Error('Nội dung gửi lên quá lớn.'), { status: 413 });
    try { return JSON.parse(raw || '{}'); } catch { return Object.fromEntries(new URLSearchParams(raw)); }
  }
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Nội dung gửi lên quá lớn.'), { status: 413 });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw || '{}'); } catch { return Object.fromEntries(new URLSearchParams(raw)); }
}

export default async function handler(req, res) {
  const incoming = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const suffix = incoming.searchParams.get('path') || '';
  const url = new URL(`/api/admin/${suffix}`, incoming.origin);
  for (const [key, value] of incoming.searchParams) if (key !== 'path') url.searchParams.append(key, value);
  return handleAdminApi(req, res, url, readJson);
}

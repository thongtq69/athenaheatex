/* Vercel Function: POST /api/inquiries stores a contact-form submission. */
import { clientAddress, isAllowedOrigin, MESSAGES, submitInquiry } from '../lib/inquiries.mjs';

function readBody(req) {
  // Vercel parses JSON and form bodies; its getter throws on malformed JSON.
  let body;
  try {
    body = req.body;
  } catch {
    return null;
  }
  if (typeof body !== 'string') return body ?? {};
  try {
    return JSON.parse(body);
  } catch {
    return Object.fromEntries(new URLSearchParams(body));
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Phương thức không được hỗ trợ.' });
  }
  if (!isAllowedOrigin(req.headers.origin, req.headers.host)) {
    return res.status(403).json({ error: MESSAGES.forbidden });
  }
  const input = readBody(req);
  if (input === null) return res.status(400).json({ error: MESSAGES.invalid });
  const { status, body } = await submitInquiry(input, {
    address: clientAddress(req.headers, req.socket?.remoteAddress),
    userAgent: req.headers['user-agent'],
  });
  return res.status(status).json(body);
}

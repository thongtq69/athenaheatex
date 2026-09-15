/* Vercel Function: POST stores an inquiry; PATCH records the browser mail outcome. */
import { clientAddress, isAllowedOrigin, MESSAGES, reportInquiryNotification, submitInquiry } from '../lib/inquiries.mjs';

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
  if (!['POST', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'POST, PATCH');
    return res.status(405).json({ error: 'Phương thức không được hỗ trợ.' });
  }
  if (!isAllowedOrigin(req.headers.origin, req.headers.host)) {
    return res.status(403).json({ error: MESSAGES.forbidden });
  }
  const input = readBody(req);
  if (input === null) return res.status(400).json({ error: MESSAGES.invalid });
  if (req.method === 'PATCH') {
    const { status, body } = await reportInquiryNotification(input);
    return res.status(status).json(body);
  }
  const { status, body } = await submitInquiry(input, {
    address: clientAddress(req.headers, req.socket?.remoteAddress),
    userAgent: req.headers['user-agent'],
  });
  return res.status(status).json(body);
}

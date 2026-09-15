/* Inquiry validation and storage shared by server.mjs and api/inquiries.mjs.
   With MONGODB_URI set, inquiries go to MongoDB; otherwise the local server
   appends them to data/inquiries.jsonl so the site still works offline. */
import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getDb, isDatabaseConfigured } from './mongodb.mjs';

export const COLLECTION = 'inquiries';
// The upstream form allowed one message a minute. A little headroom stops a
// visitor who double-clicks from being blocked while still capping scripted spam.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 3;
const LIMITS = { name: 200, email: 320, message: 20000, phone: 100, company: 300, country: 120, page: 500 };

export const MESSAGES = {
  invalid: 'Vui lòng nhập họ tên, địa chỉ email hợp lệ và nội dung tin nhắn.',
  tooLong: 'Một hoặc nhiều trường nhập vào quá dài.',
  forbidden: 'Yêu cầu không hợp lệ.',
  throttled: 'Quý khách vừa gửi yêu cầu. Vui lòng đợi một phút rồi thử lại.',
  unavailable: 'Hiện chưa lưu được yêu cầu. Quý khách vui lòng liên hệ trực tiếp: Điện thoại +86-21-50911019, WhatsApp +86-18616619098, Email info@shjoylong.com.',
  saved: 'Cảm ơn quý khách! Yêu cầu đã được gửi thành công, chúng tôi sẽ phản hồi trong thời gian sớm nhất.',
  savedLocally: 'Yêu cầu của quý khách đã được lưu lại. Hệ thống chưa gửi email.',
  savedWithoutNotification: 'Yêu cầu đã được tiếp nhận. Hệ thống sẽ thông báo cho bộ phận liên hệ ngay sau khi hoàn tất cấu hình email.',
};

const DEFAULT_NOTIFICATION_EMAIL = 'sales@athenatech.com.vn';

function emailText(record, id) {
  return [
    `Có yêu cầu liên hệ mới trên Athena Heat Ex (mã ${id}).`,
    '',
    `Họ tên: ${record.name}`,
    `Email: ${record.email}`,
    `Công ty: ${record.company || '—'}`,
    `Quốc gia: ${record.country || '—'}`,
    `Điện thoại: ${record.phone || '—'}`,
    `Trang gửi: ${record.page || '—'}`,
    '',
    'Nội dung:',
    record.message,
  ].join('\n');
}

/**
 * Deliver a notification without adding a heavyweight mail dependency to the
 * Vercel function. Resend is used when configured; a generic webhook is also
 * supported for SMTP/automation providers. The inquiry remains persisted even
 * if a provider is temporarily unavailable, so no customer request is lost.
 */
async function notifyByEmail(record, id) {
  const to = String(process.env.INQUIRY_TO_EMAIL || process.env.CONTACT_NOTIFICATION_EMAIL || DEFAULT_NOTIFICATION_EMAIL).trim();
  const subject = `Yêu cầu liên hệ mới từ ${record.name}`;
  const text = emailText(record, id);
  const webhook = String(process.env.INQUIRY_EMAIL_WEBHOOK_URL || '').trim();
  try {
    if (webhook) {
      const response = await fetch(webhook, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to, subject, text, inquiry: { ...record, id } }),
      });
      if (!response.ok) throw new Error(`Email webhook HTTP ${response.status}`);
      return { status: 'sent', provider: 'webhook' };
    }
    const apiKey = String(process.env.RESEND_API_KEY || '').trim();
    if (!apiKey) return { status: 'not_configured', provider: null, to };
    const from = String(process.env.RESEND_FROM_EMAIL || '').trim();
    if (!from) return { status: 'not_configured', provider: 'resend', to, reason: 'RESEND_FROM_EMAIL is missing' };
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from, to: [to], reply_to: record.email, subject,
        text,
        html: `<h2>Yêu cầu liên hệ mới</h2><p><b>Họ tên:</b> ${escapeHtml(record.name)}</p><p><b>Email:</b> ${escapeHtml(record.email)}</p><p><b>Công ty:</b> ${escapeHtml(record.company || '—')}</p><p><b>Điện thoại:</b> ${escapeHtml(record.phone || '—')}</p><p><b>Nội dung:</b></p><p>${escapeHtml(record.message).replaceAll('\n', '<br>')}</p>`,
      }),
    });
    if (!response.ok) throw new Error(`Resend HTTP ${response.status}`);
    return { status: 'sent', provider: 'resend' };
  } catch (error) {
    console.error('Inquiry email notification failed:', error?.message || error);
    return { status: 'failed', provider: webhook ? 'webhook' : 'resend', to, reason: error?.message || 'unknown' };
  }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export function normalizeInquiry(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const pick = (...keys) => {
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
    return '';
  };
  const record = {
    name: pick('Name', 'name'),
    email: pick('Email', 'email'),
    message: pick('Message', 'message'),
    // The mirrored forms name the phone field "Tel".
    phone: pick('Tel', 'Phone', 'Telephone', 'phone'),
    company: pick('Company', 'company'),
    country: pick('Country', 'country'),
    page: pick('page', 'pagetitle'),
  };
  if (!record.name || !record.message || !/^\S+@\S+\.\S+$/.test(record.email)) return { error: MESSAGES.invalid };
  if (Object.entries(LIMITS).some(([key, max]) => record[key].length > max)) return { error: MESSAGES.tooLong };
  return { record };
}

export function isAllowedOrigin(origin, host) {
  if (!origin) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function clientAddress(headers = {}, socketAddress = '') {
  const forwarded = String(headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(headers['x-real-ip'] || '').trim() || socketAddress || '';
}

// Only a salted hash is kept, enough to rate-limit without storing addresses.
function hashAddress(address) {
  if (!address) return null;
  return createHash('sha256').update((process.env.INQUIRY_IP_SALT || 'athenaheatex') + ':' + address).digest('hex');
}

let indexes = null;
async function ensureIndexes(collection) {
  indexes ??= collection
    .createIndexes([
      { key: { createdAt: -1 }, name: 'createdAt_desc' },
      { key: { status: 1, createdAt: -1 }, name: 'status_createdAt' },
      { key: { ipHash: 1, createdAt: -1 }, name: 'ipHash_createdAt' },
    ])
    .catch(error => {
      indexes = null;
      // Missing index privileges must not stop an inquiry from being saved.
      console.warn('Inquiry indexes unavailable:', error?.message);
    });
  return indexes;
}

export async function submitInquiry(input, { address = '', userAgent = '', dataDir, useDatabase = isDatabaseConfigured(), now = new Date() } = {}) {
  const { record, error } = normalizeInquiry(input);
  if (error) return { status: 400, body: { error } };
  const entry = { ...record, status: 'new', source: 'website', createdAt: now, userAgent: String(userAgent || '').slice(0, 300) };

  if (!useDatabase) {
    const id = randomUUID();
    await mkdir(dataDir, { recursive: true });
    await appendFile(path.join(dataDir, 'inquiries.jsonl'), JSON.stringify({ id, ...entry, createdAt: now.toISOString() }) + '\n', 'utf8');
    return { status: 201, body: { ok: true, id, delivery: 'local', message: MESSAGES.savedLocally } };
  }

  try {
    const collection = (await getDb()).collection(COLLECTION);
    await ensureIndexes(collection);
    const ipHash = hashAddress(address);
    if (ipHash) {
      const recent = await collection.countDocuments({ ipHash, createdAt: { $gte: new Date(now.getTime() - WINDOW_MS) } });
      if (recent >= MAX_PER_WINDOW) return { status: 429, body: { error: MESSAGES.throttled } };
    }
    const { insertedId } = await collection.insertOne({ ...entry, ipHash });
    const id = String(insertedId);
    const notification = await notifyByEmail(record, id);
    const message = notification.status === 'sent' ? MESSAGES.saved : MESSAGES.savedWithoutNotification;
    return { status: 201, body: { ok: true, id, delivery: 'database', notification: notification.status, message } };
  } catch (failure) {
    console.error('Inquiry storage failed:', failure?.name || 'Error', failure?.message);
    return { status: 503, body: { error: MESSAGES.unavailable } };
  }
}

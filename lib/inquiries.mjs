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
};

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
    return { status: 201, body: { ok: true, id: String(insertedId), delivery: 'database', message: MESSAGES.saved } };
  } catch (failure) {
    console.error('Inquiry storage failed:', failure?.name || 'Error', failure?.message);
    return { status: 503, body: { error: MESSAGES.unavailable } };
  }
}

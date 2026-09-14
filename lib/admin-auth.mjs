import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { CMS } from './cms.mjs';
import { getDb } from './mongodb.mjs';

const COOKIE = 'athena_admin';
const loginAttempts = new Map();

const hash = value => createHash('sha256').update(String(value)).digest('hex');
const equal = (left, right) => {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
};

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(item => item.trim().split(/=(.*)/s).slice(0, 2)).filter(([key]) => key));
}

function cookieOptions(req, maxAge = 0) {
  const secure = req.headers['x-forwarded-proto'] === 'https';
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export async function currentAdmin(req) {
  const token = cookies(req)[COOKIE];
  if (!token) return null;
  const session = await (await getDb()).collection(CMS.sessions).findOne({ tokenHash: hash(token), expiresAt: { $gt: new Date() } });
  return session ? { username: session.username, expiresAt: session.expiresAt } : null;
}

export function loginAllowed(address) {
  const key = String(address || 'unknown');
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter(time => now - time < 15 * 60_000);
  loginAttempts.set(key, recent);
  return recent.length < 10;
}

export function noteFailedLogin(address) {
  const key = String(address || 'unknown');
  loginAttempts.set(key, [...(loginAttempts.get(key) || []), Date.now()]);
}

export async function createAdminSession(req, res, username, password) {
  const expectedUser = process.env.ADMIN_USERNAME || 'admin';
  const expectedPassword = process.env.ADMIN_PASSWORD || '';
  if (!expectedPassword || !equal(username, expectedUser) || !equal(password, expectedPassword)) return null;
  const token = randomBytes(32).toString('base64url');
  const hours = Math.min(Math.max(Number(process.env.ADMIN_SESSION_HOURS || 12), 1), 168);
  const expiresAt = new Date(Date.now() + hours * 3_600_000);
  await (await getDb()).collection(CMS.sessions).insertOne({ tokenHash: hash(token), username: expectedUser, createdAt: new Date(), expiresAt });
  const secure = req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${hours * 3600}${secure ? '; Secure' : ''}`);
  return { username: expectedUser, expiresAt };
}

export async function destroyAdminSession(req, res) {
  const token = cookies(req)[COOKIE];
  if (token) await (await getDb()).collection(CMS.sessions).deleteOne({ tokenHash: hash(token) });
  res.setHeader('Set-Cookie', cookieOptions(req, 0));
}

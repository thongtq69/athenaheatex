import { lookup as lookupDns } from 'node:dns/promises';

export const DOMAIN_CONFIG = Object.freeze({
  project: 'ATHENA HEATEX',
  primaryHost: 'www.athenaheatex.com',
  apexHost: 'athenaheatex.com',
  platformHost: 'athenaheatex.vercel.app',
  primaryUrl: 'https://www.athenaheatex.com/',
  apexUrl: 'https://athenaheatex.com/',
  platformUrl: 'https://athenaheatex.vercel.app/',
  environment: 'Website public · Production',
  platform: 'Vercel',
});

function timedSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function probe(fetchImpl, url, { redirect = 'follow', timeoutMs = 6000 } = {}) {
  const timeout = timedSignal(timeoutMs);
  try {
    const response = await fetchImpl(url, { method: 'HEAD', redirect, signal: timeout.signal });
    return {
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      location: response.headers?.get?.('location') || '',
    };
  } catch (error) {
    return { ok: false, status: 0, location: '', error: error?.name === 'AbortError' ? 'Quá thời gian phản hồi' : 'Không thể kết nối' };
  } finally {
    timeout.clear();
  }
}

export async function checkDomainStatus({ fetchImpl = globalThis.fetch, lookup = lookupDns, timeoutMs = 6000 } = {}) {
  const dnsPromise = Promise.resolve()
    .then(() => lookup(DOMAIN_CONFIG.primaryHost, { all: true }))
    .then(addresses => ({ ok: Array.isArray(addresses) && addresses.length > 0, addresses: (addresses || []).map(item => item.address).filter(Boolean) }))
    .catch(() => ({ ok: false, addresses: [] }));
  const [dns, primary, apex, platform] = await Promise.all([
    dnsPromise,
    probe(fetchImpl, DOMAIN_CONFIG.primaryUrl, { timeoutMs }),
    probe(fetchImpl, DOMAIN_CONFIG.apexUrl, { redirect: 'manual', timeoutMs }),
    probe(fetchImpl, DOMAIN_CONFIG.platformUrl, { redirect: 'manual', timeoutMs }),
  ]);
  const redirectTarget = value => {
    try { return new URL(value.location, value.base).hostname; } catch { return ''; }
  };
  const apexRedirect = { ...apex, base: DOMAIN_CONFIG.apexUrl };
  const platformRedirect = { ...platform, base: DOMAIN_CONFIG.platformUrl };
  const apexConnected = apex.ok && redirectTarget(apexRedirect) === DOMAIN_CONFIG.primaryHost;
  const platformConnected = platform.ok && (platform.status < 300 || redirectTarget(platformRedirect) === DOMAIN_CONFIG.primaryHost);
  const httpsOk = primary.ok && new URL(DOMAIN_CONFIG.primaryUrl).protocol === 'https:';

  return {
    site: DOMAIN_CONFIG,
    active: dns.ok && httpsOk,
    checkedAt: new Date().toISOString(),
    checks: {
      dns: { ok: dns.ok, detail: dns.ok ? 'Tên miền đã phân giải' : 'Chưa phân giải được tên miền' },
      https: { ok: httpsOk, status: primary.status, detail: httpsOk ? `HTTPS phản hồi mã ${primary.status}` : (primary.error || 'HTTPS chưa phản hồi') },
      website: { ok: primary.ok, status: primary.status, detail: primary.ok ? 'Website ATHENA HEATEX phản hồi' : (primary.error || 'Website chưa phản hồi') },
    },
    connections: {
      primary: { ok: primary.ok, status: primary.status },
      apex: { ok: apexConnected, status: apex.status, location: apex.location },
      platform: { ok: platformConnected, status: platform.status, location: platform.location },
    },
  };
}

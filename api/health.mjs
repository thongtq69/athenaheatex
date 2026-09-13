/* Vercel Function: GET /api/health reports whether the backing services respond. */
import { healthReport } from '../lib/health.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const report = await healthReport();
  return res.status(report.ok ? 200 : 503).json(report);
}

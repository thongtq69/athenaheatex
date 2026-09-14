// MongoDB retains its imported page keys; visitors see stable Vietnamese URLs.
import { PUBLIC_PATHS } from './public-path-map.mjs';

export const MACHINERY_SOURCE_PATH = '/machinery-2.html';
export const MACHINERY_PUBLIC_PATH = '/may-moc';
const SOURCES = new Map(Object.entries(PUBLIC_PATHS).map(([source, visitor]) => [visitor, source]));

export function publicPathForSourcePath(pathname) {
  return pathname === '/index.html' ? '/' : PUBLIC_PATHS[pathname] || pathname;
}

export function sourcePathForPublicPath(pathname) {
  return SOURCES.get(pathname) || pathname;
}

export function rewritePublicLinks(html) {
  return String(html).replace(/\b(href|action)\s*=\s*(["'])(\/[^"']*)\2/gi, (match, attr, quote, url) => {
    const end = url.search(/[?#]/);
    const path = end < 0 ? url : url.slice(0, end);
    const visitor = publicPathForSourcePath(path);
    return visitor === path ? match : `${attr}=${quote}${visitor}${end < 0 ? '' : url.slice(end)}${quote}`;
  });
}

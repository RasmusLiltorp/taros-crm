/** Normalize a URL for deduplication: lowercase, strip protocol, strip www., strip trailing slash */
export function normalizeUrl(url: string): string {
  if (!url) return "";
  let u = url.trim().toLowerCase();
  // Strip protocol
  u = u.replace(/^https?:\/\//, "");
  // Strip www.
  u = u.replace(/^www\./, "");
  // Strip trailing slash
  u = u.replace(/\/$/, "");
  return u;
}

/** Check if two URLs are likely the same contact */
export function isSameUrl(a: string, b: string): boolean {
  return normalizeUrl(a) === normalizeUrl(b);
}

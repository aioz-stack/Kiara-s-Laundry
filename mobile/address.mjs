/** The port the desktop app uses when Phone access is on. */
export const PHONE_ACCESS_PORT = 47800;

function isPrivateIp(host) {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}

/**
 * Turns what someone typed into a server address, or null if it cannot be one.
 * A shop computer on the Wi-Fi uses plain http, and anything else must use https.
 */
export function normalizeAddress(typed) {
  const text = typed.trim();
  if (!text) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  let url;
  try {
    url = new URL(hasScheme ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname || url.username || url.password) return null;

  if (!hasScheme && isPrivateIp(url.hostname)) {
    return `http://${url.hostname}:${url.port || PHONE_ACCESS_PORT}`;
  }
  if (url.protocol === "http:" && !isPrivateIp(url.hostname)) return null;
  return url.origin;
}

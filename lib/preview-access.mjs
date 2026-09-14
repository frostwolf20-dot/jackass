/**
 * Shared prelaunch gate. It is separate from future Supabase user authentication.
 * Uses Web Crypto so it does not depend on filesystem/native Node modules.
 */
async function equalSecret(left, right) {
  const bytes = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", bytes.encode(left)),
    crypto.subtle.digest("SHA-256", bytes.encode(right))
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < aa.length; i++) difference |= aa[i] ^ bb[i];
  return difference === 0;
}

/**
 * @param {string | null} authorization
 * @param {{username?: string, password?: string}} credentials
 * @returns {Promise<"allowed" | "denied" | "unconfigured">}
 */
export async function checkPreviewAccess(authorization, credentials) {
  if (!credentials.username || !credentials.password || credentials.password.length < 24) {
    return "unconfigured";
  }
  if (!authorization || authorization.length > 4096) return "denied";
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
  if (!match) return "denied";
  let value;
  try { value = atob(match[1]); } catch { return "denied"; }
  const separator = value.indexOf(":");
  if (separator < 0) return "denied";
  const [userMatches, passwordMatches] = await Promise.all([
    equalSecret(value.slice(0, separator), credentials.username),
    equalSecret(value.slice(separator + 1), credentials.password)
  ]);
  return userMatches && passwordMatches ? "allowed" : "denied";
}

export function blockedPreviewResponse(result) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Content-Type": "text/plain; charset=utf-8"
  };
  if (result === "unconfigured") {
    return new Response("Private preview is not configured.", { status: 503, headers });
  }
  return new Response("Private preview. Sign in with your preview credentials.", {
    status: 401,
    headers: { ...headers, "WWW-Authenticate": 'Basic realm="Private preview", charset="UTF-8"' }
  });
}

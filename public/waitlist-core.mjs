const MAX_BODY_BYTES = 4096;
const WINDOW_MS = 10 * 60 * 1000;

function json(status, payload, headers = {}) {
  return Response.json(payload, { status, headers: {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers
  } });
}

async function readBody(request) {
  if (!request.body) throw Object.assign(new Error("Invalid JSON"), { status: 400 });
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      void reader.cancel().catch(() => {});
      throw Object.assign(new Error("Payload too large"), { status: 413 });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw Object.assign(new Error("Invalid JSON"), { status: 400 }); }
}

function credentials(env) {
  const key = (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  try {
    const url = new URL(env.SUPABASE_URL);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || /YOUR_PROJECT/i.test(url.hostname)) return null;
    if ((!key.startsWith("sb_secret_") && !key.startsWith("eyJ")) || /YOUR_|PLACEHOLDER/i.test(key)) return null;
    return { url, key };
  } catch { return null; }
}

// Shared by Node and Cloudflare. Each adapter supplies trusted request context.
export function createWaitlistEndpoint({ fetchImpl = fetch, now = Date.now } = {}) {
  const attempts = new Map();
  function rateLimited(clientIP) {
    const time = now();
    for (const [key, value] of attempts) if (value.until <= time) attempts.delete(key);
    if (!attempts.has(clientIP)) {
      if (attempts.size >= 5000) return true;
      attempts.set(clientIP, { count: 0, until: time + WINDOW_MS });
    }
    return ++attempts.get(clientIP).count > 30;
  }

  return async (request, { env = {}, clientIP = "unknown", allowedOrigins = [] } = {}) => {
    if (request.method !== "POST") return json(405, { ok: false }, { Allow: "POST" });
    const origin = request.headers.get("origin");
    const origins = env.SITE_URL ? [env.SITE_URL.replace(/\/$/, "")] : allowedOrigins;
    if (origin && !origins.includes(origin)) return json(403, { ok: false });
    if (request.headers.get("sec-fetch-site") === "cross-site") return json(403, { ok: false });
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) return json(415, { ok: false });
    if (rateLimited(clientIP)) return json(429, { ok: false }, { "Retry-After": "600" });
    try {
      const data = await readBody(request);
      if (!data || typeof data !== "object" || Array.isArray(data) || data.company) return json(400, { ok: false });
      const name = typeof data.name === "string" ? data.name.normalize("NFC").trim().replace(/\s+/gu, " ") : "";
      const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
      if (name.length < 2 || name.length > 100 || /[\u0000-\u001f\u007f<>]/u.test(name) || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(email)) {
        return json(400, { ok: false });
      }
      const connection = credentials(env);
      if (!connection) return json(503, { ok: false, code: "WAITLIST_NOT_CONFIGURED" });
      const headers = {
        apikey: connection.key,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal"
      };
      // Secret keys are not JWTs. Only legacy service_role uses Bearer.
      if (connection.key.startsWith("eyJ")) headers.Authorization = `Bearer ${connection.key}`;
      const upstream = await fetchImpl(new URL("/rest/v1/waitlist_signups?on_conflict=email", connection.url), {
        method: "POST", headers,
        body: JSON.stringify({ name, email, source: "lyrion-website" }),
        signal: AbortSignal.timeout(10000),
        redirect: "error"
      });
      // Never forward database errors, stored names/emails, or credentials.
      await upstream.body?.cancel();
      if (!upstream.ok) return json(502, { ok: false });
      // Same response for an insert and a duplicate; do not expose membership.
      return json(200, { ok: true });
    } catch (error) {
      return json(error.status === 413 ? 413 : error.status === 400 ? 400 : 502, { ok: false });
    }
  };
}

const MAX_BODY_BYTES = 4096;
const WINDOW_MS = 10 * 60 * 1000;

export function json(response, status, payload, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers
  }).end(JSON.stringify(payload));
}

async function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let oversized = false;
    const chunks = [];
    request.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        if (!oversized) { oversized = true; chunks.length = 0; reject(Object.assign(new Error("Payload too large"), { status: 413 })); }
      } else if (!oversized) chunks.push(chunk);
    });
    request.on("end", () => {
      if (oversized) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(Object.assign(new Error("Invalid JSON"), { status: 400 })); }
    });
    request.on("error", reject);
  });
}

export function createWaitlistHandler({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const attempts = new Map();
  // Do not trust browser-provided X-Forwarded-For values. Apply edge rate limits
  // on the hosting platform too when multiple instances share a reverse proxy.
  function rateLimited(request) {
    const time = now();
    for (const [key, value] of attempts) if (value.until <= time) attempts.delete(key);
    const ip = request.socket.remoteAddress || "unknown";
    if (!attempts.has(ip)) {
      if (attempts.size >= 5000) return true;
      attempts.set(ip, { count: 0, until: time + WINDOW_MS });
    }
    return ++attempts.get(ip).count > 30;
  }

  function credentials() {
    const key = (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    try {
      const url = new URL(env.SUPABASE_URL);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || /YOUR_PROJECT/i.test(url.hostname)) return null;
      if ((!key.startsWith("sb_secret_") && !key.startsWith("eyJ")) || /YOUR_|PLACEHOLDER/i.test(key)) return null;
      return { url, key };
    } catch { return null; }
  }

  return async (request, response) => {
    if (request.method !== "POST") return json(response, 405, { ok: false }, { Allow: "POST" });
    const origin = request.headers.origin;
    const port = request.socket.localPort;
    const allowedOrigins = env.SITE_URL ? [env.SITE_URL.replace(/\/$/, "")] : [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
    if (origin && !allowedOrigins.includes(origin)) return json(response, 403, { ok: false });
    if (request.headers["sec-fetch-site"] === "cross-site") return json(response, 403, { ok: false });
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) return json(response, 415, { ok: false });
    if (rateLimited(request)) return json(response, 429, { ok: false }, { "Retry-After": "600" });
    try {
      const data = await readBody(request);
      if (!data || typeof data !== "object" || Array.isArray(data)) return json(response, 400, { ok: false });
      // A filled honeypot is rejected without forwarding anything to the database.
      if (data.company) return json(response, 400, { ok: false });
      const name = typeof data.name === "string" ? data.name.normalize("NFC").trim().replace(/\s+/gu, " ") : "";
      const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
      if (name.length < 2 || name.length > 100 || /[\u0000-\u001f\u007f<>]/u.test(name) || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(email)) {
        return json(response, 400, { ok: false });
      }
      const connection = credentials();
      if (!connection) return json(response, 503, { ok: false, code: "WAITLIST_NOT_CONFIGURED" });
      const headers = {
        apikey: connection.key,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal"
      };
      // New secret keys are not JWTs. Only legacy service_role uses Bearer.
      if (connection.key.startsWith("eyJ")) headers.Authorization = `Bearer ${connection.key}`;
      const upstream = await fetchImpl(new URL("/rest/v1/waitlist_signups?on_conflict=email", connection.url), {
        method: "POST", headers,
        body: JSON.stringify({ name, email, source: "lyrion-website" }),
        signal: AbortSignal.timeout(10000),
        redirect: "error"
      });
      // Never forward database errors, stored names/emails, or credentials.
      await upstream.body?.cancel();
      if (!upstream.ok) return json(response, 502, { ok: false });
      // Same response for an insert and a duplicate; do not expose membership.
      return json(response, 200, { ok: true });
    } catch (error) {
      return json(response, error.status === 413 ? 413 : error.status === 400 ? 400 : 502, { ok: false });
    }
  };
}

import { createWaitlistEndpoint } from "./waitlist-core.mjs";

export function createWorker(options) {
  const waitlist = createWaitlistEndpoint(options);
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname === "/api/waitlist") {
        return waitlist(request, {
          env,
          // Cloudflare overwrites this header with the connecting visitor IP.
          clientIP: request.headers.get("CF-Connecting-IP") || "unknown",
          allowedOrigins: [url.origin]
        });
      }
      if (url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
      return env.ASSETS.fetch(request);
    }
  };
}

export default createWorker();

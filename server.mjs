import http from "node:http";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWaitlistHandler } from "./waitlist-api.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".woff2": "font/woff2", ".ttf": "font/ttf", ".svg": "image/svg+xml" };
const publicFiles = new Set(["index.html", "styles.css", "intro.css", "intro.js", "script.js", "motion.js", "reviews.js", "waitlist.js", "previews.js", "config.js"]);
const assetTypes = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".woff2", ".ttf", ".svg"]);

export function createSiteServer(options = {}) {
  const waitlist = createWaitlistHandler(options);
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      if (pathname === "/api/waitlist") return await waitlist(request, response);
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" }).end(); return;
      }
      const relative = pathname === "/" ? "index.html" : pathname.slice(1);
      const filename = path.resolve(root, relative);
      const isPublicAsset = relative.startsWith("assets/") && assetTypes.has(path.extname(relative).toLowerCase()) && !relative.split(/[\\/]/).some(part => part.startsWith("."));
      if (!filename.startsWith(root + path.sep) || (!publicFiles.has(relative) && !isPublicAsset)) {
        response.writeHead(404).end("Not found"); return;
      }
      const resolved = await realpath(filename);
      if (!resolved.startsWith(root + path.sep)) { response.writeHead(404).end("Not found"); return; }
      const content = await readFile(resolved);
      response.writeHead(200, { "Content-Type": mime[path.extname(filename).toLowerCase()] || "application/octet-stream", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "Cache-Control": "no-cache" });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch {
      if (!response.headersSent) response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      else response.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile(path.join(root, ".env")); }
  catch (error) { if (error.code !== "ENOENT") throw new Error("Cannot read the server .env file."); }
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || "127.0.0.1";
  createSiteServer().listen(port, host, () => console.log(`LyrionFitness: http://${host}:${port}`));
}

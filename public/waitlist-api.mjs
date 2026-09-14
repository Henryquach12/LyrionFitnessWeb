import { Readable } from "node:stream";
import { createWaitlistEndpoint } from "./waitlist-core.mjs";

export function createWaitlistHandler({ env = process.env, ...options } = {}) {
  const endpoint = createWaitlistEndpoint(options);
  return async (request, response) => {
    const port = request.socket.localPort;
    const init = { method: request.method, headers: request.headers };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = Readable.toWeb(request);
      init.duplex = "half";
    }
    const result = await endpoint(new Request(`http://127.0.0.1:${port}/api/waitlist`, init), {
      env,
      // Browser-provided forwarding headers are not trusted on Node.
      clientIP: request.socket.remoteAddress || "unknown",
      allowedOrigins: [`http://127.0.0.1:${port}`, `http://localhost:${port}`]
    });
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(await result.text());
  };
}

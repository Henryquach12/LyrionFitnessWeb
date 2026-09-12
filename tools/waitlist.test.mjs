import test from "node:test";
import assert from "node:assert/strict";
import { createSiteServer } from "../server.mjs";

const valid = { name: "  Nguyễn   An  ", email: "  An@Example.com " };
const configured = { SUPABASE_URL: "https://waitlist-test.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_test_only_not_a_real_key" };

async function site(t, options = {}) {
  const server = createSiteServer({ env: {}, ...options });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const submit = (data = valid, headers = {}) => fetch(`${origin}/api/waitlist`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...headers }, body: JSON.stringify(data)
  });
  return { origin, submit };
}

test("Unconfigured waitlist returns 503 and never claims to save", async t => {
  const { submit } = await site(t, { fetchImpl: () => assert.fail("must not call Supabase") });
  const response = await submit();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, code: "WAITLIST_NOT_CONFIGURED" });
});

test("Placeholder and public keys cannot enable backend writes", async t => {
  for (const key of ["YOUR_SUPABASE_SECRET_KEY", "sb_publishable_test"]) {
    const { submit } = await site(t, { env: { ...configured, SUPABASE_SECRET_KEY: key }, fetchImpl: () => assert.fail("must not call Supabase") });
    assert.equal((await submit()).status, 503);
  }
});

test("Valid request normalizes data and uses private PostgREST insert", async t => {
  const calls = [];
  const { submit } = await site(t, { env: configured, fetchImpl: async (url, options) => {
    calls.push({ url: String(url), ...options });
    return new Response(null, { status: 201 });
  } });
  const response = await submit();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://waitlist-test.supabase.co/rest/v1/waitlist_signups?on_conflict=email");
  assert.deepEqual(JSON.parse(calls[0].body), { name: "Nguyễn An", email: "an@example.com", source: "lyrion-website" });
  assert.equal(calls[0].headers.apikey, configured.SUPABASE_SECRET_KEY);
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(calls[0].redirect, "error");
  assert.equal(calls[0].headers.Prefer, "resolution=ignore-duplicates,return=minimal");
});

test("Retries use ignore-duplicates and return the same public result", async t => {
  const { submit } = await site(t, { env: configured, fetchImpl: async () => new Response(null, { status: 201 }) });
  assert.deepEqual(await (await submit()).json(), await (await submit()).json());
});

test("Legacy service_role is passed as a Bearer JWT only on the server", async t => {
  const legacy = "eyJ_test_only_not_a_real_JWT";
  const { submit } = await site(t, { env: { SUPABASE_URL: configured.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: legacy }, fetchImpl: async (_, options) => {
    assert.equal(options.headers.Authorization, `Bearer ${legacy}`);
    return new Response(null, { status: 201 });
  } });
  assert.equal((await submit()).status, 200);
});

test("Invalid names, emails, shapes and honeypot never reach database", async t => {
  const { submit } = await site(t, { env: configured, fetchImpl: () => assert.fail("must not call Supabase") });
  for (const data of [null, [], {}, { name: " ", email: "a@b.co" }, { name: "A".repeat(101), email: "a@b.co" }, { name: "<script>", email: "a@b.co" }, { name: "An", email: "broken" }, { name: "An", email: "a@b.co", company: "bot" }]) {
    assert.equal((await submit(data)).status, 400);
  }
});

test("Cross-origin and unsupported requests are rejected", async t => {
  const { origin, submit } = await site(t);
  assert.equal((await submit(valid, { Origin: "https://other.example" })).status, 403);
  assert.equal((await submit(valid, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await fetch(`${origin}/api/waitlist`)).status, 405);
});

test("Configured production origin is accepted; spoofed origins are not", async t => {
  const { submit } = await site(t, { env: { ...configured, SITE_URL: "https://lyrion.example" }, fetchImpl: async () => new Response(null, { status: 201 }) });
  assert.equal((await submit(valid, { Origin: "https://lyrion.example" })).status, 200);
  assert.equal((await submit(valid, { Origin: "https://lyrion.example.evil.test" })).status, 403);
});

test("Malformed JSON and oversized bodies fail without writes", async t => {
  const { origin, submit } = await site(t);
  const response = await fetch(`${origin}/api/waitlist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  assert.equal(response.status, 400);
  assert.equal((await submit({ name: "a".repeat(5000), email: "a@b.co" })).status, 413);
});

test("Database errors and timeouts do not leak payloads or keys", async t => {
  for (const fetchImpl of [async () => new Response("private database error " + configured.SUPABASE_SECRET_KEY, { status: 500 }), async () => { throw new DOMException("private URL", "TimeoutError"); }]) {
    const { submit } = await site(t, { env: configured, fetchImpl });
    const response = await submit();
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { ok: false });
  }
});

test("Rate limiting is bounded and resets after the window", async t => {
  let time = 0;
  const { submit } = await site(t, { now: () => time });
  for (let i = 0; i < 30; i++) assert.equal((await submit()).status, 503);
  const limited = await submit();
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "600");
  time = 600001;
  assert.equal((await submit()).status, 503);
});

test("Environment, backend, SQL, tools and archives are never served", async t => {
  const { origin } = await site(t, { env: configured });
  for (const pathname of ["/.env", "/.env.example", "/server.mjs", "/waitlist-api.mjs", "/supabase/waitlist.sql", "/tools/waitlist.test.mjs", "/LyrionFitness-website.zip", "/assets/../.env", "/assets/.env", "/assets/%2e%2e%5cserver.mjs"]) {
    assert.equal((await fetch(origin + pathname)).status, 404, pathname);
  }
  for (const pathname of ["/", "/config.js", "/reviews.js", "/waitlist.js", "/assets/Roboto.ttf"]) {
    const response = await fetch(origin + pathname);
    assert.equal(response.status, 200, pathname);
    if (!pathname.endsWith(".ttf")) assert.ok(!(await response.text()).includes(configured.SUPABASE_SECRET_KEY));
  }
});

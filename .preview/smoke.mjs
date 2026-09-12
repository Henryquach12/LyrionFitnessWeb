import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const page = await fetch('http://127.0.0.1:9223/json/new?about:blank', { method: 'PUT' }).then(r => r.json());
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let nextId = 0;
const pending = new Map();
const errors = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const task = pending.get(message.id);
    if (task) { pending.delete(message.id); message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result); }
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function navigate() {
  await send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
  for (let i = 0; i < 30; i++) {
    await pause(100);
    if (await evaluate('document.readyState === "complete" && document.documentElement.classList.contains("js")')) return;
  }
  throw new Error('Page did not become ready');
}
async function viewport(width, height, mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
}
async function screenshot(name, full = false) {
  await pause(700);
  const params = { format: 'png', captureBeyondViewport: full };
  if (full) {
    const metrics = await send('Page.getLayoutMetrics');
    params.clip = { x: 0, y: 0, width: metrics.cssContentSize.width, height: metrics.cssContentSize.height, scale: 1 };
  }
  const result = await send('Page.captureScreenshot', params);
  await writeFile(`.preview/${name}.png`, Buffer.from(result.data, 'base64'));
}
await send('Page.enable');
await send('Runtime.enable');
await viewport(1440, 1000);
await navigate();
assert.equal(await evaluate('document.querySelectorAll("h1").length'), 1);
assert.equal(await evaluate('document.querySelectorAll("[data-screen]").length'), 4);
assert.equal(await evaluate('Array.from(document.querySelectorAll("a[href^=\"#\"]")).every(a => document.getElementById(a.hash.slice(1)))'), true);
assert.equal(await evaluate('Array.from(document.querySelectorAll("[data-store-link]")).every(a => a.getAttribute("href") === "#download")'), true);
assert.equal(await evaluate('Array.from(document.images).filter(i => i.hasAttribute("src")).every(i => i.complete && i.naturalWidth > 0)'), true);
await screenshot('desktop');
await evaluate('(async () => { for (const el of document.querySelectorAll("[data-reveal]")) { el.scrollIntoView({behavior:"instant",block:"center"}); await new Promise(r=>setTimeout(r,70)); } window.scrollTo({top:0,behavior:"instant"}); })()');
await screenshot('desktop-full', true);

const widths = [320, 375, 390, 640, 768, 900, 1024, 1440, 1920];
const widthChecks = [];
for (const width of widths) {
  await viewport(width, 900, width < 640);
  await pause(80);
  const measures = await evaluate('({view:innerWidth, page:document.documentElement.scrollWidth})');
  assert.ok(measures.page <= measures.view, `Horizontal overflow at ${width}: ${JSON.stringify(measures)}`);
  widthChecks.push(width);
}

await viewport(390, 844, true);
await navigate();
assert.equal(await evaluate('getComputedStyle(document.querySelector("#nav-links")).display'), 'none');
await evaluate('document.querySelector(".menu-toggle").click()');
assert.equal(await evaluate('document.querySelector(".menu-toggle").getAttribute("aria-expanded")'), 'true');
assert.notEqual(await evaluate('getComputedStyle(document.querySelector("#nav-links")).display'), 'none');
await screenshot('mobile-menu');
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
assert.equal(await evaluate('document.querySelector(".menu-toggle").getAttribute("aria-expanded")'), 'false');
assert.equal(await evaluate('document.activeElement.classList.contains("menu-toggle")'), true);
await screenshot('mobile');
await evaluate('document.querySelector(".menu-toggle").click(); document.querySelector("#nav-links a").click()');
assert.equal(await evaluate('document.querySelector(".menu-toggle").getAttribute("aria-expanded")'), 'false');
await pause(700);
await screenshot('mobile-gallery');
await evaluate('document.querySelectorAll("#engine details")[1].querySelector("summary").click()');
assert.equal(await evaluate('document.querySelectorAll("#engine details")[1].open'), true);

await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await navigate();
assert.equal(await evaluate('getComputedStyle(document.documentElement).scrollBehavior'), 'auto');
assert.equal(await evaluate('document.querySelectorAll(".reveal-ready:not(.is-visible)").length'), 0);

let configScript = await send('Page.addScriptToEvaluateOnNewDocument', { source: 'Object.defineProperty(window,"LYRION_CONFIG",{get(){return {appStoreUrl:"https://apps.apple.com/vn/app/lyrion/id1234567890",screenshots:{welcome:"assets/lyrion-hero.png",workout:"assets/missing.png"}}},set(){}});' });
await navigate();
await pause(300);
assert.equal(await evaluate('document.querySelector("[data-store-label]").textContent'), 'Tải trên App Store');
assert.equal(await evaluate('document.querySelector("[data-store-link]").hostname'), 'apps.apple.com');
assert.equal(await evaluate('document.querySelector("[data-screen=welcome] .screen-preview").hidden'), true);
assert.equal(await evaluate('document.querySelector("[data-screen=workout] .screen-preview").hidden'), false);
await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: configScript.identifier });
configScript = await send('Page.addScriptToEvaluateOnNewDocument', { source: 'Object.defineProperty(window,"LYRION_CONFIG",{get(){return {appStoreUrl:"javascript:alert(1)",screenshots:{}}},set(){}});' });
await navigate();
assert.equal(await evaluate('document.querySelector("[data-store-link]").getAttribute("href")'), '#download');
await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: configScript.identifier });
await send('Emulation.setEmulatedMedia', { features: [] });
await viewport(1440, 1000);
await navigate();
assert.deepEqual(errors, []);
console.log(JSON.stringify({ status: 'PASS', widthChecks, checks: ['anchors', 'four screenshot slots', 'assets', 'mobile navigation', 'Escape focus', 'accordion', 'reduced motion', 'App Store URL states', 'screenshot success/error fallback', 'no JS exceptions'] }, null, 2));
socket.close();

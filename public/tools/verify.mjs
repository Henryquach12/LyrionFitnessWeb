import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, "artifacts");
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
await access(chrome);
await mkdir(artifactDir, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}
async function waitJson(url) {
  for (let attempt = 0; attempt < 80; attempt++) {
    try { const response = await fetch(url); if (response.ok) return await response.json(); } catch {}
    await delay(200);
  }
  throw new Error("Timed out: " + url);
}
const sitePort = await freePort();
const debugPort = await freePort();
const siteUrl = "http://127.0.0.1:" + sitePort;
const server = spawn(process.execPath, ["server.mjs"], { cwd: root, env: { ...process.env, PORT: String(sitePort) }, windowsHide: true, stdio: "ignore" });
const browser = spawn(chrome, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--disable-background-networking", "--disable-extensions", "--remote-debugging-port=" + debugPort,
  "--user-data-dir=" + path.join(artifactDir, "chrome-profile"), "about:blank"
], { windowsHide: true, stdio: "ignore" });
const results = [];
const errors = [];
const expectedNetworkErrors = [];
const blockedLogoRequests = new Set();
let blockingIntroLogo = false;
let ws;
let send;
function check(name, condition, detail = null) {
  results.push({ name, passed: Boolean(condition), detail });
  console.log((condition ? "PASS " : "FAIL ") + name + (detail ? " " + JSON.stringify(detail) : ""));
}
try {
  const targets = await waitJson("http://127.0.0.1:" + debugPort + "/json/list");
  const target = targets.find(item => item.type === "page");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timeout } = pending.get(message.id);
      clearTimeout(timeout);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
    if (message.method === "Network.requestWillBeSent" && blockingIntroLogo && message.params.request.url === siteUrl + "/assets/lyrion-mark.png") blockedLogoRequests.add(message.params.requestId);
    if (message.method === "Network.loadingFailed" && blockedLogoRequests.has(message.params.requestId) && message.params.blockedReason === "inspector") expectedNetworkErrors.push(message.params.errorText);
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      const entry = message.params.entry;
      if (blockingIntroLogo && entry.url === siteUrl + "/assets/lyrion-mark.png" && entry.text.includes("ERR_BLOCKED_BY_CLIENT")) expectedNetworkErrors.push(entry.text);
      else errors.push(entry.text);
    }
  };
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error("CDP timeout: " + method)); }, 15000);
    pending.set(id, { resolve, reject, timeout });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const screenshot = async (filename, fullPage = false) => {
    const metrics = await send("Page.getLayoutMetrics");
    const size = metrics.cssContentSize;
    const args = { format: "png", captureBeyondViewport: fullPage };
    if (fullPage) args.clip = { x: 0, y: 0, width: size.width, height: size.height, scale: 1 };
    const image = await send("Page.captureScreenshot", args);
    await writeFile(path.join(artifactDir, filename), Buffer.from(image.data, "base64"));
  };
  const waitFor = async (expression, description, timeout = 6000) => {
    const deadline = Date.now() + timeout;
    do {
      if (await evaluate(expression)) return;
      await delay(40);
    } while (Date.now() < deadline);
    throw new Error("Timed out waiting for " + description);
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  // Observe rendered frames from navigation onward, including the last frame
  // before the hold ends. No application timers or animations are changed.
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const audit = window.__introAudit = { first: null, ready: null, beforeExit: null, duringExit: null, removed: null };
    const sample = () => {
      const intro = document.querySelector('.page-intro');
      if (intro?.open) {
        const css = getComputedStyle(intro), rect = intro.getBoundingClientRect();
        const logo = intro.querySelector('img'), logoRect = logo.getBoundingClientRect();
        const animation = intro.getAnimations()[0];
        const time = typeof animation?.currentTime === 'number' ? animation.currentTime : null;
        const frame = {
          now: performance.now(), time, opacity: Number(css.opacity), transform: css.transform,
          delay: css.animationDelay, duration: css.animationDuration,
          modal: intro.matches(':modal'), background: css.backgroundColor,
          viewport: { width: innerWidth, height: innerHeight },
          box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          logo: { src: logo.getAttribute('src'), decoded: logo.complete && logo.naturalWidth > 0,
            centerX: logoRect.x + logoRect.width / 2, centerY: logoRect.y + logoRect.height / 2,
            width: logoRect.width, height: logoRect.height }
        };
        audit.first ||= frame;
        if (time !== null) {
          audit.ready ||= frame;
          const hold = parseFloat(css.animationDelay) * 1000;
          const duration = parseFloat(css.animationDuration) * 1000;
          if (time < hold) audit.beforeExit = frame;
          if (!audit.duringExit && time >= hold + duration * .3 && time <= hold + duration * .7) audit.duringExit = frame;
        }
      } else if (audit.first) {
        audit.removed = { now: performance.now(), connected: Boolean(intro), scrollLocked: getComputedStyle(document.documentElement).overflow === 'hidden' };
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  })();` });
  const exerciseIntro = async (label, { reduced = false, imageName, middleImage = false } = {}) => {
    await waitFor("Boolean(window.__introAudit?.ready)", label + " intro to render");
    const first = await evaluate("window.__introAudit.first");
    const ready = await evaluate("window.__introAudit.ready");
    check(label + " intro immediately covers viewport with an opaque modal", first.modal && first.opacity === 1 && first.box.x === 0 && first.box.y === 0 && first.box.width === first.viewport.width && first.box.height === first.viewport.height, first);
    check(label + " existing logo is loaded and centered", ready.logo.src === "assets/lyrion-mark.png" && ready.logo.decoded && ready.logo.width > 80 && Math.abs(ready.logo.centerX - ready.viewport.width / 2) < 1 && Math.abs(ready.logo.centerY - ready.viewport.height / 2) < 1, ready.logo);
    check(label + " intro holds exactly three seconds", ready.delay === "3s" && ready.duration === (reduced ? "0.16s" : "0.5s"), { delay: ready.delay, duration: ready.duration });
    if (imageName) await screenshot(imageName);
    await waitFor("Boolean(document.querySelector('.hero-actions .button'))", "main page markup");
    const layoutDuringIntro = await evaluate("({width:document.querySelector('.hero').getBoundingClientRect().width,x:document.querySelector('.hero').getBoundingClientRect().x})");
    await evaluate("document.querySelector('.hero-actions .button').focus()");
    for (let index = 0; index < 3; index++) {
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    }
    check(label + " keyboard cannot focus the covered page", await evaluate("document.querySelector('.page-intro').contains(document.activeElement) || document.activeElement === document.body"));
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    check(label + " Escape cannot skip the hold", await evaluate("document.querySelector('.page-intro')?.open === true"));
    check(label + " page scrolling is locked during intro", await evaluate("getComputedStyle(document.documentElement).overflow === 'hidden'"));
    if (middleImage) {
      await waitFor("Boolean(window.__introAudit.duringExit)", "intro fade");
      await screenshot("desktop-mid-intro.png");
    }
    await waitFor("Boolean(window.__introAudit.removed)", label + " intro to finish");
    const audit = await evaluate("window.__introAudit");
    check(label + " stays fully opaque immediately before three seconds", audit.beforeExit?.time >= 2900 && audit.beforeExit.time < 3000 && audit.beforeExit.opacity === 1, audit.beforeExit);
    check(label + " fades smoothly after three seconds without moving", audit.duringExit?.time > 3000 && audit.duringExit.opacity > 0 && audit.duringExit.opacity < 1 && audit.duringExit.transform === "none", audit.duringExit);
    const elapsed = audit.removed.now - audit.ready.now + audit.ready.time;
    check(label + " removes intro and unlocks page at fade completion", !audit.removed.connected && !audit.removed.scrollLocked && Math.abs(elapsed - (reduced ? 3160 : 3500)) < 125, { elapsed, ...audit.removed });
    const layoutAfterIntro = await evaluate("({width:document.querySelector('.hero').getBoundingClientRect().width,x:document.querySelector('.hero').getBoundingClientRect().x})");
    check(label + " release preserves main page width and position", layoutDuringIntro.width === layoutAfterIntro.width && layoutDuringIntro.x === layoutAfterIntro.x, { during: layoutDuringIntro, after: layoutAfterIntro });
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    check(label + " normal keyboard access resumes after intro", await evaluate("document.activeElement.matches('a[href],button,input,summary,[tabindex]') && !document.activeElement.closest('.page-intro')"));
    await evaluate("document.activeElement.blur();window.scrollTo({top:0,behavior:'instant'})");
  };
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: siteUrl });
  await exerciseIntro("Desktop", { imageName: "desktop-intro.png", middleImage: true });
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await evaluate("document.readyState === 'complete' && Boolean(window.LYRION_PREVIEWS)")) break;
    await delay(100);
  }
  await evaluate("document.fonts.ready.then(() => true)");
  check("Roboto loaded and applied", await evaluate("document.fonts.check('16px Roboto') && getComputedStyle(document.body).fontFamily.includes('Roboto')"));
  check("Review surface is white with black text", await evaluate("getComputedStyle(document.querySelector('.reviews')).backgroundColor === 'rgb(255, 255, 255)' && getComputedStyle(document.querySelector('#reviews-title')).color === 'rgb(17, 17, 17)' && getComputedStyle(document.querySelector('.review-card blockquote > p')).color === 'rgb(23, 21, 27)'"));
  check("No nested entrance transforms", await evaluate("!document.querySelector('.will-reveal .will-reveal')"));
  check("Feature cards have subtle stagger delays", await evaluate("JSON.stringify([...document.querySelectorAll('.preview-card')].map(el=>el.style.getPropertyValue('--reveal-delay'))) === JSON.stringify(['80ms','140ms','200ms','260ms'])"));
  check("Offscreen components wait to reveal and hidden fourth review is ready", await evaluate("!document.querySelector('.waitlist-board').classList.contains('is-visible') && document.querySelector('[data-review=\"3\"]').classList.contains('is-visible')"));
  check("Three visible reviews out of four", await evaluate("document.querySelectorAll('.review-card:not([hidden])').length === 3 && document.querySelectorAll('.review-card').length === 4"));
  check("Marked captions, arrows and privacy section removed", await evaluate("!document.querySelector('.hero-bottom,.gallery-note,.visual-caption,.illustrative-label,#privacy,.hero-actions [aria-hidden],.preview-open [aria-hidden]')"));
  check("Visible sample-content notes are removed", await evaluate("!document.querySelector('[data-reviews-note],.reviews-note') && !/Nội dung mẫu|Giao diện minh họa|dữ liệu minh họa/i.test(document.body.textContent)"));
  check("Waitlist replaces privacy section", await evaluate("document.querySelector('#waitlist').previousElementSibling.id === 'intelligence' && document.querySelector('#waitlist').nextElementSibling.id === 'reviews'"));
  check("Inter font loaded", await evaluate("document.fonts.check('16px Inter')"));
  check("Compact island navigation", await evaluate("document.querySelector('.site-header').getBoundingClientRect().width < 650 && document.querySelector('.site-header').getBoundingClientRect().height < 65"));
  check("Four app previews", await evaluate("document.querySelectorAll('.preview-grid [data-preview]').length === 4"));
  check("App Store disabled until configured", await evaluate("document.querySelector('[data-store-link]').getAttribute('aria-disabled') === 'true' && !document.querySelector('[data-store-link]').hasAttribute('href')"));
  check("No broken eager images", await evaluate("Promise.all([...document.images].filter(img => img.loading !== 'lazy').map(img => img.decode().then(()=>true,()=>false))).then(results=>results.every(Boolean))"));
  check("All anchor targets exist", await evaluate("[...document.querySelectorAll('a[href^=\"#\"]')].every(a => document.getElementById(a.getAttribute('href').slice(1)))"));
  for (const width of [1440, 1024, 768, 390, 320]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    await delay(100);
    const layout = await evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth})");
    check("No horizontal overflow at " + width, layout.scroll <= width, layout);
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await evaluate("window.scrollTo({top:document.querySelector('.waitlist-board').getBoundingClientRect().top+scrollY-innerHeight+50,behavior:'instant'})");
  await delay(80);
  check("Reveal waits until component is farther inside viewport", await evaluate("!document.querySelector('.waitlist-board').classList.contains('is-visible')"));
  await evaluate("window.scrollBy({top:230,behavior:'instant'})");
  await delay(40);
  const entranceStart=await evaluate("({opacity:Number(getComputedStyle(document.querySelector('.waitlist-board')).opacity),y:new DOMMatrix(getComputedStyle(document.querySelector('.waitlist-board')).transform).m42})");
  await delay(230);
  const entranceMiddle=await evaluate("({opacity:Number(getComputedStyle(document.querySelector('.waitlist-board')).opacity),y:new DOMMatrix(getComputedStyle(document.querySelector('.waitlist-board')).transform).m42})");
  await delay(420);
  check("Components rise subtly from below and settle smoothly", entranceStart.opacity < entranceMiddle.opacity && entranceStart.y > entranceMiddle.y && entranceStart.y > 0 && await evaluate("Number(getComputedStyle(document.querySelector('.waitlist-board')).opacity) === 1"),{entranceStart,entranceMiddle});
  await evaluate("document.querySelector('#waitlist-name').focus()");
  const focusedReveal = await evaluate("({active:document.activeElement.id,items:[...document.querySelectorAll('#waitlist .will-reveal')].map(el=>({name:el.className,opacity:getComputedStyle(el).opacity}))})");
  check("Keyboard focus immediately reveals its section", focusedReveal.items.every(el=>el.name.includes('is-visible') && el.name.includes('reveal-instant') && el.opacity === '1'), focusedReveal);
  await evaluate("document.activeElement.blur();window.scrollTo({top:0,behavior:'instant'})");
  await delay(80);
  const screenOverflow = await evaluate("[...document.querySelectorAll('.preview-grid .app-screen')].map(el => ({name:el.parentElement.getAttribute('aria-label'),visible:el.clientHeight,content:el.scrollHeight})).filter(item => item.content > item.visible + 1)");
  check("App mockup content fits", screenOverflow.length === 0, screenOverflow);
  const h1 = await evaluate("({height:document.querySelector('h1').getBoundingClientRect().height,line:parseFloat(getComputedStyle(document.querySelector('h1')).lineHeight),cta:document.querySelector('.hero-actions').getBoundingClientRect().bottom})");
  check("Hero heading two lines and CTA above fold", h1.height <= h1.line * 2 + 2 && h1.cta < 900, h1);
  await evaluate("document.querySelector('[data-tab=\"balance\"]').click()");
  check("Algorithm tab shows selected panel", await evaluate("!document.getElementById('panel-balance').hidden && document.getElementById('panel-adapt').hidden"));
  await evaluate("document.querySelector('[data-tab=\"balance\"]').focus()");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight" });
  check("Algorithm keyboard navigation", await evaluate("document.querySelector('[data-tab=\"freedom\"]').getAttribute('aria-selected') === 'true' && document.activeElement.id === 'tab-freedom'"));
  await evaluate("document.querySelector('[data-tab=\"adapt\"]').click()");
  await evaluate("document.querySelector('[data-open-preview=\"welcome\"]').click()");
  check("Screenshot dialog opens", await evaluate("document.querySelector('dialog').open"));
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight" });
  check("Screenshot keyboard navigation", await evaluate("document.querySelector('[data-preview-count]').textContent === '2 / 4'"));
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await delay(100);
  check("Dialog closes and restores focus", await evaluate("!document.querySelector('dialog').open && document.activeElement.dataset.openPreview === 'welcome'"));
  await evaluate("document.querySelector('summary').click()");
  check("FAQ expands", await evaluate("document.querySelector('details').open"));
  await evaluate("document.querySelector('summary').click()");
  await evaluate("document.querySelector('.reviews').scrollIntoView({behavior:'instant'});");
  await delay(120);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
  const reviewOrder = [];
  for (let index = 0; index < 5; index++) {
    reviewOrder.push(await evaluate("[...document.querySelectorAll('.review-card:not([hidden])')].map(el=>Number(el.dataset.review)+1)"));
    await evaluate("document.querySelector('.reviews-next').click()");
  }
  check("Review next arrow cycles 1-2-3-4-1 with three cards", JSON.stringify(reviewOrder) === JSON.stringify([[1,2,3],[2,3,4],[3,4,1],[4,1,2],[1,2,3]]), reviewOrder);
  await evaluate("document.querySelector('.reviews-next').focus()");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  const reviewKeyboard = await evaluate("({current:document.querySelector('.review-card:not([hidden])').dataset.review,focus:document.activeElement.className})");
  check("Review arrow works by keyboard and retains focus", reviewKeyboard.current === '2' && reviewKeyboard.focus === 'reviews-next', reviewKeyboard);
  await evaluate("document.querySelector('.reviews-next').click();document.querySelector('.reviews-next').click();document.querySelector('.preview-trigger').scrollIntoView({behavior:'instant',block:'center'})");
  await delay(100);
  const previewPoint = await evaluate("(()=>{const r=document.querySelector('.preview-trigger').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+100}})()");
  const normalPreview = await evaluate("new DOMMatrix(getComputedStyle(document.querySelector('.preview-trigger .device')).transform).a");
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: previewPoint.x, y: previewPoint.y });
  await delay(300);
  check("App image enlarges upward on hover", await evaluate("(()=>{const m=new DOMMatrix(getComputedStyle(document.querySelector('.preview-trigger .device')).transform);return m.a > " + normalPreview + " && m.f < 0})()"));
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 4, y: 4 });
  await delay(300);
  check("App image returns after hover", await evaluate("Math.abs(new DOMMatrix(getComputedStyle(document.querySelector('.preview-trigger .device')).transform).a - " + normalPreview + ") < .001"));
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 240, y: 180 });
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 800, y: 350 });
  await delay(100);
  check("Background lines, light sources and pointer effects are removed", await evaluate("!document.querySelector('.pointer-trail,.background-trace,.ambient-light,.wave-field,.hero-core,.hero-orbit,#pointer-glow')"));
  await evaluate("window.scrollTo({top:0,behavior:'instant'})");
  await delay(100);
  const initialScale = await evaluate("new DOMMatrix(getComputedStyle(document.querySelector('.hero-phones')).transform).a");
  await evaluate("window.scrollTo({top:250,behavior:'instant'})");
  await delay(100);
  const middleScale = await evaluate("new DOMMatrix(getComputedStyle(document.querySelector('.hero-phones')).transform).a");
  await evaluate("window.scrollTo({top:700,behavior:'instant'})");
  await delay(100);
  const scrolledScale = await evaluate("new DOMMatrix(getComputedStyle(document.querySelector('.hero-phones')).transform).a");
  check("Hero images shrink from bottom-origin scale on scroll", initialScale > middleScale && middleScale > scrolledScale && scrolledScale === 1, { initialScale, middleScale, scrolledScale });
  await evaluate("window.scrollTo({top:0,behavior:'instant'})");
  await delay(100);
  check("Hero scale restores on return to top", await evaluate("new DOMMatrix(getComputedStyle(document.querySelector('.hero-phones')).transform).a > 1.07"));

  await evaluate("window.__realFetch=window.fetch;window.__formCalls=0;window.fetch=()=>{window.__formCalls++;return new Promise(r=>window.__resolveForm=r)};document.querySelector('#waitlist-name').value='Nguyễn An';document.querySelector('#waitlist-email').value='an@example.com';document.querySelector('#waitlist-form').requestSubmit();document.querySelector('#waitlist-form').requestSubmit()");
  check("Waitlist prevents duplicate submissions while pending", await evaluate("window.__formCalls === 1 && document.querySelector('.waitlist-fields').disabled && document.querySelector('#waitlist-form').getAttribute('aria-busy') === 'true'"));
  await evaluate("window.__resolveForm(new Response(JSON.stringify({ok:true}),{status:200,headers:{'Content-Type':'application/json'}}))");
  await delay(60);
  check("Waitlist success clears form and announces result", await evaluate("document.querySelector('#waitlist-status').dataset.state === 'success' && document.querySelector('#waitlist-name').value === '' && !document.querySelector('.waitlist-fields').disabled"));
  await evaluate("window.fetch=async()=>new Response(JSON.stringify({ok:false}),{status:503});document.querySelector('#waitlist-name').value='Nguyễn An';document.querySelector('#waitlist-email').value='an@example.com';document.querySelector('#waitlist-form').requestSubmit()");
  await delay(60);
  check("Unconfigured waitlist shows honest error and retains input", await evaluate("document.querySelector('#waitlist-status').dataset.state === 'error' && document.querySelector('#waitlist-status').textContent.includes('chưa mở') && document.querySelector('#waitlist-email').value === 'an@example.com'"));
  await evaluate("window.fetch=async()=>{throw new TypeError('Offline')};document.querySelector('#waitlist-form').requestSubmit()");
  await delay(60);
  check("Waitlist can retry after a network error", await evaluate("!document.querySelector('.waitlist-fields').disabled && document.querySelector('#waitlist-status').textContent.includes('gián đoạn')"));
  await evaluate("window.fetch=window.__realFetch;document.querySelector('#waitlist-form').reset();document.querySelector('#waitlist-status').textContent='';document.activeElement.blur()");
  for (const [width, height, prefix] of [[1440,900,"desktop"],[390,844,"mobile"]]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    await send("Emulation.setTouchEmulationEnabled", { enabled: width < 768 });
    await evaluate("(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=600){window.scrollTo({top:y,behavior:'instant'});await new Promise(r=>setTimeout(r,25));}window.scrollTo({top:0,behavior:'instant'});return true})()");
    await delay(750);
    await screenshot(prefix + ".png");
    await screenshot(prefix + "-full.png", true);
    await evaluate("document.querySelector('#waitlist').scrollIntoView({behavior:'instant',block:'center'})");
    await delay(150);
    await screenshot(prefix + "-waitlist.png");
    await evaluate("document.querySelector('#reviews').scrollIntoView({behavior:'instant',block:'center'})");
    await delay(800);
    await screenshot(prefix + "-reviews.png");
    if (width < 768) {
      check("Touch devices have no pointer or background effect", await evaluate("!matchMedia('(pointer:fine)').matches && !document.querySelector('.pointer-trail,.background-trace,.ambient-light,.wave-field,#pointer-glow')"));
      await evaluate("document.querySelector('.menu-toggle').click()");
      check("Mobile menu opens", await evaluate("document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'true' && getComputedStyle(document.querySelector('.site-nav')).display !== 'none'"));
      await evaluate("document.querySelector('.site-nav a').click()");
      check("Mobile menu closes after navigation", await evaluate("document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'false'"));
    }
  }
  check("All local images loaded", await evaluate("[...document.images].every(img=>img.complete && img.naturalWidth>0)"));
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await delay(100);
  check("Reduced motion preference respected", await evaluate("getComputedStyle(document.documentElement).scrollBehavior === 'auto' && [...document.querySelectorAll('.will-reveal')].every(el=>getComputedStyle(el).opacity === '1')"));
  check("Reduced motion keeps effects absent and disables scroll scale", await evaluate("!document.querySelector('.pointer-trail,.background-trace,.ambient-light,.wave-field,#pointer-glow') && getComputedStyle(document.querySelector('.hero-phones')).transform === 'none'"));
  await evaluate("window.LYRION_CONFIG.appStoreUrl='https://apps.apple.com/vn/app/lyrionfitness/id123456789';window.LYRION_CONFIG.screenshots.welcome='assets/lyrion-icon.png'");
  await evaluate("new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='script.js?config-test';s.onload=resolve;s.onerror=reject;document.head.append(s)})");
  check("App Store activates from config", await evaluate("document.querySelector('[data-store-link]').href === window.LYRION_CONFIG.appStoreUrl && !document.querySelector('[data-store-link]').hasAttribute('aria-disabled') && document.querySelector('[data-store-label]').textContent === 'Tải trên App Store'"));
  check("Real screenshot config replaces preview", await evaluate("document.querySelector('[data-preview=\"welcome\"] img').getAttribute('src') === 'assets/lyrion-icon.png'"));
  await evaluate("window.LYRION_CONFIG.reviews[0].avatar='assets/lyrion-icon.png';window.LYRION_CONFIG.reviews[0].name='Ảnh mới';new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='reviews.js?config-test';s.onload=resolve;s.onerror=reject;document.head.append(s)})");
  check("Review avatar can be replaced from config", await evaluate("document.querySelector('[data-review=\"0\"] .avatar img').getAttribute('src').endsWith('assets/lyrion-icon.png') && document.querySelector('[data-review=\"0\"] strong').textContent === 'Ảnh mới'"));
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await send("Page.reload", { ignoreCache: false });
  await exerciseIntro("Reload");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await send("Page.reload", { ignoreCache: false });
  await exerciseIntro("Mobile", { imageName: "mobile-intro.png" });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Page.reload", { ignoreCache: false });
  await exerciseIntro("Reduced motion", { reduced: true });
  await send("Emulation.setScriptExecutionDisabled", { value: true });
  await send("Page.reload", { ignoreCache: true });
  await waitFor("document.readyState === 'complete'", "page without JavaScript");
  check("JavaScript-disabled page has no blocking intro", await evaluate("!document.querySelector('.page-intro').open && getComputedStyle(document.querySelector('.page-intro')).display === 'none' && getComputedStyle(document.documentElement).overflow !== 'hidden'"));
  await evaluate("document.querySelector('.hero-actions .button').focus()");
  check("JavaScript-disabled page is visible and keyboard-accessible", await evaluate("document.activeElement.matches('.hero-actions .button') && getComputedStyle(document.querySelector('.hero-copy')).opacity === '1' && document.querySelector('h1').getBoundingClientRect().height > 0"));
  await send("Emulation.setScriptExecutionDisabled", { value: false });
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Network.setBlockedURLs", { urls: [siteUrl + "/assets/lyrion-mark.png"] });
  blockingIntroLogo = true;
  await send("Page.navigate", { url: siteUrl + "/?intro-logo-failure" });
  await waitFor("location.search === '?intro-logo-failure' && document.readyState === 'complete' && Boolean(window.LYRION_PREVIEWS)", "page with unavailable logo");
  await waitFor("!document.querySelector('.page-intro')", "failed-logo fallback");
  await evaluate("document.querySelector('.hero-actions .button').focus()");
  check("Unavailable intro logo releases the page and keyboard focus", expectedNetworkErrors.length > 0 && await evaluate("getComputedStyle(document.documentElement).overflow !== 'hidden' && document.activeElement.matches('.hero-actions .button')"), { expectedBlockedRequests: expectedNetworkErrors.length });
  blockingIntroLogo = false;
  await send("Network.setBlockedURLs", { urls: [] });
  check("No browser errors", errors.length === 0, errors);
  await writeFile(path.join(artifactDir, "verification.json"), JSON.stringify({ results, errors, expectedNetworkErrors }, null, 2));
  if (results.some(result => !result.passed)) process.exitCode = 1;
} finally {
  if (send && ws?.readyState === WebSocket.OPEN) {
    try { await send("Browser.close"); } catch {}
    ws.close();
  }
  browser.kill();
  server.kill();
}

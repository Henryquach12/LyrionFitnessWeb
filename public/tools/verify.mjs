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
    const audit = window.__introAudit = {
      first: null, ready: null, beforeExit: null, duringExit: null, removed: null,
      hero: { first: null, beforeStart: null, start: null, middle: null, finished: null, maxBeforeScale: 0 }
    };
    const sample = () => {
      const figures = document.querySelector('.hero-entrance');
      if (figures && !audit.hero.finished) {
        const css = getComputedStyle(figures), animation = figures.getAnimations()[0];
        const frame = {
          now: performance.now(), scale: new DOMMatrix(css.transform).a, opacity: Number(css.opacity),
          width: figures.offsetWidth, height: figures.offsetHeight,
          figures: figures.querySelectorAll('.hero-phone').length,
          time: typeof animation?.currentTime === 'number' ? animation.currentTime : null,
          duration: parseFloat(css.animationDuration) * 1000
        };
        audit.hero.first ||= frame;
        if (frame.time !== null) {
          audit.hero.start ||= frame;
          if (!audit.hero.middle && frame.time >= frame.duration * .3 && frame.time <= frame.duration * .6) audit.hero.middle = frame;
        } else if (!audit.hero.start) {
          audit.hero.beforeStart = frame;
          audit.hero.maxBeforeScale = Math.max(audit.hero.maxBeforeScale, frame.scale);
        } else {
          audit.hero.finished = frame;
        }
      }
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
        audit.removed ||= { now: performance.now(), connected: Boolean(intro), scrollLocked: getComputedStyle(document.documentElement).overflow === 'hidden' };
      }
      if (audit.removed && audit.hero.finished) return;
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
    check(label + " intro holds exactly one second", ready.delay === "1s" && ready.duration === (reduced ? "0.16s" : "0.5s"), { delay: ready.delay, duration: ready.duration });
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
    check(label + " stays fully opaque immediately before one second", audit.beforeExit?.time >= 900 && audit.beforeExit.time < 1000 && audit.beforeExit.opacity === 1, audit.beforeExit);
    check(label + " fades smoothly after one second without moving", audit.duringExit?.time > 1000 && audit.duringExit.opacity > 0 && audit.duringExit.opacity < 1 && audit.duringExit.transform === "none", audit.duringExit);
    const elapsed = audit.removed.now - audit.ready.now + audit.ready.time;
    check(label + " removes intro and unlocks page at fade completion", !audit.removed.connected && !audit.removed.scrollLocked && Math.abs(elapsed - (reduced ? 1160 : 1500)) < 125, { elapsed, ...audit.removed });
    const layoutAfterIntro = await evaluate("({width:document.querySelector('.hero').getBoundingClientRect().width,x:document.querySelector('.hero').getBoundingClientRect().x})");
    check(label + " release preserves main page width and position", layoutDuringIntro.width === layoutAfterIntro.width && layoutDuringIntro.x === layoutAfterIntro.x, { during: layoutDuringIntro, after: layoutAfterIntro });
    if (imageName && !reduced) await screenshot(imageName.replace('-intro.png', '-hero-entrance.png'));
    await waitFor("Boolean(window.__introAudit.hero.finished)", label + " hero figures to settle");
    const hero = await evaluate("window.__introAudit.hero");
    const fadeStart = audit.ready.now - audit.ready.time + 1000;
    check(label + " two existing hero figures begin with the logo fade", hero.first.figures === 2 && Math.abs(hero.start.now - fadeStart) < 125, { heroStart: hero.start.now, fadeStart, figures: hero.first.figures });
    if (reduced) {
      check(label + " hero uses a brief fade with no scaling", hero.first.scale === 1 && hero.middle.scale === 1 && hero.finished.scale === 1 && hero.start.duration <= 250 && hero.middle.opacity > hero.first.opacity, hero);
    } else {
      check(label + " hero figures stay noticeably small before entering", hero.first.scale > 0 && hero.maxBeforeScale <= .8 && hero.beforeStart.now >= fadeStart - 100, hero.beforeStart);
      check(label + " hero figures grow gradually to their intended size", hero.start.duration >= 1600 && hero.start.duration <= 3000 && hero.middle.scale > hero.first.scale && hero.middle.scale < 1 && hero.finished.scale === 1 && hero.finished.opacity === 1, hero);
    }
    check(label + " hero entrance preserves layout dimensions", hero.first.width === hero.finished.width && hero.first.height === hero.finished.height, { before: hero.first, after: hero.finished });
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
  check("Be Vietnam Pro font weights load from declared faces", await evaluate(`
    Promise.all([400, 500, 600, 700].map(async weight => {
      const faces = await document.fonts.load(weight + ' 16px "Be Vietnam Pro"', 'Tập luyện và dinh dưỡng');
      return faces.length > 0 && faces.every(face => face.status === 'loaded' && face.weight === String(weight));
    })).then(loaded => loaded.every(Boolean))
  `));
  check("Reviews use the theme background and white headings", await evaluate(`
    getComputedStyle(document.querySelector('.reviews')).backgroundColor === 'rgba(0, 0, 0, 0)' &&
    [...document.querySelectorAll('#reviews-title, #reviews-title span, .reviews-heading .eyebrow')].every(element => getComputedStyle(element).color === 'rgb(255, 255, 255)') &&
    document.querySelector('#reviews-title').innerText.replace(/\\s+/g, ' ').trim() === 'Người dùng Lyrion Đánh giá thế nào?'
  `));
  check("Review cards retain white surfaces and dark readable copy", await evaluate(`
    [...document.querySelectorAll('.review-card')].every(card =>
      getComputedStyle(card).backgroundColor === 'rgb(255, 255, 255)' &&
      getComputedStyle(card.querySelector('blockquote > p')).color === 'rgb(23, 21, 27)')
  `));
  check("Every review has an accessible four- or five-star rating", await evaluate(`
    [...document.querySelectorAll('.review-card')].every(card => {
      const rating = card.querySelector('.review-rating');
      const stars = Number(rating?.dataset.rating);
      return [4, 5].includes(stars) && rating.getAttribute('role') === 'img' &&
        rating.getAttribute('aria-label') === stars + ' trên 5 sao' &&
        rating.querySelector('[aria-hidden="true"]')?.textContent.replace(/\\s/g, '').length === 5;
    }) && document.querySelector('.review-rating[data-rating="4"]') !== null && document.querySelector('.review-rating[data-rating="5"]') !== null
  `));
  check("No nested entrance transforms", await evaluate("!document.querySelector('.will-reveal .will-reveal')"));
  check("Feature cards have subtle stagger delays", await evaluate("JSON.stringify([...document.querySelectorAll('.preview-card')].map(el=>el.style.getPropertyValue('--reveal-delay'))) === JSON.stringify(['80ms','140ms','200ms','260ms'])"));
  check("Offscreen components wait to reveal and hidden fourth review is ready", await evaluate("!document.querySelector('.waitlist-board').classList.contains('is-visible') && document.querySelector('[data-review=\"3\"]').classList.contains('is-visible')"));
  check("Three visible reviews out of four", await evaluate("document.querySelectorAll('.review-card:not([hidden])').length === 3 && document.querySelectorAll('.review-card').length === 4"));
  check("Marked captions, hero footnote, arrows and privacy section removed", await evaluate("!document.querySelector('.hero-footnote,.hero-bottom,.gallery-note,.visual-caption,.illustrative-label,#privacy,.hero-actions [aria-hidden],.preview-open [aria-hidden]')"));
  check("Visible sample-content notes are removed", await evaluate("!document.querySelector('[data-reviews-note],.reviews-note') && !/Nội dung mẫu|Giao diện minh họa|dữ liệu minh họa/i.test(document.body.textContent)"));
  check("Main sections follow the product, reviews, signup and FAQ order", await evaluate("JSON.stringify([...document.querySelector('main').children].filter(section => section.id).map(section => section.id)) === JSON.stringify(['top','features','intelligence','reviews','waitlist','faq'])"));
  check("Page, app previews and review avatars share Be Vietnam Pro", await evaluate(`
    (() => {
      const normalize = value => value.split(',').map(family => family.trim()).join(',');
      const stack = normalize(getComputedStyle(document.documentElement).getPropertyValue('--font-sans'));
      const elements = [document.body, document.querySelector('.phone-preview'), document.querySelector('.avatar')];
      return stack.startsWith('"Be Vietnam Pro",') && elements.every(element =>
        element && normalize(getComputedStyle(element).fontFamily) === stack);
    })()
  `));
  const desktopNav = await evaluate(`(() => {
    const header = document.querySelector('.site-header'), css = getComputedStyle(header);
    const links = [...document.querySelectorAll('.site-nav a')].filter(link => link.getClientRects().length);
    return { width: header.getBoundingClientRect().width, height: header.getBoundingClientRect().height,
      padding: parseFloat(css.paddingRight), gap: parseFloat(getComputedStyle(document.querySelector('.site-nav')).gap),
      links: links.map(link => ({ href: link.getAttribute('href'), height: link.getBoundingClientRect().height, fontSize: parseFloat(getComputedStyle(link).fontSize) })),
      blur: css.backdropFilter, background: css.backgroundColor, shadow: css.boxShadow };
  })()`);
  check("Desktop island navigation is larger with comfortable click targets", desktopNav.height >= 64 && desktopNav.width > 650 && desktopNav.width < 1100 && desktopNav.padding >= 18 && desktopNav.gap > 18 && desktopNav.links.every(link => link.height >= 40 && link.fontSize >= 13), desktopNav);
  check("Desktop navigation places the tester guide immediately after FAQ", JSON.stringify(desktopNav.links.map(link => link.href)) === JSON.stringify(['#features', '#intelligence', '#reviews', '#faq', 'tester.html', '#waitlist']), desktopNav.links);
  check("Desktop menu has restrained translucent glass styling", desktopNav.blur.includes('blur(') && desktopNav.background.startsWith('rgba(') && desktopNav.shadow !== 'none', desktopNav);
  check("Four app previews", await evaluate("document.querySelectorAll('.preview-grid [data-preview]').length === 4"));
  check("Hero invites early signup and the obsolete download section is gone", await evaluate(`
    document.querySelector('.hero-actions .button').getAttribute('href') === '#waitlist' &&
    document.querySelector('.hero-actions .button').textContent.trim() === 'Đăng ký sớm' &&
    !document.querySelector('#download,.download,[data-store-link]') && !document.body.textContent.includes('Tải tại đây')
  `));
  check("Tester navigation opens a separate protected tab and hero has only signup", await evaluate(`
    (() => {
      const link = document.querySelector('.site-nav a[href="tester.html"]');
      return link && link.textContent.trim() === 'Trở thành tester' && link.target === '_blank' && link.relList.contains('noopener') && document.querySelectorAll('.hero-actions a').length === 1;
    })()
  `));
  check("Signup privacy text and final support contact match the requested copy", await evaluate(`
    document.querySelector('.form-note').textContent.trim() === 'Email của bạn sẽ không bị chia sẻ cho bên thứ ba' &&
    document.querySelector('.site-footer').textContent.includes('Mọi thông tin liên hệ: support@lyrionfitness.com') &&
    document.querySelector('.site-footer a[href="mailto:support@lyrionfitness.com"]') !== null
  `));
  check("No broken eager images", await evaluate("Promise.all([...document.images].filter(img => img.loading !== 'lazy').map(img => img.decode().then(()=>true,()=>false))).then(results=>results.every(Boolean))"));
  check("All section anchor targets exist", await evaluate("[...document.querySelectorAll('a[href^=\"#\"]')].every(a => document.getElementById(a.getAttribute('href').slice(1)))"));
  // Recorded before the prompt changes, with the same bundled font loaded.
  // Keep these essentials inline so verification does not depend on local artifacts.
  for (const [width, headerX, headerWidth, buttonX, menuX, menuWidth] of [
    [390, 20, 350, 291.90625, 40, 310],
    [320, 16, 288, 225.90625, 20, 280]
  ]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate("window.scrollTo({top:0,behavior:'instant'})");
    await delay(100);
    const closed = await evaluate(`(() => {
      const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
      const header = getComputedStyle(document.querySelector('.site-header'));
      const toggle = getComputedStyle(document.querySelector('.menu-toggle'));
      return { header: box('.site-header'), toggle: box('.menu-toggle'), closed: getComputedStyle(document.querySelector('.site-nav')).display === 'none',
        padding: header.padding, gap: header.gap, fontSize: toggle.fontSize, blur: header.backdropFilter, background: header.backgroundColor };
    })()`);
    const closeTo = (actual, expected) => actual.every((value, index) => Math.abs(value - expected[index]) < .1);
    check("Mobile navigation preserves original closed geometry at " + width,
      closed.closed && closeTo(closed.header, [headerX, 12, headerWidth, 54]) && closeTo(closed.toggle, [buttonX, 18, 64.09375, 42]), closed);
    check("Mobile navigation preserves original sizing and glass styling at " + width,
      closed.padding === '5px 13px 5px 9px' && closed.gap === '30px' && closed.fontSize === '12px' && closed.blur === 'blur(20px)' && closed.background === 'rgba(10, 8, 15, 0.86)', closed);
    await evaluate("document.querySelector('.menu-toggle').click()");
    const opened = await evaluate(`(() => {
      const menu = document.querySelector('.site-nav'), r = menu.getBoundingClientRect(), css = getComputedStyle(menu);
      const links = [...menu.querySelectorAll('a')].filter(link => link.getClientRects().length);
      return { box: [r.x, r.y, r.width, r.height], padding: css.padding, background: css.backgroundColor,
        links: links.map(link => ({ href: link.getAttribute('href'), font: getComputedStyle(link).fontSize, padding: getComputedStyle(link).padding })) };
    })()`);
    check("Mobile dropdown preserves its placement and adds the tester guide at " + width,
      closeTo(opened.box.slice(0, 3), [menuX, 74, menuWidth]) && opened.box[3] > 195 && opened.box[3] < 270 && opened.padding === '15px' && opened.background === 'rgb(26, 22, 36)' &&
      JSON.stringify(opened.links.map(link => link.href)) === JSON.stringify(['#features', '#intelligence', '#reviews', 'tester.html']) &&
      opened.links.every(link => link.font === '16px' && link.padding === '14px'), opened);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    check("Mobile Escape closes menu and restores toggle focus at " + width, await evaluate("document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'false' && document.activeElement.matches('.menu-toggle')"));
    await evaluate("document.activeElement.blur()");
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 59, right: 0, bottom: 34, left: 0 } });
  await evaluate("window.scrollTo({top:0,behavior:'instant'})");
  await delay(100);
  const notch = await evaluate(`(() => {
    const header = document.querySelector('.site-header').getBoundingClientRect();
    const body = getComputedStyle(document.body);
    return { viewport: document.querySelector('meta[name="viewport"]').content,
      theme: document.querySelector('meta[name="theme-color"]').content.toLowerCase(),
      root: getComputedStyle(document.documentElement).backgroundColor,
      bodyTop: document.body.getBoundingClientRect().top, background: body.backgroundImage,
      paddingTop: body.paddingTop, paddingBottom: body.paddingBottom,
      header: { x: header.x, y: header.y, width: header.width, height: header.height } };
  })()`);
  check("Notch viewport extends the matching purple background through the top safe area", notch.viewport.includes('viewport-fit=cover') && notch.theme === '#251d38' && notch.root === 'rgb(37, 29, 56)' && notch.bodyTop === 0 && notch.background.includes('linear-gradient') && notch.background.includes('rgb(37, 29, 56)'), notch);
  check("Notch insets preserve the mobile menu size and safe-region offset", notch.paddingTop === '59px' && notch.paddingBottom === '34px' && notch.header.x === 20 && notch.header.y === 71 && notch.header.width === 350 && notch.header.height === 54, notch);
  await screenshot("mobile-safe-area.png");
  await send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, right: 0, bottom: 0, left: 0 } });
  for (const width of [1440, 1024, 768, 390, 320]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    await delay(100);
    const layout = await evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth})");
    check("No horizontal overflow at " + width, layout.scroll <= width, layout);
    check("Landing footer keeps the journey and contact centered at " + width, await evaluate(`(() => {
      const footer=document.querySelector('.site-footer'), journey=footer.querySelector('p:not(.support-line)'), contact=footer.querySelector('.support-line');
      const center=element=>{const r=element.getBoundingClientRect();return r.x+r.width/2};
      return journey.getClientRects().length>0 && getComputedStyle(journey).textAlign==='center' && getComputedStyle(contact).textAlign==='center' && Math.abs(center(journey)-center(contact))<1 && Math.abs(center(contact)-center(footer))<1;
    })()`));
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
  const inspectTabs = `(() => {
    const group = document.querySelector('.intelligence-tabs');
    const indicator = group.querySelector('.intelligence-tab-indicator');
    const buttons = [...group.querySelectorAll('[role="tab"]')];
    const box = element => { const r = element.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; };
    const active = buttons.find(button => button.getAttribute('aria-selected') === 'true');
    const position = box(indicator), target = box(active);
    return { group:box(group), background:getComputedStyle(group).backgroundColor, indicator:position,
      duration:getComputedStyle(indicator).transitionDuration, active:active.id,
      aligned:Math.abs(position.y + position.height / 2 - target.y - target.height / 2) < 1 && Math.abs(position.x + position.width / 2 - target.x - target.width / 2) < 1,
      buttons:buttons.map(button => ({ ...box(button), label:button.textContent.trim(), selected:button.getAttribute('aria-selected'), tabIndex:button.tabIndex })) };
  })()`;
  const clickTab = async name => {
    const point = await evaluate(`(() => { const r = document.querySelector('[data-tab="${name}"]').getBoundingClientRect(); return {x:r.x + r.width / 2, y:r.y + r.height / 2}; })()`);
    await send("Input.dispatchMouseEvent", { type:"mouseMoved", ...point });
    await send("Input.dispatchMouseEvent", { type:"mousePressed", ...point, button:"left", clickCount:1 });
    await send("Input.dispatchMouseEvent", { type:"mouseReleased", ...point, button:"left", clickCount:1 });
  };
  for (const width of [1440, 390, 320]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height:900, deviceScaleFactor:1, mobile:width < 768 });
    await evaluate("document.querySelector('[data-tab=\"adapt\"]').click();document.querySelector('.intelligence-tabs').scrollIntoView({behavior:'instant',block:'center'})");
    await delay(400);
    const initial = await evaluate(inspectTabs);
    check("Tabs retain three evenly divided vertical rows inside one frame at " + width,
      initial.background !== 'rgba(0, 0, 0, 0)' && initial.aligned && initial.buttons.every(button => Math.abs(button.width - initial.buttons[0].width) < 1 && Math.abs(button.height - initial.buttons[0].height) < 1 && Math.abs(button.x - initial.buttons[0].x) < 1) &&
      initial.buttons.every((button, index) => index === 0 || button.y >= initial.buttons[index - 1].y + initial.buttons[index - 1].height - 1) &&
      ['Thích ứng', 'Cân bằng', 'Tự do'].every((label, index) => initial.buttons[index].label.startsWith(label)), initial);
    await clickTab('freedom');
    await delay(90);
    const middle = await evaluate(inspectTabs);
    await delay(350);
    const settled = await evaluate(inspectTabs);
    check("Active tab indicator slides through intermediate positions at " + width,
      middle.indicator.y > initial.indicator.y + 1 && middle.indicator.y < settled.indicator.y - 1 && settled.aligned && settled.active === 'tab-freedom',
      { start:initial.indicator.y, middle:middle.indicator.y, finish:settled.indicator.y, aligned:settled.aligned, duration:middle.duration });
    await clickTab('adapt');
    await delay(75);
    await clickTab('balance');
    await delay(75);
    await clickTab('freedom');
    await delay(400);
    const interrupted = await evaluate(inspectTabs);
    check("Rapid tab changes settle on the final selection at " + width,
      interrupted.aligned && interrupted.active === 'tab-freedom' && interrupted.buttons.filter(button => button.selected === 'true' && button.tabIndex === 0).length === 1 &&
      await evaluate("!document.getElementById('panel-freedom').hidden && document.getElementById('panel-adapt').hidden && document.getElementById('panel-balance').hidden"), interrupted);
  }
  await send("Emulation.setDeviceMetricsOverride", { width:1440, height:900, deviceScaleFactor:1, mobile:false });
  await delay(400);
  check("Active tab indicator stays aligned after resizing back to desktop", (await evaluate(inspectTabs)).aligned);
  await evaluate("document.querySelector('[data-tab=\"balance\"]').click()");
  check("Algorithm tab shows selected panel", await evaluate("!document.getElementById('panel-balance').hidden && document.getElementById('panel-adapt').hidden"));
  await evaluate("document.querySelector('[data-tab=\"balance\"]').focus()");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight" });
  check("Algorithm keyboard navigation", await evaluate("document.querySelector('[data-tab=\"freedom\"]').getAttribute('aria-selected') === 'true' && document.activeElement.id === 'tab-freedom'"));
  await send("Input.dispatchKeyEvent", { type:"keyDown", key:"Home", code:"Home" });
  check("Algorithm Home key selects the first tab and panel", await evaluate("document.activeElement.id === 'tab-adapt' && document.querySelector('#tab-adapt').getAttribute('aria-selected') === 'true' && !document.querySelector('#panel-adapt').hidden"));
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

  await evaluate("document.querySelector('.hero-actions .button').focus({preventScroll:true})");
  await send("Input.dispatchKeyEvent", { type:"keyDown", key:"Enter", code:"Enter", windowsVirtualKeyCode:13, text:"\r", unmodifiedText:"\r" });
  await send("Input.dispatchKeyEvent", { type:"keyUp", key:"Enter", code:"Enter", windowsVirtualKeyCode:13 });
  await waitFor("location.hash === '#waitlist' && document.querySelector('#waitlist').getBoundingClientRect().top < innerHeight / 2", "early signup navigation");
  await delay(250);
  check("Early signup works by keyboard and scrolls to the existing form", await evaluate("location.hash === '#waitlist' && getComputedStyle(document.documentElement).scrollBehavior === 'smooth' && document.querySelector('#waitlist-form').getBoundingClientRect().top < innerHeight && document.querySelector('#waitlist-form').getBoundingClientRect().bottom > 0"));

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
    const consent = await evaluate(`(() => {
      const note = document.querySelector('.form-note'), form = document.querySelector('#waitlist-form');
      const n = note.getBoundingClientRect(), f = form.getBoundingClientRect();
      return { align:getComputedStyle(note).textAlign, offset:Math.abs(n.x + n.width / 2 - f.x - f.width / 2), width:n.width, formWidth:f.width };
    })()`);
    check(prefix + " privacy statement is centered within the signup form", consent.align === 'center' && consent.offset < 1 && consent.width <= consent.formWidth + 1, consent);
    await screenshot(prefix + "-waitlist.png");
    await evaluate("document.querySelector('#reviews').scrollIntoView({behavior:'instant',block:'center'})");
    await delay(800);
    await screenshot(prefix + "-reviews.png");
    check(prefix + " review copy has the larger readable type size", await evaluate("[...document.querySelectorAll('.review-card blockquote > p')].every(element => parseFloat(getComputedStyle(element).fontSize) >= " + (width < 768 ? 18 : 20) + ")"));
    await evaluate("document.querySelector('.faq-items details').open=true;document.querySelector('#faq').scrollIntoView({behavior:'instant',block:'center'})");
    await delay(150);
    const faq = await evaluate(`(() => {
      const details = document.querySelector('.faq-items details'), summary = getComputedStyle(details.querySelector('summary')), answer = getComputedStyle(details.querySelector('p'));
      return { questionBackground: summary.backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(details).backgroundColor : summary.backgroundColor,
        answerBackground: answer.backgroundColor, questionSize: parseFloat(summary.fontSize), answerSize: parseFloat(answer.fontSize), open: details.open };
    })()`);
    check(prefix + " FAQ separates black questions and gray expanded answers", faq.open && faq.questionBackground === 'rgb(8, 8, 12)' && faq.answerBackground === 'rgb(43, 43, 48)', faq);
    check(prefix + " FAQ uses larger readable question and answer type", faq.questionSize >= (width < 768 ? 15 : 16) && faq.answerSize >= (width < 768 ? 15 : 16), faq);
    await screenshot(prefix + "-faq.png");
    await evaluate("document.querySelector('.faq-items details').open=false");
    await evaluate("document.querySelector('.site-footer').scrollIntoView({behavior:'instant',block:'center'})");
    const mainFooter = await evaluate(`(() => {
      const footer=document.querySelector('.site-footer'), journey=footer.querySelector('p:not(.support-line)'), contact=footer.querySelector('.support-line');
      const box=element=>{const r=element.getBoundingClientRect();return {center:r.x+r.width/2,width:r.width,align:getComputedStyle(element).textAlign}};
      return {footer:box(footer),journey:box(journey),contact:box(contact)};
    })()`);
    check(prefix + " journey and contact lines share the footer center", mainFooter.journey.align === 'center' && mainFooter.contact.align === 'center' && Math.abs(mainFooter.journey.center-mainFooter.contact.center)<1 && Math.abs(mainFooter.contact.center-mainFooter.footer.center)<1, mainFooter);
    await screenshot(prefix + "-footer.png");
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
  await evaluate("document.querySelector('[data-tab=\"freedom\"]').click()");
  await delay(50);
  const reducedTabs = await evaluate(inspectTabs);
  check("Reduced motion changes tabs without a sliding animation", reducedTabs.aligned && reducedTabs.duration.split(',').every(duration => parseFloat(duration) <= .001), reducedTabs);
  await evaluate("window.LYRION_CONFIG.screenshots.welcome='assets/lyrion-icon.png'");
  await evaluate("new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='script.js?config-test';s.onload=resolve;s.onerror=reject;document.head.append(s)})");
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
  await send("Emulation.setEmulatedMedia", { features:[{name:"prefers-reduced-motion",value:"no-preference"}] });
  await send("Emulation.setDeviceMetricsOverride", { width:1440, height:900, deviceScaleFactor:1, mobile:false });
  await send("Page.navigate", { url:siteUrl + "/tester.html" });
  await waitFor("location.pathname === '/tester.html' && document.readyState === 'complete' && document.body.matches('.tester-page')", "tester guide");
  await evaluate("document.fonts.ready.then(() => true)");
  check("Tester guide has five Vietnamese steps from installation through feedback", await evaluate(`(() => {
    const steps=[...document.querySelectorAll('ol.tester-steps > li.tester-step')];
    const titles=[/TestFlight/i,/lời mời/i,/cài đặt/i,/cập nhật/i,/phản hồi/i];
    return document.documentElement.lang==='vi' && document.querySelectorAll('h1').length===1 && steps.length===5 &&
      steps.every((step,index)=>step.id==='step-'+(index+1) && titles[index].test(step.querySelector('h2').textContent)) &&
      getComputedStyle(document.body).fontFamily.includes('Be Vietnam Pro');
  })()`));
  check("Tester navigation and decorative symbols are removed", await evaluate(`
    !document.querySelector('.tester-header,.tester-roadmap,nav') &&
    !/[←-⇿✓★]/u.test(document.body.textContent) &&
    [...document.querySelectorAll('.tester-step')].every(step=>parseFloat(getComputedStyle(step).scrollMarginTop)<=40)
  `));
  check("Tester guide explains prerequisites before the ordered steps", await evaluate(`(() => {
    const prerequisites=document.querySelector('.tester-prerequisites'), steps=document.querySelector('.tester-steps');
    return prerequisites && /Apple Account|Tài khoản Apple/i.test(prerequisites.textContent) && /iPhone/.test(prerequisites.textContent) &&
      Boolean(prerequisites.compareDocumentPosition(steps)&Node.DOCUMENT_POSITION_FOLLOWING);
  })()`));
  check("Invitation guidance covers both email and public links", await evaluate(`(() => {
    const options=document.querySelector('#step-2 .invitation-options');
    return options && /email/i.test(options.textContent) && /công khai/i.test(options.textContent) && /View in TestFlight/.test(options.textContent) && /Accept/.test(document.querySelector('#step-2').textContent);
  })()`));
  check("Update guidance explains newer builds and automatic updates", await evaluate(`
    /Update/.test(document.querySelector('#step-4').textContent) && /Automatic Updates/.test(document.querySelector('#step-4').textContent)
  `));
  check("Tester guide replaces unrelated app screenshots with accessible Lyrion mockups", await evaluate(`(() => {
    const mockups=[...document.querySelectorAll('.tester-mockup')], store=document.querySelector('#step-1 .tester-shot img');
    return store?.getAttribute('src')==='assets/testflight/app-store.png' && store.alt.trim().length>20 && mockups.length>=5 &&
      mockups.every(mockup=>mockup.getAttribute('role')==='img' && (mockup.getAttribute('aria-label')||'').length>20 && /LyrionFitness/.test(mockup.textContent+' '+mockup.getAttribute('aria-label'))) &&
      !document.querySelector('img[src$="accept-invitation.png"],img[src$="apps-list.png"],img[src$="invitation-code.png"]') &&
      !/AwayFinder|TuneTrack|Foodspace/i.test(document.body.textContent);
  })()`));
  check("Current-testing cards show only LyrionFitness with no version text", await evaluate(`(() => {
    const cards=[...document.querySelectorAll('.testflight-current-apps')];
    return cards.length>0 && cards.every(card=>card.querySelectorAll('.testflight-app-row').length===1 && /LyrionFitness/.test(card.textContent) &&
      !/version|phiên bản|\\d+\\.\\d+/i.test(card.textContent) && getComputedStyle(card).backgroundColor==='rgb(255, 255, 255)');
  })()`));
  check("Instructional visuals have no black caption tabs", await evaluate(`
    !document.querySelector('.tester-tap-hint,.tester-action-label,.tester-figure figcaption,.tester-mockup figcaption')
  `));
  const mockupContrast = await evaluate(`(() => {
    const text = [...document.querySelectorAll('.testflight-current-apps p,.feedback-action p,.feedback-compose p,.mock-feedback-link,.mock-screenshot-choice span,.mock-compose-bar span')];
    return text.map(element => {
      const color = getComputedStyle(element).color;
      const channels = color.slice(color.indexOf('(') + 1, -1).split(',').slice(0,3).map(Number).map(value => {
        const channel = value / 255;
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      });
      const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
      return { text:element.textContent.trim(), color, ratio:1.05 / (luminance + .05) };
    });
  })()`);
  check("White TestFlight visuals keep titles, feedback text and controls readable", mockupContrast.length > 10 && mockupContrast.every(item => item.ratio >= 4.5), mockupContrast);
  check("Step five illustrates opening feedback and composing a submitted report", await evaluate(`(() => {
    const stages=[...document.querySelectorAll('#step-5 .feedback-stage')], action=document.querySelector('#step-5 .feedback-action'), compose=document.querySelector('#step-5 .feedback-compose');
    return stages.length===2 && stages.every(stage=>stage.querySelector('h3') && stage.querySelector('.tester-mockup')) &&
      action && /Send Beta Feedback/.test(action.textContent) && compose && /Submit/.test(compose.textContent) &&
      /Comments|Feedback|phản hồi|mô tả/i.test(compose.textContent) && /screenshot|ảnh chụp/i.test(document.querySelector('#step-5').textContent) &&
      !document.querySelector('#step-5 .tester-mockup a[href],#step-5 .tester-mockup button,#step-5 .tester-mockup input,#step-5 .tester-mockup textarea,#step-5 .tester-mockup [tabindex]');
  })()`));
  check("Troubleshooting follows feedback and covers invitation, capacity, expiration and installation", await evaluate(`(() => {
    const help=document.querySelector('.tester-troubleshooting'), feedback=document.querySelector('#step-5');
    return help && Boolean(feedback.compareDocumentPosition(help)&Node.DOCUMENT_POSITION_FOLLOWING) &&
      [/lời mời/i,/đầy|đủ người/i,/hết hạn/i,/không khả dụng|không còn|không có/i,/không cài|không thể cài/i].every(pattern=>pattern.test(help.textContent));
  })()`));
  check("Tester guide links to Apple's TestFlight and explains invitation availability", await evaluate(`
    document.querySelector('#step-1 a[href="https://apps.apple.com/app/testflight/id899247664"]') !== null &&
    document.querySelectorAll('.tester-invite-link').length === 3 &&
    [...document.querySelectorAll('.tester-invite-link')].every(link => link.getAttribute('href') === '/#waitlist') &&
    [...document.querySelectorAll('.tester-invite-note')].every(note => note.textContent.includes('chưa mở'))
  `));
  check("Tester guide anchor targets exist and external links protect the opener", await evaluate(`
    [...document.querySelectorAll('a[href^="#"]')].every(link => document.getElementById(link.getAttribute('href').slice(1))) &&
    [...document.querySelectorAll('a[target="_blank"]')].every(link => link.relList.contains('noopener')) &&
    document.querySelector('.tester-support').textContent.trim() === 'Mọi thông tin liên hệ: support@lyrionfitness.com'
  `));
  for (const [width,height,prefix] of [[1440,900,'desktop'],[768,900,'tablet'],[390,844,'mobile'],[320,844,'small-mobile']]) {
    await send("Emulation.setDeviceMetricsOverride", { width,height,deviceScaleFactor:1,mobile:width<768 });
    await send("Emulation.setTouchEmulationEnabled", { enabled:width<768 });
    await evaluate("(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=600){window.scrollTo({top:y,behavior:'instant'});await new Promise(r=>setTimeout(r,30));}window.scrollTo({top:0,behavior:'instant'});return true})()");
    await delay(500);
    const guideLayout = await evaluate(`(() => {
      const clipped = [...document.querySelectorAll('.tester-shot')].map(frame => {
        const f=frame.getBoundingClientRect(), img=frame.querySelector('img'), i=img.getBoundingClientRect();
        return { frameWidth:f.width, frameHeight:f.height, imageWidth:i.width, imageHeight:i.height, overflow:getComputedStyle(frame).overflow, loaded:img.complete && img.naturalWidth>0 };
      });
      const mockups=[...document.querySelectorAll('.tester-mockup')].map(mockup=>{
        const r=mockup.getBoundingClientRect();
        return {left:r.left,right:r.right,width:r.width,height:r.height,client:mockup.clientWidth,scroll:mockup.scrollWidth};
      });
      const icons=[...document.querySelectorAll('.lyrion-app-icon')].map(icon=>{
        const r=icon.getBoundingClientRect(),css=getComputedStyle(icon),img=icon.querySelector('img');
        const radius=parseFloat(css.borderTopLeftRadius)*(css.borderTopLeftRadius.includes('%')?r.width/100:1);
        return {width:r.width,height:r.height,background:css.backgroundColor,radius,overflow:css.overflow,src:img?.getAttribute('src'),loaded:img?.complete&&img.naturalWidth>0};
      });
      const hero=document.querySelector('.tester-hero').getBoundingClientRect();
      const interactive=[...document.querySelectorAll('a.button,.tester-troubleshooting summary')].map(element=>{
        const r=element.getBoundingClientRect();return {text:element.textContent.trim(),width:r.width,height:r.height};
      });
      return { width:innerWidth, scroll:document.documentElement.scrollWidth, shots:clipped, mockups, icons, heroTop:hero.top, interactive };
    })()`);
    check("Tester guide stays within the viewport at " + width, guideLayout.scroll <= width, {width:guideLayout.width,scroll:guideLayout.scroll});
    check("Tester screenshots load and remain cleanly clipped at " + width,
      guideLayout.shots.length === 1 && guideLayout.shots.every(shot => shot.loaded && shot.frameWidth > 100 && shot.frameHeight > 80 && shot.imageWidth >= shot.frameWidth - 1 && shot.imageHeight >= shot.frameHeight - 1 && ['hidden','clip'].includes(shot.overflow)), guideLayout.shots);
    check("Lyrion app mockups fit without internal overflow at " + width, guideLayout.mockups.length>=5 && guideLayout.mockups.every(mockup=>mockup.width>100 && mockup.height>80 && mockup.left>=0 && mockup.right<=width && mockup.scroll<=mockup.client+1), guideLayout.mockups);
    check("Lyrion icons use purple backgrounds with clipped rounded corners at " + width, guideLayout.icons.length>=5 && guideLayout.icons.every(icon=>{
      const channels=icon.background.match(/\d+/g)?.map(Number)||[];
      return icon.loaded && icon.src==='assets/lyrion-mark.png' && icon.width>=16 && Math.abs(icon.width-icon.height)<1 && icon.radius>icon.width*.15 && icon.radius<icon.width*.5 && ['hidden','clip'].includes(icon.overflow) && channels[2]>channels[0] && channels[0]>channels[1];
    }), guideLayout.icons);
    check("Tester top spacing has no empty navigation slot at " + width, guideLayout.heroTop>=0 && guideLayout.heroTop<80, {top:guideLayout.heroTop});
    check("Tester primary actions and troubleshooting touch targets remain usable at " + width, guideLayout.interactive.every(control=>control.width>=44 && control.height>=44), guideLayout.interactive);
    await screenshot(prefix + "-tester.png");
    await screenshot(prefix + "-tester-full.png", true);
    await evaluate("document.querySelector('#step-2').scrollIntoView({behavior:'instant',block:'center'})");
    await delay(80);
    await screenshot(prefix + "-tester-invitation.png");
    await evaluate("document.querySelector('#step-3').scrollIntoView({behavior:'instant',block:'center'})");
    await delay(80);
    await screenshot(prefix + "-tester-step.png");
    await evaluate("document.querySelector('#step-5').scrollIntoView({behavior:'instant',block:'start'})");
    await delay(80);
    await screenshot(prefix + "-tester-feedback.png");
    await evaluate("document.querySelector('.feedback-compose').scrollIntoView({behavior:'instant',block:'center'})");
    await delay(80);
    await screenshot(prefix + "-tester-feedback-compose.png");
    await evaluate("document.querySelector('.tester-footer').scrollIntoView({behavior:'instant',block:'center'})");
    const footer=await evaluate(`(() => {
      const footer=document.querySelector('.tester-footer'), lines=[...footer.querySelectorAll('p')];
      const center=element=>{const r=element.getBoundingClientRect();return r.x+r.width/2};
      return {center:center(footer),lines:lines.map(line=>({text:line.textContent.trim(),center:center(line),align:getComputedStyle(line).textAlign}))};
    })()`);
    check("Tester journey and contact are centered at " + width, footer.lines.length>=2 && footer.lines.every(line=>line.align==='center' && Math.abs(line.center-footer.center)<1), footer);
    await screenshot(prefix + "-tester-footer.png");
  }
  await send("Page.reload", {ignoreCache:false});
  await waitFor("document.readyState==='complete' && document.querySelector('#step-2').classList.contains('tester-will-reveal')", "fresh tester guide for keyboard access");
  await evaluate("document.querySelector('#step-2 .tester-invite-link').focus()");
  check("Keyboard access reveals the tester step immediately", await evaluate("document.activeElement.matches('#step-2 .tester-invite-link') && getComputedStyle(document.querySelector('#step-2')).opacity === '1'"));
  await evaluate("location.hash='#step-5'");
  await delay(30);
  check("Tester deep links expose the requested step immediately without a navigation bar", await evaluate("document.querySelector('#step-5').classList.contains('tester-reveal-instant') && getComputedStyle(document.querySelector('#step-5')).opacity === '1' && !document.querySelector('nav')"));
  await send("Emulation.setEmulatedMedia", { features:[{name:"prefers-reduced-motion",value:"reduce"}] });
  await delay(50);
  check("Tester guide respects a reduced motion preference change", await evaluate("[...document.querySelectorAll('.tester-step')].every(step => getComputedStyle(step).opacity === '1' && getComputedStyle(step).transform === 'none') && getComputedStyle(document.documentElement).scrollBehavior === 'auto'"));
  await evaluate("window.LYRION_CONFIG.testFlightUrl='https://testflight.apple.com/join/LyrionQA';new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='tester.js?config-test';s.onload=resolve;s.onerror=reject;document.head.append(s)})");
  check("A configured official TestFlight invitation activates every guide invitation", await evaluate("document.querySelectorAll('.tester-invite-link').length === 3 && [...document.querySelectorAll('.tester-invite-link')].every(link => link.href === 'https://testflight.apple.com/join/LyrionQA' && link.target === '_blank' && link.relList.contains('noopener'))"));
  await send("Emulation.setScriptExecutionDisabled", { value:true });
  await send("Page.reload", { ignoreCache:true });
  await waitFor("document.readyState === 'complete' && document.body.matches('.tester-page')", "tester guide without JavaScript");
  check("Tester guide remains fully visible and usable without JavaScript", await evaluate("[...document.querySelectorAll('.tester-step')].every(step => getComputedStyle(step).opacity === '1' && step.getBoundingClientRect().height > 0) && document.querySelector('.tester-invite-link').getAttribute('href') === '/#waitlist' && document.querySelector('.tester-footer a[href=\"/\"]') !== null"));
  await send("Emulation.setScriptExecutionDisabled", { value:false });
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

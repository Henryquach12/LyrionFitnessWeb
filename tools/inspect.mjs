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
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") errors.push(message.params.entry.text);
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
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: siteUrl });
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await evaluate("document.readyState === 'complete' && Boolean(window.LYRION_PREVIEWS)")) break;
    await delay(100);
  }
  await evaluate("document.fonts.ready.then(() => true)");
  for (const width of [1440,768,390,320]) {
    await send("Emulation.setDeviceMetricsOverride", {width,height:900,deviceScaleFactor:1,mobile:width<768});
    await delay(150);
    console.log("OVERFLOW",width,await evaluate("JSON.stringify([...document.querySelectorAll('body *')].map(el=>({el:el.tagName+'.'+el.className,l:el.getBoundingClientRect().left,r:el.getBoundingClientRect().right,w:el.getBoundingClientRect().width})).filter(o=>o.r>document.documentElement.clientWidth+2 || o.l < -2).slice(0,20))"));
  }
  for(const [width,height,prefix] of [[1440,900,"desktop"],[390,844,"mobile"]]) {
    await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<768});
    await evaluate("(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=600){scrollTo({top:y,behavior:'instant'});await new Promise(r=>setTimeout(r,40));}scrollTo({top:0,behavior:'instant'});return true})()");
    await delay(750);
    const shot=await send("Page.captureScreenshot",{format:"png"});
    await writeFile(path.join(artifactDir,prefix+"-initial.png"),Buffer.from(shot.data,"base64"));
    const metrics=await send("Page.getLayoutMetrics");
    const full=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:true,clip:{x:0,y:0,width:metrics.cssContentSize.width,height:metrics.cssContentSize.height,scale:1}});
    await writeFile(path.join(artifactDir,prefix+"-initial-full.png"),Buffer.from(full.data,"base64"));
  }
} finally {
  if (send && ws?.readyState === WebSocket.OPEN) {
    try { await send("Browser.close"); } catch {}
    ws.close();
  }
  browser.kill();
  server.kill();
}

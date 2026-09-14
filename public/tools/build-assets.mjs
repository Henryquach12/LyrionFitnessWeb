import { copyFile, lstat, mkdir, readdir, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publicFiles, assetTypes } from "../site-files.mjs";

const root = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const destination = path.resolve(root, "dist");
// Only replace this generated directory; never follow a symlink outside it.
if (path.dirname(destination) !== root || path.basename(destination) !== "dist") throw new Error("Invalid asset output directory.");
try {
  if ((await lstat(destination)).isSymbolicLink() || await realpath(destination) !== destination) throw new Error("Asset output must be a local directory.");
} catch (error) { if (error.code !== "ENOENT") throw error; }
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

let count = 0;
async function copy(relative) {
  const source = path.join(root, relative);
  if ((await lstat(source)).isSymbolicLink()) throw new Error("Site assets must not be symbolic links.");
  const target = path.join(destination, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  count++;
}
for (const filename of publicFiles) await copy(filename);

async function copyAssets(relative) {
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) await copyAssets(child);
    else if (entry.isFile() && assetTypes.has(path.extname(entry.name).toLowerCase())) await copy(child);
  }
}
await copyAssets("assets");
console.log(`Prepared ${count} public assets in dist/.`);

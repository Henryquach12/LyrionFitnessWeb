// The same explicit asset allowlist is used by Node and the Cloudflare build.
export const publicFiles = new Set([
  "index.html", "styles.css", "glass.css", "intro.css", "intro.js", "script.js", "motion.js",
  "reviews.js", "waitlist.js", "previews.js", "config.js", "tester.html", "tester.css", "tester.js",
  "robots.txt", "sitemap.xml", "google1195f44339be5198.html"
]);
export const assetTypes = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".woff2", ".ttf", ".svg"]);

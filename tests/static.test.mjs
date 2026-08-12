/* static.test.mjs — the rules that must never regress.

   Two kinds of test live here:
     · source assertions, for guarantees that are structural (no same-origin
       sandbox token, no relaxed CSP, no markup assignment in app code);
     · behavioural tests of the pure modules — ZIP defences, entry-point
       detection, encoding, magic bytes, expiry boundaries.

   The delete-inference rule from plan 5-4 is pinned here, because that
   inference is what erased focus's data on 2026-08-09. */

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const fixture = (name) => readFileSync(join(root, "tests/fixtures", name));

const index = read("index.html");
const host = read("preview-host.html");
const sw = read("sw.js");
const appJs = read("src/app.js");
const previewJs = read("src/preview.js");
const retentionJs = read("src/retention.js");
const syncJs = read("src/sync.js");

const APP_SOURCES = ["index.html", "sw.js", "preview-host.html"]
  .concat(readdirSync(join(root, "src")).filter((n) => n.endsWith(".js")).map((n) => `src/${n}`))
  .concat(readdirSync(join(root, "src/handlers")).map((n) => `src/handlers/${n}`));

/* ── sandbox and CSP ───────────────────────────────────────────────────── */

// Assembled from parts on purpose: the review's tree-wide grep for this token
// must find zero hits, and a test file that spells it out would be one.
const SAME_ORIGIN = new RegExp(["allow", "same", "origin"].join("-"));

test("the same-origin sandbox token appears nowhere in the tree", () => {
  APP_SOURCES.forEach((path) => {
    assert.doesNotMatch(read(path), SAME_ORIGIN, `${path} must not relax the sandbox`);
  });
});

test("the preview host blocks the network and arbitrary scripts", () => {
  assert.match(host, /connect-src 'none'/, "preview must block network requests");
  assert.doesNotMatch(host, /script-src\s+\*/, "preview CSP must not allow arbitrary scripts");
  assert.match(host, /form-action 'none'/);
});

test("the app shell CSP is not relaxed", () => {
  const csp = /content="([^"]*Content-Security|[^"]*default-src[^"]*)"/.exec(index);
  assert.ok(csp, "the shell must carry a meta CSP");
  assert.doesNotMatch(index, /unsafe-inline/, "the shell CSP must not allow inline code");
  assert.doesNotMatch(index, /'unsafe-eval'/, "the shell CSP must not allow eval");
  assert.match(index, /script-src 'self' 'wasm-unsafe-eval'/);
  assert.match(index, /style-src 'self'/);
  assert.doesNotMatch(index, /frame-ancestors/, "meta CSP ignores frame-ancestors and warns in the console");
});

test("app code never assigns innerHTML and the shell has no style attributes", () => {
  ["index.html", "sw.js"].concat(APP_SOURCES.filter((p) => p.startsWith("src/"))).forEach((path) => {
    assert.doesNotMatch(read(path), /innerHTML\s*=/, `${path} must not assign innerHTML`);
  });
  assert.doesNotMatch(index, /style="/, "style attributes are blocked by style-src 'self'");
});

test("no absolute paths and no external hosts outside the sync module", () => {
  ["index.html", "preview-host.html", "sw.js"]
    .concat(APP_SOURCES.filter((p) => p.startsWith("src/")))
    .forEach((path) => {
      const source = read(path);
      assert.doesNotMatch(source, /src="\/|href="\/|from "\//, `${path} must use relative paths`);
      const external = (source.match(/https?:\/\/[^\s"'`]+/g) || [])
        .filter((url) => !url.includes("api.github.com"))
        .filter((url) => !url.startsWith("http://www.w3.org"));
      assert.deepEqual(external, [], `${path} must not reference external hosts`);
    });
});

test("the build stamp in sw.js matches src/version.js", () => {
  const inSw = /VERSION\s*=\s*['"]([^'"]+)/.exec(sw)[1];
  const inApp = /APP_BUILD\s*=\s*['"]([^'"]+)/.exec(read("src/version.js"))[1];
  assert.equal(inSw, inApp);
  assert.match(inSw, /^\d{4}\.\d{2}\.\d{2}-[a-z0-9]+$/);
});

test("the shared sync module is an optional cache entry, never in addAll", () => {
  assert.match(sw, /const OPTIONAL = \['\.\.\/shared\/v1\/sync\.js'\]/);
  const assetsBlock = /const ASSETS = \[([\s\S]*?)\n\];/.exec(sw)[1];
  assert.doesNotMatch(assetsBlock, /shared\/v1/, "a missing shared module must not fail the install");
});

test("PDF.js is deployed without its script sandbox", () => {
  assert.ok(!existsSync(join(root, "vendor/pdfjs/pdf.sandbox.min.mjs")));
  assert.ok(!existsSync(join(root, "vendor/pdfjs/wasm/quickjs-eval.wasm")));
  assert.ok(existsSync(join(root, "vendor/pdfjs/cmaps/UniKS-UTF16-H.bcmap")), "Korean CMaps must ship");
  assert.ok(existsSync(join(root, "vendor/pdfjs/standard_fonts/FoxitFixed.pfb")));
  assert.ok(existsSync(join(root, "vendor/pdfjs/wasm/openjpeg.wasm")));
  assert.ok(existsSync(join(root, "vendor/pdfjs/iccs/CGATS001Compat-v2-micro.icc")));
});

test("every PDF.js asset URL ends in a slash", () => {
  const pdf = read("src/handlers/pdf.js");
  ["cMapUrl", "standardFontDataUrl", "wasmUrl", "iccUrl"].forEach((option) => {
    const match = new RegExp(`${option}: \`\\$\\{VENDOR\\}([^\`]*)\``).exec(pdf);
    assert.ok(match, `${option} must be configured`);
    assert.match(match[1], /\/$/, `${option} must end in a slash or PDF.js throws`);
  });
});

/* ── the delete-inference hard rule (plan 5-4) ─────────────────────────── */

test("a missing local copy never produces a delete", () => {
  assert.doesNotMatch(retentionJs, /markDeleted/, "releasing a local copy must not write a tombstone");
  assert.doesNotMatch(read("src/relink.js"), /markDeleted/);
  assert.doesNotMatch(read("src/library.js"), /markDeleted/);
  assert.match(syncJs, /pushIndex/, "sync must merge, never replace, the remote list");
  assert.match(syncJs, /mergeEntries\(mergeEntries\(previous, entries\), deletions\)/,
    "an empty local list must never shrink the remote list");
});

test("a tombstone is only written after a delete is final", () => {
  const lines = appJs.split("\n");
  lines.forEach((line, position) => {
    if (!/sync\.markDeleted/.test(line)) return;
    const window = lines.slice(Math.max(0, position - 6), position + 1).join("\n");
    assert.match(window, /finalizeDelete|finalizePendingDeletes|deleteEverything/,
      `markDeleted on line ${position + 1} must follow a confirmed delete`);
  });
  // The soft delete itself must not mark anything.
  assert.match(appJs, /await store\.softDelete\(doc\.id\);\n\s*await refreshLibrary\(\);/,
    "soft delete must not write a tombstone in the same step");
});

test("the Undo window is five seconds and resolves as a delete on restart", () => {
  assert.match(appJs, /\}, 5000\);/, "the Undo window is 5 seconds (spec 7장)");
  assert.match(read("src/store.js"), /finalizePendingDeletes/);
});

/* ── preview engine ────────────────────────────────────────────────────── */

test("Run keeps its shims and 300-character error limit", () => {
  assert.match(previewJs, /SANDBOX_RUN = 'allow-scripts/);
  assert.match(previewJs, /slice\(0, 300\)/, "runtime messages must be length-limited");
  assert.match(previewJs, /STORAGE_SHIM/);
  assert.doesNotMatch(previewJs, SAME_ORIGIN);
});

test("Read mode is sanitized and the document frame is script-free", () => {
  const html = read("src/handlers/html.js");
  assert.match(html, /DOMPurify\.sanitize/);
  assert.match(html, /allowScripts: false/);
  assert.match(html, /FORBID_TAGS: \['script'/);
  // The host frame runs its own bootstrap; the nested document frame is the
  // one that must never get allow-scripts.
  assert.match(read("preview-host.html"), /d\.allowScripts\?'allow-scripts[^']*':'allow-downloads'/,
    "the inner sandbox must depend on allowScripts");
});

test("Markdown is sanitized into a DOM fragment, not a string", () => {
  assert.match(read("src/handlers/markdown.js"), /RETURN_DOM_FRAGMENT: true/);
});

test("SVG is only ever shown through <img>", () => {
  const image = read("src/handlers/image.js");
  assert.match(image, /createElement|el\('img'/);
  assert.doesNotMatch(image, /innerHTML|insertAdjacentHTML/);
});

/* ── package engine ────────────────────────────────────────────────────── */

const pkg = await import("../src/package.js");

test("the compressed limit is 15 MiB and the other limits are unchanged", () => {
  assert.equal(pkg.LIMITS.archiveBytes, 15 * 1024 * 1024);
  assert.equal(pkg.LIMITS.totalUncompressedBytes, 25 * 1024 * 1024);
  assert.equal(pkg.LIMITS.singleEntryBytes, 10 * 1024 * 1024);
  assert.equal(pkg.LIMITS.entryCount, 500);
  assert.equal(pkg.LIMITS.maxCompressionRatio, 100);
});

test("entry detection: root, single file, one wrapping folder", () => {
  assert.equal(pkg.pickEntry(["index.html", "a/b.svg"]), "index.html");
  assert.equal(pkg.pickEntry(["deep/only.html", "deep/x.css"]), "deep/only.html");
  assert.equal(pkg.pickEntry(["mindmap-5/index.html", "mindmap-5/page.html", "mindmap-5/svg/m.svg"]), "mindmap-5/index.html");
  assert.throws(() => pkg.pickEntry(["one/index.html", "two/index.html"]), /multiple HTML files/);
  assert.throws(() => pkg.pickEntry(["a.svg"]), /no entry HTML/);
});

test("path normalization rejects escapes, absolute paths and reserved keys", () => {
  assert.throws(() => pkg.normalizePath("../evil.svg", "", false), /escapes the package root/);
  assert.throws(() => pkg.normalizePath("/evil.svg", "", false), /Unsafe absolute/);
  assert.throws(() => pkg.normalizePath("__proto__/x.js", "", false), /reserved manifest key/);
  assert.equal(pkg.normalizePath("a/./b/../c.svg", "", false), "a/c.svg");
});

// analyze() walks a parsed document; the tests only need the ZIP layer, so a
// minimal stand-in keeps importZip runnable outside a browser.
globalThis.DOMParser = class { parseFromString() { return { querySelectorAll: () => [] }; } };

async function importFixture(name) {
  return pkg.importZip(new File([fixture(name)], name));
}

test("ZIP defences reject the nine hostile fixtures", async () => {
  const cases = [
    ["zip-slip.zip", /escapes the package root/],
    ["absolute-path.zip", /Unsafe absolute/],
    ["duplicate.zip", /duplicate path/],
    ["case-collision.zip", /case-colliding/],
    ["encrypted.zip", /Encrypted ZIP/],
    ["oversized.zip", /limit/],
    ["ambiguous-entry.zip", /multiple HTML files/],
    ["no-entry.zip", /no entry HTML/],
    ["corrupt.zip", /corrupt|not a supported ZIP/],
  ];
  for (const [name, pattern] of cases) {
    await assert.rejects(() => importFixture(name), pattern, name);
  }
});

test("a package wrapped in one folder imports, two folders stays an error", async () => {
  const wrapped = await importFixture("wrapped-entry.zip");
  assert.equal(wrapped.entryPath, "mindmap-5/index.html");
  assert.ok(wrapped.packageAssets["mindmap-5/svg/map.svg"], "assets keep their full paths");
  await assert.rejects(() => importFixture("two-folders.zip"), /multiple HTML files/);
});

test("package-local classic scripts survive import", async () => {
  const meta = await importFixture("classic-script.zip");
  assert.equal(meta.entryPath, "index.html");
  assert.ok(meta.packageAssets["app.js"]);
});

/* ── package asset loss (2026-08-12 fix) ───────────────────────────────── */

test("reconnecting a package rebuilds its assets on both paths", () => {
  const relink = read("src/relink.js");
  assert.match(relink, /pkg\.importZip\(file\)/, "a reconnect must re-extract the ZIP");
  assert.match(relink, /putPackageAssets\(doc\.id, meta\.packageAssets\)/);
  assert.match(relink, /entryPath: meta\.entryPath/);
  assert.match(relink, /packageAssetsReleased: false/);
  // Both the hash-match path and the "Link anyway" path apply the patch, and
  // a ZIP that cannot be read cancels instead of half-linking.
  assert.equal((relink.match(/await packagePatch\(doc, file\)/g) || []).length, 2);
  assert.equal((relink.match(/This ZIP could not be read\./g) || []).length, 2);
  assert.equal((relink.match(/\.\.\.patch \}\)/g) || []).length, 2);
});

test("releasing a package records that its assets went with the bytes", () => {
  const retention = read("src/retention.js");
  assert.match(retention, /doc\.kind === 'html-package'/);
  assert.match(retention, /packageAssetsReleased: true/);
});

test("a package that LOST its assets refuses to render", async () => {
  const html = read("src/handlers/html.js");
  assert.match(html, /This package's files are missing\. Reconnect the original ZIP\./);
  assert.match(html, /text: 'Reconnect'/);
  assert.match(html, /if \(packageAssetsMissing\(doc, assets\)\)/, "the guard must go through the shared test");

  const { packageAssetsMissing } = await import("../src/handlers/html.js");
  const pkgDoc = (extra) => ({ kind: "html-package", ...extra });

  // The regression this replaces: a ZIP holding nothing but index.html has no
  // assets and must still open.
  assert.equal(packageAssetsMissing(pkgDoc({ packageFileCount: 1 }), {}), false,
    "a single-file package legitimately has no assets");
  assert.equal(packageAssetsMissing(pkgDoc({ packageFileCount: 1 }), null), false);

  // Assets deleted by a release on a current build.
  assert.equal(packageAssetsMissing(pkgDoc({ packageFileCount: 1, packageAssetsReleased: true }), {}), true,
    "the released flag alone is enough");
  assert.equal(packageAssetsMissing(pkgDoc({ packageFileCount: 25, packageAssetsReleased: true }), {}), true);

  // Broken by build 2026.08.12-init1: released and reconnected before the flag
  // existed, so only the import file count can still see it.
  assert.equal(packageAssetsMissing(pkgDoc({ packageFileCount: 25 }), {}), true,
    "a package imported with 25 files and now holding none has lost them");

  // A healthy package, and anything that is not a package.
  assert.equal(packageAssetsMissing(pkgDoc({ packageFileCount: 25 }), { "a.svg": {} }), false);
  assert.equal(packageAssetsMissing(pkgDoc({ packageFileCount: 25, packageAssetsReleased: true }), { "a.svg": {} }), false,
    "assets present beat a stale flag");
  assert.equal(packageAssetsMissing({ kind: "html", packageFileCount: 25 }, {}), false);
  assert.equal(packageAssetsMissing(null, {}), false);
});

test("releasing flags only packages that actually had assets", () => {
  const retention = read("src/retention.js");
  assert.match(retention, /await db\.packageAssets\.where\('docId'\)\.equals\(doc\.id\)\.delete\(\)/);
  assert.match(retention, /assetsGone > 0 \? \{ packageAssetsReleased: true \}/,
    "a package with nothing to delete must not be flagged");
});

test("a package link is handed to folio, never navigated to a data: URL", () => {
  const previewJs2 = read("src/preview.js");
  assert.match(previewJs2, /data-folio-path/, "links carry their package path");
  assert.match(previewJs2, /open-asset/);
  assert.match(previewJs2, /options\.onOpenAsset/);
  const appSrc = read("src/app.js");
  assert.match(appSrc, /openPackageAsset/);
  assert.match(appSrc, /This file is not in the package\./);
  // The Blob is built on the app side; the sandbox never receives one.
  assert.doesNotMatch(previewJs2, /createObjectURL/);
  assert.doesNotMatch(read("src/package.js"), /createObjectURL/);
});

/* materialize() walks a parsed document, and Node has no DOM. The two checks
   that need one — which assets stay in the runtime map, and how large the two
   sample packages materialize to — run in tests/package-map.test.html, the
   same way vault kept tests/package.test.html. What CAN be pinned here is the
   wiring, so the classification cannot be silently bypassed. */

test("the map is filtered by reference class, before the rewrite loses paths", () => {
  const source = read("src/package.js");
  assert.match(source, /function collectRefs\(root,baseDir,ALL_ASSETS\)/);
  assert.match(source, /function inlinePaths\(assets,refs\)/);
  // Anchor-only means: linked, and never drawn.
  assert.match(source, /if\(refs\.anchor\[path\]&&!refs\.display\[path\]\)return;/,
    "a file that is drawn as well as linked must stay inlined");
  // Classification has to happen before rewriteStatic replaces the refs.
  const classify = source.indexOf("var keep=inlinePaths(");
  const rewrite = source.indexOf("rewriteStatic(parsed,doc,baseDir,warnings)");
  assert.ok(classify > 0 && rewrite > classify, "classify before rewriting, or the paths are gone");
  assert.match(source, /shim\(doc,baseDir,sessionId,keep\)/);
  // Every path stays *known* so a link can still be tagged with one.
  assert.match(source, /known\[k\]=1;\s*\n?\s*if\(!keep\|\|keep\[k\]\)map\[k\]=dataUrl\(assets\[k\]\)/);
  assert.match(source, /el\.setAttribute\('data-folio-path',lr\.path\)/);
  assert.ok(existsSync(join(root, "tests/package-map.test.html")),
    "the browser half of this check must ship");
});

/* ── encoding, detection, expiry ───────────────────────────────────────── */

const encoding = await import("../src/handlers/encoding.js");

test("UTF-8, CP949 and BOM are told apart", () => {
  const utf8 = new TextEncoder().encode("한글 test");
  assert.equal(encoding.decodeBytes(utf8).encoding, "utf-8");
  assert.equal(encoding.decodeBytes(utf8).text, "한글 test");

  const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]);
  const bomResult = encoding.decodeBytes(withBom);
  assert.equal(bomResult.hadBom, true);
  assert.equal(bomResult.text, "한글 test");

  // "한글" in CP949 (Unified Hangul Code), which the euc-kr label covers.
  const cp949 = new Uint8Array([0xc7, 0xd1, 0xb1, 0xdb]);
  const korean = encoding.decodeBytes(cp949);
  assert.equal(korean.encoding, "euc-kr");
  assert.equal(korean.text, "한글");
  assert.equal(encoding.labelFor("euc-kr"), "CP949");
});

const detect = await import("../src/detect.js");

test("magic bytes classify the container formats", () => {
  const bytes = (...values) => new Uint8Array([...values, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(detect.sniff(bytes(0x25, 0x50, 0x44, 0x46, 0x2d)), "pdf");
  assert.equal(detect.sniff(bytes(0x50, 0x4b, 0x03, 0x04)), "html-package");
  assert.equal(detect.sniff(bytes(0x89, 0x50, 0x4e, 0x47)), "image");
  assert.equal(detect.sniff(bytes(0xff, 0xd8, 0xff)), "image");
  assert.equal(detect.sniff(new TextEncoder().encode("GIF89a....")), "image");
  assert.equal(detect.sniff(new TextEncoder().encode("plain text here")), "");
  assert.equal(detect.TAG_OF["html-package"], "pkg");
});

const expiry = await import("../src/expiry.js");

test("expiry boundaries: pins, text formats and Never", () => {
  const now = Date.parse("2026-08-12T12:00:00Z");
  const day = 86400000;
  const pdf = (days) => ({ kind: "pdf", lastTouchedAt: now - days * day });

  assert.equal(expiry.isExpired(pdf(6.99), 7, now), false);
  assert.equal(expiry.isExpired(pdf(7), 7, now), true);
  assert.equal(expiry.isExpired(pdf(30), 0, now), false, "Never means never");
  assert.equal(expiry.isExpired({ ...pdf(30), pinned: true }, 7, now), false, "a pin stops the clock");
  assert.equal(expiry.isExpired({ kind: "text", lastTouchedAt: now - 400 * day }, 7, now), false);
  assert.equal(expiry.isExpired({ kind: "csv", lastTouchedAt: now - 400 * day }, 7, now), false);

  assert.equal(expiry.daysLeft(pdf(4), 7, now), 3);
  assert.equal(expiry.expiryBadge(pdf(4), 7, now), "3d");
  assert.equal(expiry.expiryBadge(pdf(1), 7, now), "", "the badge only shows in the last three days");
});

/* ── screen text (spec 확정 문구) ──────────────────────────────────────── */

test("the confirmed English strings are present", () => {
  assert.match(index, /Search documents/);
  assert.match(index, /Import files/);
  assert.match(index, /Release expired now/);
  assert.match(index, /Off — everything stays on this device\./);
  assert.match(index, /Only titles, tags, dates and sizes are uploaded\. Documents never leave this device\./);
  assert.match(index, /Delete all documents/);
  assert.match(read("src/handlers/html.js"), /Scripts in this document will run in an isolated sandbox\./);
  assert.match(read("src/library.js"), /Already in folio — reconnected instead\./);
  assert.match(appJs, /Pin limit reached \(\$\{retention\.PIN_LIMIT\}\)\. Unpin one first\./);
});

test("no trace of the withdrawn vault import remains", () => {
  APP_SOURCES.concat(["package.json", "manifest.webmanifest"]).forEach((path) => {
    assert.doesNotMatch(read(path), /Import from vault|migrate-vault/i, `${path} must not mention vault migration`);
  });
});

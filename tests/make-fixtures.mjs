/* make-fixtures.mjs — synthetic ZIPs for the package security tests.
   Carried over from vault, plus a wrapper-folder fixture for folio (0-H). */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
await mkdir(root, { recursive: true });

const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(data) { let c = 0xffffffff; for (const byte of data) c = table[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; }

function zip(entries) {
  const local = [], central = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name); const data = Buffer.from(entry.data || ""); const flags = entry.flags || 0;
    const crc = crc32(data); const declared = entry.declaredSize ?? data.length;
    const header = Buffer.concat([u32(0x04034b50), u16(20), u16(flags), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(declared), u16(name.length), u16(0), name, data]);
    local.push(header);
    central.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(flags), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(declared), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    offset += header.length;
  }
  const directory = Buffer.concat(central);
  return Buffer.concat([...local, directory, u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(directory.length), u32(offset), u16(0)]);
}

const index = '<!doctype html><html><head><title>Fixture</title></head><body><a href="#target">Jump</a><section id="target">Target</section></body></html>';

await writeFile(join(root, "zip-slip.zip"), zip([{ name: "index.html", data: index }, { name: "../evil.svg", data: "<svg/>" }]));
await writeFile(join(root, "absolute-path.zip"), zip([{ name: "index.html", data: index }, { name: "/evil.svg", data: "<svg/>" }]));
await writeFile(join(root, "duplicate.zip"), zip([{ name: "index.html", data: index }, { name: "same.svg", data: "a" }, { name: "same.svg", data: "b" }]));
await writeFile(join(root, "case-collision.zip"), zip([{ name: "index.html", data: index }, { name: "A.svg", data: "a" }, { name: "a.svg", data: "b" }]));
await writeFile(join(root, "encrypted.zip"), zip([{ name: "index.html", data: index, flags: 1 }]));
await writeFile(join(root, "oversized.zip"), zip([{ name: "index.html", data: index }, { name: "huge.bin", data: "x", declaredSize: 11 * 1024 * 1024 }]));
await writeFile(join(root, "ambiguous-entry.zip"), zip([{ name: "a.html", data: index }, { name: "b.html", data: index }]));
await writeFile(join(root, "no-entry.zip"), zip([{ name: "asset.svg", data: "<svg/>" }]));
await writeFile(join(root, "corrupt.zip"), Buffer.from("PK\x03\x04corrupt"));
await writeFile(join(root, "classic-script.zip"), zip([{ name: "index.html", data: '<!doctype html><script src="app.js"></script><div id="result"></div>' }, { name: "app.js", data: 'document.getElementById("result").textContent="classic script ran";' }]));
// folio (0-H): the entry HTML lives one folder deep, like macOS "Compress".
await writeFile(join(root, "wrapped-entry.zip"), zip([
  { name: "mindmap-5/index.html", data: index },
  { name: "mindmap-5/page.html", data: index },
  { name: "mindmap-5/svg/map.svg", data: "<svg/>" },
]));
// Two top-level folders stay ambiguous — there is no single entry to pick.
await writeFile(join(root, "two-folders.zip"), zip([
  { name: "one/index.html", data: index },
  { name: "two/index.html", data: index },
]));

// Browser QA fixtures are synthetic and intentionally distinct from the
// unavailable real WebApp/sample ZIPs.
await writeFile(join(root, "long-reading.txt"), Array.from({ length: 500 }, (_, i) => `Line ${i + 1}: folio reading-position regression fixture 한국어`).join("\n"));
await writeFile(join(root, "long-reading.md"), Array.from({ length: 240 }, (_, i) => `## Section ${i + 1}\n\nMarkdown reading position paragraph ${i + 1}. 한국어 본문입니다.`).join("\n\n"));
await writeFile(join(root, "resource-read.md"), `# Markdown Resource Test

![relative](relative.png)

<img src="https://example.invalid/remote.png" srcset="https://example.invalid/remote-2x.png 2x" alt="remote">
<picture><source srcset="https://example.invalid/picture.png"><img src="relative-picture.png" alt="picture"></picture>
<video poster="https://example.invalid/poster.png" src="relative-video.mp4"></video>`);
await writeFile(join(root, "large-table.csv"), [
  Array.from({ length: 16 }, (_, i) => `Column ${i + 1}`).join(","),
  ...Array.from({ length: 2000 }, (_, row) => Array.from({ length: 16 }, (_, col) => `R${row + 1}C${col + 1}`).join(",")),
].join("\n"));
await writeFile(join(root, "resource-read.html"), `<!doctype html><html><head><title>Resource Read Test</title><link rel="stylesheet" href="https://example.invalid/x.css"></head><body>
<h1>Resource Read Test</h1><div id="script-state">not run</div>
<img src="relative-image.png" srcset="https://example.invalid/a.png 2x" alt="relative">
<picture><source srcset="https://example.invalid/b.png"><img src="https://example.invalid/c.png" alt="remote"></picture>
<video poster="https://example.invalid/poster.png" src="relative-video.mp4"></video>
<script>document.getElementById('script-state').textContent='ran';</script></body></html>`);

const restoredBytes = Buffer.from("Restored text fixture 한국어");
const restoreEnvelope = {
  format: "folio-backup", schemaVersion: 1, appVersion: "test", exportedAt: new Date(0).toISOString(),
  documents: [{
    doc: { id: "restore-doc-1", kind: "text", fileName: "restored.txt", title: "Restored fixture", size: restoredBytes.length, fileHash: "restore-hash-1", tags: [], addedAt: 1, updatedAt: 1, lastTouchedAt: 1, pinned: false },
    text: restoredBytes.toString(), file: { bytes: restoredBytes.length, data: restoredBytes.toString("base64") },
  }],
  readingStates: [{ docId: "restore-doc-1", scrollY: 12, scrollRatio: 0.25 }], annotations: [], bookmarks: [],
  settings: { fs: 6, theme: "dark", retentionDays: 14, sort: "title", stateFilter: "all", typeFilter: ["text"], releaseConfirmed: true, viewerHintSeen: true, syncToken: "must-not-restore", lastCleanupAt: "must-not-restore" },
};
await writeFile(join(root, "restore-valid.json"), JSON.stringify(restoreEnvelope));
await writeFile(join(root, "restore-corrupt-base64.json"), JSON.stringify({ ...restoreEnvelope, documents: [{ ...restoreEnvelope.documents[0], file: { bytes: restoredBytes.length, data: "%%%broken%%%" } }] }));
await writeFile(join(root, "restore-future.json"), JSON.stringify({ ...restoreEnvelope, schemaVersion: 999 }));
await writeFile(join(root, "restore-invalid-reference.json"), JSON.stringify({ ...restoreEnvelope, readingStates: [{ docId: "missing-doc", scrollY: 10 }] }));
await writeFile(join(root, "malformed-package-backup.json"), JSON.stringify({
  ...restoreEnvelope,
  documents: [{
    doc: { id: "malformed-package", kind: "html-package", title: "Malformed package", fileName: "malformed.zip", fileHash: "malformed-package-hash", packageFileCount: 2 },
    file: { bytes: 1, data: "QQ==" }, entryContent: "<!doctype html><title>Malformed</title>",
    packageAssets: { "scripts/App.js": { data: "QQ==" } },
  }],
  readingStates: [], annotations: [], bookmarks: [], settings: {},
}));
await writeFile(join(root, "transient-package-backup.json"), JSON.stringify({
  ...restoreEnvelope,
  documents: [{
    doc: { id: "transient-package", kind: "html-package", title: "Transient package", fileName: "transient.zip", fileHash: "transient-package-hash", packageFileCount: 2, hasScripts: false, pinned: false },
    file: { bytes: 1, data: "QQ==" },
    entryContent: '<!doctype html><title>Transient package</title><a href="notes.txt">Open note</a>',
    packageAssets: { "notes.txt": { mime: "text/plain", encoding: "base64", data: "VHJhbnNpZW50IHBhY2thZ2Ugbm90ZQ==", bytes: 22 } },
  }],
  readingStates: [], annotations: [], bookmarks: [], settings: {},
}));
await writeFile(join(root, "restore-needs-image.json"), JSON.stringify({
  ...restoreEnvelope,
  documents: [{ doc: { id: "needs-image-1", kind: "image", fileName: "icon-512.png", title: "Needs image", size: 3711, fileHash: "82c1cca954069c7b4dff6e1b3cf12b70c8c9cb3435364ebe20298d613be8ff8f", tags: [], addedAt: 1, updatedAt: 1, lastTouchedAt: 1, pinned: false } }],
  readingStates: [], settings: { fs: 12, theme: "system", retentionDays: 7, sort: "recent", stateFilter: "all", typeFilter: [] },
}));

function simplePdf() {
  const stream = (label) => {
    const body = `BT /F1 24 Tf 72 720 Td (${label}) Tj ET\n`;
    return `<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}endstream`;
  };
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R >>",
    stream("Page 1"),
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 6 0 R >>",
    stream("Page 2"),
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 8 0 R >>",
    stream("Page 3"),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let text = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(text)); text += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(text);
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { text += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return text;
}
await writeFile(join(root, "three-pages.pdf"), simplePdf());

console.log(`Created synthetic fixtures in ${root}`);

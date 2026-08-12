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

console.log(`Created synthetic fixtures in ${root}`);

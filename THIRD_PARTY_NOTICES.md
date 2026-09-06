# Third-party notices

folio bundles the following components. Full licence texts are in `licenses/`.

| Component | Version | Licence | Licence file |
|---|---|---|---|
| PDF.js (`pdfjs-dist`) | 6.2.108 | Apache-2.0 | `licenses/pdfjs-Apache-2.0.txt` |
| marked | 18.0.9 | MIT | `licenses/marked-MIT.txt` |
| DOMPurify | 3.4.13 | MPL-2.0 OR Apache-2.0 | `licenses/dompurify-MPL-2.0-or-Apache-2.0.txt` |
| Papa Parse | 5.5.4 | MIT | `licenses/papaparse-MIT.txt` |
| Dexie | vault copy | Apache-2.0 | `licenses/dexie-Apache-2.0.txt` |
| highlight.js | vault copy | BSD-3-Clause | `licenses/highlightjs-BSD-3-Clause.txt` |
| Lexend | grove copy | SIL Open Font License 1.1 | `licenses/Lexend-OFL.txt` |

The PDF.js distribution additionally carries licences for its bundled WebAssembly
decoders in `vendor/pdfjs/wasm/` (JBIG2, OpenJPEG, QCMS) and for the colour
profile in `vendor/pdfjs/iccs/`.

## What was excluded from the PDF.js distribution

`*.map`, `pdf.sandbox.*` and `quickjs-eval.*` are not deployed, so a PDF's own
embedded scripts have no execution path.

## Carried over from other apps in this account

The HTML run engine, the ZIP package handling and the metadata sync module come
from `jennie-verse/vault` (build `2026.08.10-compat3`). The retention rules come
from `tide`. `../shared/v1/sync.js` is a fixed shared contract and is not
modified here.

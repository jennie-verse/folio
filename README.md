# folio

A personal document library for iPhone and iPad. Text, Markdown, HTML, HTML
packages, PDF, CSV and images live in one place, open where you left off, and
work offline. HTML documents can be run in an isolated sandbox.

Static site — no build step, no server, no login. Deployed on GitHub Pages and
installed through Safari's *Add to Home Screen*.

When Journal is enabled, Folio now records each visible reading session with
its start/end time and active minutes. The session ledger is included in Folio
backup/restore and retained for 90 days.

Korean documentation is in [`docs/`](docs/):

| Document | Contents |
|---|---|
| [README-KO.md](docs/README-KO.md) | 무엇을 하는 앱인지, 폴더 구조 |
| [USER-GUIDE-KO.md](docs/USER-GUIDE-KO.md) | 화면별 사용법 |
| [GITHUB-PAGES-KO.md](docs/GITHUB-PAGES-KO.md) | 배포와 홈 화면 추가 |
| [BACKUP-RESTORE-KO.md](docs/BACKUP-RESTORE-KO.md) | 백업·복원 |
| [TROUBLESHOOTING-KO.md](docs/TROUBLESHOOTING-KO.md) | 문제 해결과 캐시 |
| [TEST-REPORT.md](docs/TEST-REPORT.md) | 자체 검토 결과 |

## Security

- The app shell runs under a `<meta>` CSP with no `'unsafe-inline'` and no
  `'unsafe-eval'`. `'wasm-unsafe-eval'` is present only for PDF.js image
  decoders.
- Imported documents render inside `preview-host.html`, which has its own
  stricter policy (`connect-src 'none'`, `form-action 'none'`), and then in a
  second nested iframe. No frame is ever granted the same-origin sandbox token.
- Sync is off by default. With it off, folio contacts nothing. With it on, only
  titles, tags, dates and sizes are uploaded — document bodies never leave the
  device.
- A delete is recorded only when the user deletes something. "Not present on
  this device" is never treated as evidence of a delete.

## Tests

```bash
npm test          # ZIP defences, entry detection, encoding, expiry, source rules
npm run test:syntax
```

## Local preview

```bash
cd WebApp/Published/folio
python3 -m http.server 4173
```

Then open `http://127.0.0.1:4173/`. Every asset reference remains relative, so
the same files also work under the GitHub Pages `/folio/` subpath.

## Third-party code

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `licenses/`.

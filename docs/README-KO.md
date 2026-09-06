# folio — 개요

iPhone·iPad에서 형식에 상관없이 문서를 한곳에 모아 두고, 빠르게 찾아 읽고,
읽던 위치에서 이어 보고, 필요하면 HTML 문서를 안전하게 실행해 보는 개인용
문서함입니다.

로그인 없음, 서버 없음, 외부 접속 없음. Safari에서 열고 **공유(Share) → 홈
화면에 추가(Add to Home Screen)** 로 앱처럼 씁니다.

---

## 다루는 형식

| 계열 | 확장자 | 뷰어 | 본문 검색 |
|---|---|---|---|
| 일반 텍스트 | `.txt` `.log` | 텍스트 뷰어(인코딩 선택) | O |
| Markdown | `.md` `.markdown` | 렌더링 ↔ 원문(Source) | O |
| HTML | `.html` `.htm` | **Read ↔ Run ↔ Source** | O |
| HTML 패키지 | `.zip` | Run 전용 | O |
| PDF | `.pdf` | PDF.js | O (텍스트 레이어가 있는 문서) |
| CSV / TSV | `.csv` `.tsv` | 표 뷰어(읽기 전용) | O |
| 이미지 | `.jpg` `.png` `.gif` `.webp` `.svg` `.heic` 등 | 이미지 뷰어 | X |

**넣지 않는 형식** — Office(`.docx` `.xlsx` `.pptx`), HWP/HWPX, EPUB(그건
`petal`), 동영상·오디오. 편집·변환·서명·OCR 기능도 없습니다.

---

## 데이터가 어디에 있나

- 문서 원본과 목록은 **이 기기의 IndexedDB**(`folio`)에 있습니다.
- 글자 크기·테마 같은 설정은 localStorage(`folio.v1`)에 있습니다.
- 동기화(Sync)는 **기본 꺼짐**입니다. 꺼져 있으면 folio는 어디에도 접속하지
  않습니다. 켜도 **제목·태그·날짜·크기만** 올라가고 문서 본문은 기기를
  떠나지 않습니다.
- 백업 내보내기(Export backup)로 JSON 한 개를 만들어 iCloud Drive나 Files에
  보관할 수 있습니다 → [BACKUP-RESTORE-KO.md](BACKUP-RESTORE-KO.md)

---

## 폴더 구조

```
folio/
├─ index.html            앱 화면 뼈대와 보안 정책(CSP)
├─ preview-host.html     HTML 문서를 격리해 띄우는 호스트
├─ manifest.webmanifest  홈 화면 추가용 정보
├─ sw.js                 오프라인 캐시 (VERSION 을 여기서 올립니다)
├─ assets/
│  ├─ app.css            색·글꼴·레이아웃 전부
│  └─ fonts/             Lexend 400 / 700
├─ src/
│  ├─ app.js             화면 전환과 뷰어 껍데기
│  ├─ version.js         빌드 번호 (APP_BUILD — sw.js 와 항상 같이 올립니다)
│  ├─ store.js           IndexedDB 9개 저장소
│  ├─ library.js         가져오기와 목록 그리기
│  ├─ detect.js          확장자 + 매직 바이트로 형식 판정
│  ├─ package.js         ZIP 패키지 해제와 방어
│  ├─ preview.js         Run·Read 샌드박스
│  ├─ retention.js       보관·해제
│  ├─ backup.js          백업·복원
│  ├─ sync.js            메타데이터 동기화
│  └─ handlers/          형식별 뷰어
├─ vendor/               PDF.js·marked·DOMPurify·papaparse·Dexie·highlight.js
├─ icons/  licenses/  tests/  docs/
```

### 직접 바꾸기 쉬운 곳

| 바꾸고 싶은 것 | 위치 |
|---|---|
| 색 (라이트·다크) | `assets/app.css` 맨 위 `:root` 와 `[data-theme="dark"]` |
| 글꼴 | `assets/app.css` 의 `body { font-family: … }` |
| 앱 이름 | `manifest.webmanifest` 의 `name`·`short_name`, `index.html` 의 `<h1>` |
| 보관 기본 기간 | `src/settings.js` 의 `DEFAULTS.retentionDays` |
| 빌드 번호 | `src/version.js` 의 `APP_BUILD` **와** `sw.js` 의 `VERSION` — 둘을 항상 같이 올립니다 |

---

## 안전 장치 요약

- 문서는 **격리된 샌드박스**에서만 실행됩니다. 실행 중인 문서는 folio의 다른
  문서를 읽을 수 없고, 어디에도 접속할 수 없습니다.
- Read 모드는 스크립트와 이벤트 속성을 제거한 뒤에 보여 줍니다.
- SVG는 이미지로만 표시하므로 SVG 안의 스크립트는 실행되지 않습니다.
- 삭제 표시는 **사용자가 삭제했을 때만** 만듭니다. "이 기기에 없다"는 사실로
  삭제를 추론하지 않습니다.

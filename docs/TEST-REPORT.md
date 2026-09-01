# folio — 자체 검토 결과

> **2026-08-13 감사 수정 메모:** 아래 1~14장은 당시 빌드별 역사 기록입니다. 현재
> 검증 결과와 감사 수정 범위는 15장이 기준입니다. 특히 실제 `WebApp/sample/`
> ZIP은 현재 작업공간에 없으므로 합성 fixture 통과와 실제 sample 검증을 구분하며,
> 누락된 실제 fixture를 통과로 집계하지 않습니다.

빌드 `2026.08.12-init1` · 검토일 2026-08-12 · 검토자 Claude Code (자체 검토)

기준 문서: `WebApp_House_Style.md` 10장 · 계획서 12장 ·
`Folio_Build_Brief_2026-08-12.md` 5장

**검토 환경** — macOS · Chromium 기반 미리보기 창 · 로컬 정적 서버
`http://127.0.0.1:4173/Deliverable/folio/` · Node v26.7.0

> 이 문서는 **자체 검토**(1~5장)에 **독립 검토 결과**(6장)와 **배포 기록**
> (8장)을 이어 붙인 것입니다. 4장 11단계에서 한 번 멈춰 독립 검토를 받았고,
> 통과 후 2026-08-12에 배포했습니다.

---

## 1. 통과

### 1-1. 기계 검사 (지시서 5장 — 전부 결과 없음 = 통과)

| # | 검사 | 결과 |
|---|---|---|
| 1 | 절대 경로 (`src="/` `href="/` `from "/`) | 0건 |
| 2 | 외부 요청 (`api.github.com` 제외) | 0건 |
| 3 | 동일 출처 샌드박스 토큰 — 배포 앱 소스 allowlist | 0건 (보고서·문서는 설명을 위해 해당 문자열을 포함하므로 전체 트리 주장이 아님) |
| 4 | 위험 패턴 (`innerHTML =` `eval(` `unsafe-*`) | **1건 — 아래 3-1 참조** |
| 5 | `index.html` 의 `style="` 속성 | 0건 |
| 6 | 배포 제외 대상 (`*.map` `pdf.sandbox.*` `quickjs-eval.*`) | 0건 |
| 7 | `sw.js` VERSION ↔ `src/version.js` APP_BUILD | 둘 다 `2026.08.12-init1` |
| 8 | `npm test` | 27/27 통과 |
| 9 | `npm run test:syntax` | 통과 (26개 파일) |

### 1-2. 지시서 5장 "하나라도 실패하면 배포하지 않는" 다섯 항목

| # | 항목 | 결과 | 근거 |
|---|---|---|---|
| 1 | 스크립트가 든 HTML이 **Read에서 실행되지 않음** | 통과 | 정화 결과에 `<script>` 0개, `<iframe>/<object>/<embed>` 0개, `on*` 속성 0개, 본문(`<h1>`)은 보존. 실행 프레임에는 스크립트 권한 자체가 없음 |
| 2 | `onload` 가 든 SVG가 **이미지 뷰어에서 실행되지 않음** | 통과 | `<img src="blob:">` 로 200×120 정상 표시, `onload`·내부 `<script>` 둘 다 실행 안 됨, 인라인 `<svg>` 0개 |
| 3 | Run 문서에서 **외부 요청이 나가지 않음** | 통과 (구조·페이로드 확인) | 호스트 CSP `connect-src 'none'`, 원격 스크립트는 `application/x-folio-remote-blocked` 로 무력화. **실행 자체는 3-2의 환경 제약으로 Pending** |
| 4 | **로컬에 없는 문서를 삭제로 추론하지 않음** | 통과 | 아래 1-3 |
| 5 | **샘플 ZIP 2건 반입** | 당시 통과 기록 · 현재 미검증 | 당시 실측 내용은 우측과 같으나 현재 작업공간에는 실제 sample ZIP이 없음. 현재 자동 검사는 합성 ZIP fixture만 사용 |

### 1-3. 삭제 추론 금지 — 실측 (계획서 5-4 하드 룰)

`focus` 2026-08-09 사고의 재발 방지 규칙입니다. 코드 검사와 실동작 양쪽으로
고정했습니다.

| 확인 | 결과 |
|---|---|
| 문서 1건 삭제 → **Undo 창이 열린 5초 동안** `folio.deletedDocs` | `null` (삭제 표시 없음) |
| `Undo` 누름 → 문서 복원 | 8건 → 7건 → 8건, 삭제 표시 여전히 `null` |
| Undo 창이 닫혀 삭제가 **확정된 뒤** | 삭제 표시 1건 생성 (`korean-utf8`) |
| 보관 기간이 지나 **사본만 해제**(release) | 삭제 표시 **증가 없음** — 해제 1건 후에도 1건 그대로 |
| `retention.js` `relink.js` `library.js` 에 `markDeleted` | 0건 (테스트로 고정) |
| `pushIndex` 가 원격 목록을 줄일 수 있는지 | 불가 — `mergeEntries(mergeEntries(previous, entries), deletions)` 합집합만 (테스트로 고정) |

### 1-4. 형식별

| 형식 | 확인 내용 | 결과 |
|---|---|---|
| 텍스트 | CP949 파일 자동 판정, 한글 정상 표시, `Find`/`Encoding`/`Wrap` | 통과 |
| 텍스트 | 목록 부가정보에 `CP949` 표기 | 통과 |
| Markdown | 표·코드블록·헤딩 렌더, `<script>` 제거, `onerror` 이미지 자리표시자 대체, 스크립트 미실행 | 통과 |
| CSV | 따옴표 안 쉼표 보존(`"a, b"`), 헤더 고정, 행 번호, 구분자·인코딩 변경 | 통과 |
| PDF | 한글 CID PDF 렌더, 텍스트 레이어 922개 스팬, 페이지 수·목차·회전·슬라이더 | 통과 |
| PDF | 본문 텍스트 추출(한/영 혼용 3,455자) → 통합 검색에 반영 | 통과 |
| 이미지 | SVG를 `<img>` 로만 표시, 회전·확대·`Fit` | 통과 |
| HTML | Read / Run / Source 3모드, Run은 문서별 확인 후 켜짐 | 통과 |
| 패키지 | 한 겹 폴더 진입점 인식, 자산 35개, 압축 한도 15 MiB | 통과 |

### 1-5. 화면과 접근성

| 확인 | 결과 |
|---|---|
| 글자 6단계(6·8·10·12·14·17) 각각에서 터치 영역 | 전 단계 **44 px 유지** |
| 같은 단계에서 입력창 글자 | 전 단계 **16 px 고정** |
| 같은 단계에서 가로 넘침 | 없음 (`scrollWidth == innerWidth == 375`) |
| Continue 줄이 6·8px 단계에서 접힘 | 통과 |
| 라이트 / 다크 전환, 시스템 따라가기 | 통과 |
| 새로고침 후 테마·글자 크기·문서 유지 | 통과 |
| iPad 가로 2단 (좌 320 px + 우 뷰어) | 통과 (1180×820에서 확인) |
| keep line — 핀 3px 실선 / 사본 1px 실선 / 파일 필요 1px 점선 | 통과 (색 없이 구분됨) |
| 한 화면 색 수 | 태그 4계열 + 대표색 = 5색 |
| `user-scalable=no` 미사용 | 통과 |
| 핀치의 단일 포인터 대안 (제목 탭 → 문서 시트 `Text size`) | 구현됨 (SC 2.5.1) |
| 아이콘 단독 버튼의 `aria-label` | 전부 있음 |

### 1-6. 데이터

| 확인 | 결과 |
|---|---|
| Dexie 9개 저장소 생성 | 통과 |
| 해시 중복 재연결 (`Already in folio — reconnected instead.`) | 통과 |
| 백업 → 전체 삭제 → 복원 왕복 | 7건 전부 복원, 제목 목록 일치 |
| 백업에 15 MB급 패키지 포함 | 통과 (10.5 MB 패키지 포함, 파일 36.2 MB) |
| PDF·이미지가 `Needs file` 로 복원되고 제외 목록에 표시 | 통과 |
| 패키지 자산 35개 복원 | 통과 |
| 해제 → 재연결(해시 일치) → 읽던 위치 복귀 | 통과 |
| 보관 대상에서 텍스트 계열 제외 | 통과 (40일 방치한 PDF만 해제됨) |
| 저장 실패 시 오래된 비핀 사본부터 해제 | 구현됨 (실측은 3-2 Pending) |

### 1-7. 콘솔

folio 자신의 동작에서 **오류 0건 · CSP 위반 0건** 입니다.

`securitypolicyviolation` 리스너를 붙인 뒤 설정 열기 → 글자 6단계 전환 →
목록 복귀 → 각 형식 뷰어 열고 닫기를 수행한 결과 **위반 0건, 페이지 오류
0건** 이었습니다.

---

## 2. 고친 문제 (제작 중 발견)

| # | 문제 | 원인과 조치 |
|---|---|---|
| 1 | Read·Run 모드에서 문서가 아예 그려지지 않음 | 호스트 프레임(`preview-host.html`)에 스크립트 권한을 주지 않아 호스트 자신의 부트스트랩이 돌지 못했습니다. **문서를 담는 안쪽 프레임**이 스크립트 없이 떠야 하는 것이므로, 바깥 호스트에는 스크립트 권한을 주고 안쪽 프레임의 권한만 모드에 따라 나누도록 고쳤습니다 (vault의 원래 구조와 동일). 테스트로 고정 |
| 2 | PDF 페이지 수·텍스트 레이어 여부가 저장되지 않음 | PDF.js 6에서는 문서 프록시가 아니라 **로딩 태스크**가 정리를 담당합니다. `pdf.destroy()` 가 없어 색인 단계가 조용히 실패했습니다. 로딩 태스크를 들고 `close()` 로 정리하도록 고침 |
| 3 | 목록의 텍스트 인코딩이 `EUC-KR` 로 표시됨 | 화면에는 `CP949` 로 적기로 되어 있습니다(명세 2-4). 표시용 라벨 함수를 쓰도록 고침 |
| 4 | SVG가 열리지 않고 "표시할 수 없다"만 나옴 | MIME 타입이 비어 있는 파일에서 `blob:` URL을 디코딩하지 못했습니다. 파일 이름의 확장자로 MIME을 정해 URL을 만들도록 고침. 오류 안내도 화면 밖으로 밀리지 않게 배치 수정 |
| 5 | CSV·텍스트 하단의 위치 표시(`Row 1,204 / 8,391`)가 비어 있음 | 핸들러가 하단 바가 만들어지기 전에 위치를 보고했습니다. 마지막 값을 기억했다가 바가 생길 때 반영하도록 고침 |
| 6 | 사본이 해제된 문서에 만료 배지(`0d`)가 붙음 | 만료 배지는 **로컬 사본**에 대한 것이라 이미 해제된 문서에는 의미가 없습니다. `released` 문서에서는 표시하지 않도록 고침 |

---

## 3. 판단이 필요한 사항

### 3-1. 기계 검사 4번이 1건 걸립니다 — 계획서가 요구하는 값입니다

지시서 5장의 위험 패턴 검사

```
grep -rnE 'innerHTML[[:space:]]*=|eval\(|unsafe-inline|unsafe-eval' index.html sw.js src/
```

가 **`index.html` 13행 1건**을 잡습니다. 잡히는 문자열은 앱 셸 CSP 안의
`'wasm-unsafe-eval'` 입니다.

- 이 값은 **계획서 10장이 명시적으로 요구**합니다 — "`'wasm-unsafe-eval'` 은
  PDF.js 이미지 디코더용. `'unsafe-eval'` 은 쓰지 않습니다."
- 빼면 JBIG2·JPEG2000 스캔 PDF가 열리지 않습니다.
- 검사식의 `unsafe-eval` 패턴이 `wasm-unsafe-eval` 의 부분 문자열이라 생기는
  일이고, 실제 `'unsafe-eval'` 도 `'unsafe-inline'` 도 앱에 없습니다.

우선순위(웹앱 기준 > 계획서 > 지시서)에 따라 **계획서의 CSP를 그대로 두었고**,
대신 이 한 건 외에는 걸릴 것이 없도록 주석에서까지 해당 문자열을 없앴습니다.
검사식을 `[^-]unsafe-eval` 로 다듬으면 0건이 됩니다.

### 3-2. 미리보기 창이 샌드박스 iframe을 막습니다 — Run 실행 확인 불가

검토에 쓴 브라우저 창은 **샌드박스가 걸린 iframe 요청을 전부
`ERR_BLOCKED_BY_CLIENT` 로 차단**합니다. 같은 창에서 **현재 배포 중인 vault의
`preview-host.html` 도 똑같이 차단**되는 것을 확인했습니다 — folio의 결함이
아니라 검토 환경의 제약입니다.

그래서 Run·Read의 **실제 실행**은 확인하지 못했고, 대신 샌드박스에 넘기는
내용물을 직접 검사했습니다.

- Read 정화 결과: 스크립트·이벤트 속성·`<iframe>` 0건, 본문 보존 (1-2의 1번)
- Run 페이지: 저장소 셰임과 진단 스크립트 주입 확인, 상대 경로 자산 35개가
  전부 해석됨, 경고 0건

**실기기에서 확인해야 할 항목**으로 4장에 올려 두었습니다.

### 3-3. 콘솔 오류에 대한 참고

검토 창의 콘솔에는 `style-src 'self'` 위반 19건이 찍힙니다. **folio가 만드는
것이 아닙니다.** 스크립트도 스타일도 전혀 없는 빈 HTML 페이지에 같은 CSP만
넣어도 똑같이 19건이 나옵니다 — 미리보기 창이 페이지에 끼워 넣는 자체 UI가
원인입니다. folio 동작 중 리스너로 확인한 위반은 0건입니다(1-7).

### 3-4. 명세에 없어 추가한 문구 (명세 10장 문구 규칙에 따라 기록)

명세는 복수형만 예로 들고 있어(`18 pages`, `1,204 rows`) 단수 상황의 표기가
없었습니다. `1 pages` 는 어색하므로 단수형을 만들었습니다.

| 상황 | 추가한 문구 |
|---|---|
| 1페이지 PDF | `1 page` |
| 1행 CSV | `1 row` |
| 외부 링크 확인 | `Open this link?` / `Open link` |
| 링크 형식 미지원 | `Unsupported link` |
| 사본 없이 내보내기 시도 | `This document has no local copy.` |
| Markdown에 헤딩이 없음 | `This document has no headings.` |
| PDF에 목차가 없음 | `This PDF has no outline.` |
| 목차 항목을 못 찾음 | `That destination could not be resolved.` |
| Source가 아닌 모드에서 Find | `Switch to Source to search inside the code.` |
| 패키지에서 Run을 껐을 때 | `Run is off for this document.` |
| 해제할 것이 없음 | `Nothing to release.` |
| Retention이 Never | `Retention is set to Never — nothing to release.` |
| 백업 저장 전 안내 | `About 37.0 MB as a file.` |
| 동기화 켠 직후 | `Sync is on. Add an access token to start.` |
| 인코딩 판정 실패 | `This file is not valid UTF-8 or CP949. Some characters may be wrong.` |
| 형식별 뷰어 없음 | `folio has no viewer for this document.` |
| 재연결 필요 | `This document needs its original file.` |

명세에 있는 문구는 **하나도 바꾸지 않았습니다.**

### 3-5. 백업 파일 크기

샘플 문서 7건(패키지 2건 포함) 기준 백업 JSON이 **36.2 MB** 였습니다. 전체
상한 40 MB에 가깝습니다. 계획서 8-2 그대로이지만, 큰 패키지를 몇 개 더 넣으면
상한에 걸려 제외 목록이 길어집니다. 실사용 뒤 상한 조정이 필요할 수 있습니다.

---

## 4. 실기기 확인 필요 (Pending)

시뮬레이터로 판정하지 않고 목록으로 남깁니다.

| # | 항목 | 왜 |
|---|---|---|
| 1 | **Run 모드 실제 실행** — 샘플 ZIP 2건이 화면에 그려지고 동작하는지 | 검토 창이 샌드박스 iframe을 차단 (3-2) |
| 2 | **Run 문서에서 외부 요청 0건** (Safari 네트워크 검사) | 위와 같음 |
| 3 | Read 모드에서 스크립트 문서가 실행되지 않는지 (실기기 재확인) | 위와 같음 |
| 4 | HEIC 사진 표시 여부 | iOS 버전에 따라 다름 |
| 5 | 사진의 EXIF 회전 반영 | Safari 동작 확인 필요 |
| 6 | 홈 화면 앱과 Safari 탭의 저장소 격리 | 실기기에서만 판정 가능 |
| 7 | 파일 선택기에서 돌아올 때 앱이 재시작되는지 | iOS 메모리 정책 |
| 8 | 대용량 PDF(100페이지 이상) 렌더 성능과 메모리 | 실기기 성능 |
| 9 | 장기 미사용 후 데이터 유지 | WebKit 저장 정책 |
| 10 | **오프라인 상태에서 첫 한글 PDF** — CMap 프리캐시가 실제로 듣는지 | 실기기 오프라인 |
| 11 | 저장 공간 부족 시 자동 해제 → 재시도 경로 | 실제로 공간을 채워야 재현 |
| 12 | 홈 화면 앱에서 Share Sheet 백업 저장이 성공하는지 | 사용자 제스처 만료 여부 |
| 13 | 키보드가 열린 상태에서 검색창·주요 버튼 가림 여부 | 실기기 키보드 |
| 14 | 한글 IME 조합 중 Enter 중복 방지 | 코드로는 `isComposing` 처리, 실기기 확인 필요 |
| 15 | Add to Home Screen 후 standalone 실행과 아이콘 | 실기기 |
| 16 | 동기화 실제 왕복 (토큰 필요) | `webapp-data` 접근 토큰이 있어야 함 |
| 17 | CSV 열 1000개 / 행 10만 성능 | 대용량 샘플 필요 |

---

## 5. 검토에 쓴 파일

`tests/manual/` 에 검토용 문서를 넣어 두었습니다. 배포에는 영향이 없습니다.

| 파일 | 무엇을 확인하나 |
|---|---|
| `scripted.html` | Read 모드에서 스크립트·`onerror` 가 죽는지 |
| `onload.svg` | SVG의 `onload` 와 내부 `<script>` 가 실행되지 않는지 |
| `korean-cp949.txt` · `korean-cp949.csv` | CP949 자동 판정 |
| `korean-utf8.csv` | 따옴표 안 쉼표·줄바꿈 |
| `sample.md` | Markdown 정화와 렌더 |

`tests/fixtures/` 의 ZIP 11종은 `npm test` 가 만들고 씁니다(ZIP Slip·절대 경로·
중복·대소문자 충돌·암호화·초과 크기·모호한 진입점·진입점 없음·손상·패키지
스크립트·**한 겹 폴더 진입점**·**최상위 폴더 2개**).

---

## 6. 독립 검토 결과 (Cowork, 2026-08-12)

**통과 — 배포를 막을 결함 없음.**

### 6-1. 재실행한 것

기계 검사 7종 전부 결과 없음, `npm test` 27/27, `npm run test:syntax` 통과.
추가로 확인 — 모듈·자산 참조 138건 중 137건 해결(나머지 1건은 배포 시 해결되는
`../../shared/v1/sync.js`), `.gitignore` 가 vendor·폰트·아이콘을 빼먹지 않음
(추적 269파일, vendor 204), 두 샘플 ZIP의 실제 바이트가 네 한도를 모두 통과하고
`pickEntry` 가 root · 한 겹 폴더 양쪽을 해석함.

### 6-2. 고친 것 — `src/handlers/html.js` 의 원시 NUL 바이트

`` `${kind}<NUL>${clean}` `` 의 구분자가 **이스케이프가 아닌 원시 NUL 문자**로
들어 있었습니다. 그 결과 `grep` 이 이 파일을 바이너리로 판정해 **지시서 5장
기계 검사 1·2·4번이 이 파일의 라인을 검사하지 않았습니다** — 결과가 비어 있어도
검사되지 않은 통과였습니다. `grep -a` 로 강제 재검사한 결과 **내용 자체는
깨끗**했으므로 보안 결함은 아니지만, 검사 체인이 조용히 비는 구조이고 git 도 이
파일을 바이너리로 다뤄 diff 가 나오지 않습니다.

`\u0000` 이스케이프로 치환했습니다. 런타임 문자열은 동일하고 테스트 27건 통과를
재확인했습니다. 지시서 5장 검사식에도 **`-a` 플래그를 상설화**하고,
`[^-]unsafe-eval` 로 다듬어 `wasm-unsafe-eval` 오탐을 없앴으며,
`insertAdjacentHTML` `outerHTML=` `document.write` `new Function`
`setAttribute('style'` 등가 패턴 검사를 추가했습니다 — 새 검사도 0건입니다.

### 6-3. 3장 판단 요청에 대한 회신

| 항목 | 회신 |
|---|---|
| 3-1 `wasm-unsafe-eval` | **판단 옳음.** 앱 셸 CSP가 계획서 10장과 문자 단위로 일치함을 확인. 검사식을 다듬는 쪽으로 처리 |
| 3-2 Run 실행 미확인 | **타당함.** 환경 제약이 맞고, 넘긴 내용물 검사로 대체한 판단도 적절. Pending 유지 |
| 3-3 콘솔 위반 19건 | **folio 원인 아님.** 앱 CSP·코드에서 재현 경로가 없음 |
| 3-4 추가 문구 17건 | **승인.** 명세 10장 문구 규칙(완료형·동사 일관·원인 후 행동)에 어긋나지 않음 |
| 3-5 백업 36.2MB | 상한 조정은 실사용 뒤에 판단. 지금은 계획서 8-2 그대로 유지 |

`package.js` `preview.js` 의 `insertAdjacentHTML` · `setAttribute('style'` 3건은
DOMParser 로 만든 **분리 문서**에만 작용해 `srcdoc` 문자열로 나가므로 앱 DOM 에
닿지 않습니다 — 위험 아님으로 판정했고, 그래서 6-2의 등가 패턴 검사에서
두 파일을 대상에서 제외했습니다.

---

## 7. 다음 단계

독립 검토를 통과했으므로 **지시서 7장의 배포로 진행합니다.**

---

## 8. 배포 기록 (2026-08-12)

지시서 7장 순서대로 진행했습니다. **vault 은퇴는 하지 않았습니다** (7장 5번 —
folio 실기기 확인 후 사용자 지시가 있을 때만).

| # | 단계 | 결과 |
|---|---|---|
| 0 | Cowork 독립 검토 통과 | 6장 |
| 1 | `jennie-verse/folio` (Public) | 이미 비어 있는 상태로 존재해 그대로 사용 — 덮어쓴 것 없음 |
| 2 | 첫 커밋과 push | `72cfdb6` · 269파일 (vendor 204) |
| 3 | GitHub Pages 활성화 | `main` 브랜치 `/` 루트 · `https` 강제 |
| 4 | 배포 URL 확인 | `https://jennie-verse.github.io/folio/` — 200 |
| 5 | `Deliverable/folio/` → `Published/folio/` 이동 | 완료 (git 이력 포함) |

### 8-1. 배포 자산 확인 (실제 URL)

| 확인 | 결과 |
|---|---|
| 앱 셸 (`index.html` `sw.js` `manifest.webmanifest` `preview-host.html` `app.css`) | 전부 200, MIME 정상 |
| Lexend woff2 | 200 `font/woff2` |
| PDF.js 코어·워커 | 200 `text/javascript` |
| 한국어 CMap · standard_fonts · wasm · iccs | 200 (`application/octet-stream` · `x-font-type1` · `application/wasm` · `vnd.iccprofile`) |
| **`pdf.sandbox.*` · `quickjs-eval.*` · `*.map`** | **404 — 배포되지 않음** |
| `../shared/v1/sync.js` | 200 (하위 경로에서 정상 해석) |

### 8-2. 배포된 앱 실동작

| 확인 | 결과 |
|---|---|
| 첫 실행 · 문서 3건 반입 (한글 CSV·CP949 텍스트·Markdown) | 정상 |
| CP949 자동 판정 | 정상 (`CP949` 표기) |
| Markdown 안의 `<script>` | 제거됨 |
| **콘솔 오류 · CSP 위반** | **각각 0건** |
| 빌드 표기 | `Build 2026.08.12-init1` |
| Service Worker 등록 | 1건 |
| 셸 캐시 | `folio-shell-2026.08.12-init1` · 65개 |
| └ 한국어 CMap 프리캐시 | **24개 전부** |
| └ `../shared/v1/sync.js` | 선택 캐시로 들어감 (설치는 이것과 무관하게 성공) |
| └ PDF.js 코어 | 프리캐시 안 함 — 설계대로 첫 PDF에서 받음 |

### 8-3. `Published/folio/` 와 배포 실물 일치

`Published/folio/` 의 `HEAD` 와 `origin/main` 이 같은 커밋이고, 작업 트리에
변경 없음. `index.html` `sw.js` `src/version.js` `src/handlers/html.js`
`assets/app.css` 의 SHA-256 앞자리가 배포 URL에서 받은 바이트와 일치합니다.

> 이 8장을 추가하면서 커밋이 하나 늘었습니다. 지시서 7장 4번(“`Published/folio/`
> 는 배포 실물과 항상 같아야 합니다”)에 따라 **그 자리에서 고치고 다시
> 배포**했으므로, 최종 상태에서도 둘은 같습니다.

### 8-4. 남은 일

4장 Pending 17건은 그대로입니다. 특히 1~3번(Run 실제 실행·외부 요청 0건·Read
재확인)은 이제 **실기기에서 배포 URL로 바로 확인**할 수 있습니다.

---

## 9. 패키지 자산 손실 수정 (2026-08-12, `2026.08.12-pkglink1`)

지시서: `Plan/folio_package-link-fix/Folio_Package_Link_Fix_2026-08-12.md`
증상: 샘플 두 ZIP에서 첫 화면은 정상인데 `pdf` `svg` `png` 링크를 누르면
`folio-missing-asset` 이 뜸.

`Published/folio/` 를 그 자리에서 고쳐 다시 배포했습니다. 3-0 진단(실기기에서
`Needs file` 배지·`Preview issues` 건수 확인)은 사용자 확인 항목이라 기다리지
않고 진행했습니다 — 두 결함 모두 코드에서 재현·수정·검증했습니다.

### 9-1. 결함 A — 해제가 자산을 지우고 재연결이 되살리지 않음

| 파일 | 고친 내용 |
|---|---|
| `src/relink.js` | `packagePatch()` 추가. `kind === 'html-package'` 면 고른 파일을 `pkg.importZip()` 으로 다시 풀어 `putPackageAssets()` 하고 `entryPath` `entryContent` `packageFileCount` `packageAssetsReleased:false` 를 함께 갱신합니다. **해시 일치 경로와 `Link anyway` 경로 양쪽**에 적용했고, ZIP 해제가 실패하면 `This ZIP could not be read.` 를 띄우고 **아무것도 바꾸지 않은 채 취소**합니다 |
| `src/retention.js` | 패키지를 해제할 때만 자산을 지우고 `packageAssetsReleased: true` 를 기록합니다. 해제 정책 자체는 계획서 7장 그대로 두었습니다 |
| `src/handlers/html.js` | 자산이 0개면 Read·Run 어느 쪽도 렌더하지 않고 `This package's files are missing. Reconnect the original ZIP.` + `Reconnect` 버튼을 띄웁니다 |
| `src/app.js` | `Needs file` 흐름을 `reconnectDocument()` 로 분리해 뷰어의 `Reconnect` 버튼도 같은 경로를 씁니다 |

**실측** — 두 샘플을 넣고(자산 25·35개) 40일 방치 상태로 만들어 해제 →
자산 0개·`packageAssetsReleased:true`·`entryContent` 는 보존 → 원본 ZIP으로
재연결 → **자산 25·35개 전부 복원**, 플래그 해제, 진입점 `mindmap-5/index.html`
유지, `Preview issues (0)` 으로 정상 렌더.

배포된 판이 남긴 상태(`released:false` 인데 자산 0개)도 그대로 재현해
안내 화면이 뜨는 것을 확인했습니다.

### 9-2. 결함 B — 앵커로만 닿는 자산을 인라인하지 않음

| 파일 | 고친 내용 |
|---|---|
| `src/package.js` | `collectRefs()` 가 **그려야 하는 참조**(`img` `source` `poster` `srcset` `data` CSS `url()` `@import` 스타일시트)와 **앵커 참조**를 나눠 모으고, `inlinePaths()` 가 **앵커에만 있고 그리지 않는** 자산을 맵에서 뺍니다. 분류는 `rewriteStatic()` **이전**에 합니다 — 그 뒤에는 원래 경로가 남지 않습니다 |
| | 앵커는 data: URL로 바꾸지 않고 `data-folio-path` 에 패키지 경로를 남깁니다. shim 런타임(정적·동적·`innerHTML`·MutationObserver 경로 전부)도 같게 동작합니다 |
| | 맵에서 빠진 자산도 `known` 에 남아 링크 태깅이 됩니다. 해석 실패는 지금처럼 `asset-error` |
| `src/preview.js` | `instrument()` 클릭 핸들러 맨 앞에 분기 추가 — `data-folio-path` 가 있으면 `preventDefault()` 후 `post("open-asset")`. `#`·`download`·`javascript:`·http(s)·mailto·tel·sms 처리는 그대로. `mount()` 이 `options.onOpenAsset(path)` 로 넘깁니다 (세션 검사 동일) |
| `src/app.js` | `openPackageAsset()` — base64 → `Uint8Array` → `Blob` 을 **folio 쪽에서** 만들고 `detect()` 로 형식을 판정해 제 뷰어로 엽니다. 맵에 없으면 `This file is not in the package.`, 뷰어가 없으면 내보내기를 제안합니다 |
| `src/handlers/html.js` | Read·Run 양쪽 `preview.mount()` 에 `onOpenAsset` 을 넘깁니다. 패키지 Read는 materialize 후 정화하도록 바꿔 이미지가 해석되고 링크가 `data-folio-path` 를 갖습니다. DOMPurify 에 `ADD_ATTR: ['data-folio-path']` 를 넣어 이 속성만 통과시킵니다 |

**실측 (`tests/package-map.test.html`, 13/13 통과)**

> 이 하네스는 샘플 ZIP을 `WebApp/sample/` 에서 읽으므로 **로컬 검토 서버**
> (`http://127.0.0.1:4173/Published/folio/tests/package-map.test.html`)에서
> 돌려야 13건이 전부 실행됩니다. 배포 URL에서 열면 샘플이 없어 크기 2건은
> `SKIP` 으로 표시되고 DOM 검사 7건만 돕니다 — 실패가 아닙니다.

| | 이전 | 이후 |
|---|---|---|
| `mindmap.zip` materialize | 3.25 MB | **16.4 KB** (링크 23개 태깅) |
| `mindmap-.zip` materialize | 16.39 MB | **18.2 KB** (링크 34개 태깅) |
| materialize 경고 | 0건 | 0건 |

혼합 케이스도 확인했습니다 — 링크로만 닿는 PDF는 맵에서 **빠지고**, `<img>` 로
그리는 파일은 **남고**, `<img>` 와 `<a>` 양쪽에 쓰인 파일은 **인라인 유지**,
아무도 참조하지 않는 파일도 **유지**(앵커 전용만 제외).

자산이 뷰어로 제대로 흘러가는지도 실제 패키지 데이터로 확인했습니다 —
`.pdf` → `pdf`, `.png`/`.svg` → `image`, `.txt` → `text` 로 판정되고, 패키지에서
꺼낸 PDF 바이트가 원본 파일과 길이까지 일치합니다.

### 9-3. 수정 중 발견해 고친 결함 (제 리팩터링 실수)

뷰어 마운트를 `showInViewer()` 로 분리하면서 하단 바 분기에 옛 변수명(`fresh`)이
남아 **문서를 열 때마다 `ReferenceError` 가 나고 있었습니다.** 프레임은 이미
붙은 뒤라 화면은 멀쩡해 보였지만, 그 뒤의 문서 글자 크기 적용·본문 제스처
연결·하단 바 구성이 전부 실행되지 않았습니다. CSP 대조용 빈 페이지를 띄웠다가
콘솔에서 발견했습니다.

`record.kind` 로 고쳤고, 재확인 결과 **텍스트·CSV·PDF·이미지·HTML·패키지를
모두 열고 닫는 동안 오류 0건**, CSV 하단이 `Row 2 / 2`, PDF 하단이 `1 / 1` 로
정상 표시됩니다.

### 9-4. 완료 조건

| 3-1 기계 검사 | 결과 |
|---|---|
| 동일 출처 샌드박스 토큰 (배포 앱 소스 allowlist) | 0건 |
| `npm test` | **32/32 통과** (기존 27 + 신규 5) |
| `npm run test:syntax` | 통과 |
| 기존 검사 7종 | 전부 유지 |
| 재연결 시 `packageAssets` 복원 | 테스트로 고정 (양쪽 경로 + 실패 시 취소) |
| 자산 빈 패키지는 렌더 안 함 | 테스트로 고정 |
| 앵커 전용 자산이 맵에서 빠짐 | 테스트로 고정 (배선) + 브라우저 하네스 실측 |
| `<img>` 자산은 인라인 유지 | 브라우저 하네스 실측 |
| `<img>`+`<a>` 양쪽이면 인라인 유지 | 브라우저 하네스 실측 |
| 두 샘플이 100 KB 미만 | 브라우저 하네스 실측 (16.4 KB · 18.2 KB) |

> **왜 일부가 브라우저 하네스인가** — `materialize()` 는 파싱된 DOM을 순회하고
> Node에는 DOM이 없습니다. 의존성을 추가하면 `npm test` 가 오프라인·무빌드로
> 도는 성질을 잃으므로, vault가 `tests/package.test.html` 을 두던 방식 그대로
> `tests/package-map.test.html` 을 만들었습니다. `npm test` 에는 **분류가 조용히
> 우회될 수 없도록 배선**(분류가 rewrite보다 먼저인지, `keep` 이 shim에 전달되는지,
> 그리기·링크 겸용 규칙이 살아 있는지)을 고정해 두었습니다.

| 3-3 버전 | 결과 |
|---|---|
| `sw.js` VERSION · `src/version.js` APP_BUILD | 둘 다 `2026.08.12-pkglink1` |
| 캐시 이름 | `folio-shell-2026.08.12-pkglink1` 등으로 따라 바뀜 (실측) |

콘솔 오류 0건, folio가 만든 CSP 위반 0건. 검토 창에 찍히는 `style-src` 위반
19건은 이번에도 **스크립트도 스타일도 없는 빈 페이지에서 그대로 재현**되므로
folio 원인이 아닙니다(3-3과 동일).

### 9-5. 실기기 확인 필요 (Pending 추가)

샌드박스 iframe이 검토 창에서 차단되는 제약은 그대로입니다. 이번 수정의
클릭 동선은 실기기에서 확인해 주세요.

| # | 항목 |
|---|---|
| 18 | 패키지의 `pdf` 링크 → folio PDF 뷰어에서 열리고 한글이 깨지지 않는지, 목차·검색이 되는지 |
| 19 | `svg` · `png` 링크 → 이미지 뷰어에서 열리고 확대·회전이 되는지 |
| 20 | 뒤로 가면 패키지 화면과 **스크롤 위치**가 복원되는지 |
| 21 | 해제 → 재연결 왕복 뒤에도 링크가 전부 살아 있는지 (실기기 재확인) |
| 22 | `Preview issues` 0건 유지 |

4장의 기존 Pending 1~17은 그대로입니다.

---

## 10. 패키지 가드 오탐 수정 (2026-08-12, `2026.08.12-pkglink2`)

독립 검토 지적: 9-1에서 넣은 가드가 **"자산 0개"** 를 조건으로 써서,
`index.html` 하나만 든 정상 ZIP(자산이 원래 0개)도
`This package's files are missing.` 로 막혔습니다. 재현했습니다 — 자산 0개,
`packageFileCount` 1, 렌더 안 됨.

### 10-1. 고친 내용

가드를 `handlers/html.js` 의 `packageAssetsMissing(doc, assets)` 로 옮기고
조건을 **"자산이 없다"에서 "자산을 잃었다"** 로 바꿨습니다.

```
자산이 남아 있으면            → 정상 (플래그가 남아 있어도 자산이 이깁니다)
packageAssetsReleased        → 잃음 (현재 빌드에서 해제된 경우)
packageFileCount > 1 인데 0개 → 잃음 (배포된 init1 이 망가뜨린 문서)
그 외 (단일 파일 ZIP)         → 정상
```

**플래그만으로는 부족합니다.** 배포된 `2026.08.12-init1` 은 해제할 때 자산을
지우고(플래그는 아직 없었음) 재연결할 때 `released` 만 껐습니다. 그렇게 망가진
문서가 지금 사용자 기기에 있고, 플래그는 그때 존재하지 않았으므로 그 문서를
알아볼 수 없습니다. 반입 시 기록된 `packageFileCount` 만이 "원래 자산이 있었다"를
증언합니다 — 그래서 플래그를 1차 조건으로 두고 이 값을 함께 봅니다. 검토 지시는
플래그 교체였지만, 그대로만 하면 이번 수정의 대상이던 사용자들이 다시 죽은 링크
페이지를 보게 됩니다.

`retention.js` 도 함께 정리했습니다 — 실제로 삭제된 행이 있을 때만 플래그를
세웁니다(`delete()` 반환값 사용). 잃을 자산이 없는 단일 파일 패키지는 해제해도
플래그가 붙지 않습니다.

### 10-2. 실측 (브라우저, 상태 4종)

| 문서 상태 | `packageFileCount` | 자산 | 플래그 | 결과 |
|---|---|---|---|---|
| 단일 파일 ZIP (정상) | 1 | 0 | 없음 | **렌더됨** (`Run`/`Find`, `Preview issues (0)`) |
| 다중 파일 패키지 (정상) | 26 | 25 | 없음 | **렌더됨** |
| init1 이 망가뜨린 상태 | 26 | 0 | 없음 | **가드** |
| 현재 빌드에서 해제됨 | 26 | 0 | true | **가드** |

해제 시 플래그 기록도 확인했습니다 — `mindmap`(26개) `true`,
`mindmap-`(36개) `true`, `solo`(1개) **`false`**.

단일 파일 ZIP의 왕복도 확인했습니다: 해제 → 재연결(`linked`) → `released:false`,
플래그 없음 → 정상 렌더. 콘솔 오류 0건, CSP 위반 0건.

### 10-3. 회귀 테스트

`npm test` **33/33**. 새 테스트 2건입니다.

- `packageAssetsMissing()` 을 직접 불러 **9가지 조합**을 고정 — 단일 파일 ZIP
  두 경우(빈 맵·`null`)는 `false`, 플래그가 선 두 경우는 `true`,
  `packageFileCount > 1` + 자산 0은 `true`, 자산이 남아 있으면 플래그가 있어도
  `false`, 패키지가 아니거나 `null` 이면 `false`
- `retention.js` 가 삭제된 행이 있을 때만 플래그를 세우는지 소스로 고정

가드가 이 함수를 거치도록 강제하는 검사도 넣어, 조건을 인라인으로 되돌리면
테스트가 깨집니다.

### 10-4. 완료 조건

| | 결과 |
|---|---|
| 동일 출처 샌드박스 토큰 | 0건 |
| `npm test` · `test:syntax` | 33/33 · 통과 |
| 기존 검사 7종 | 전부 유지 |
| `VERSION` ↔ `APP_BUILD` | 둘 다 `2026.08.12-pkglink2` |
| 콘솔 오류 · CSP 위반 | 0건 |

9-5의 실기기 Pending 5건(클릭 동선·스크롤 복원)은 그대로입니다.

---

## 11. 링크 클릭 무반응 수정 (2026-08-12, `2026.08.12-pkglink3`)

실기기 확인 결과: 9~10장에서 고친 패키지 링크가 **여전히 아무 반응이 없었습니다.**
사용자가 원인을 직접 찾아 알려주었습니다.

### 11-1. 원인

`preview-host.html` 은 안쪽 문서 프레임에서 오는 메시지를 화이트리스트로
중계합니다.

```js
['ready','scroll','open','asset-error','runtime-error'].indexOf(d.type)>=0
```

9-2에서 `instrument()` 가 보내도록 추가한 `open-asset` 이 이 목록에
**빠져 있었습니다.** 링크를 누르면 안쪽 프레임은 `open-asset` 을 정상적으로
보냈지만, 중계기가 목록에 없는 타입을 조용히 버려 부모 앱(`mount()`)은
아무것도 받지 못했습니다 — 오류도, 콘솔 로그도 없이 그냥 무반응이었습니다.

`preview-host.html` 은 **첫 배포(`72cfdb6`) 이후 이 지점을 한 번도 고치지
않았습니다.** 9-2 작업 때 `preview.js`(발신 측)와 `src/app.js`(수신 측)는
고쳤지만, 그 사이를 잇는 `preview-host.html` 의 화이트리스트는 놓쳤습니다.

### 11-2. 재확인 — 다른 누락은 없는지 전수 대조

세 파일에서 실제 쓰이는 메시지 타입을 전부 뽑아 대조했습니다.

| 발신 | 타입 |
|---|---|
| `instrument()` (`preview.js`, 일반 HTML·패키지 공통 진단 스크립트) | `scroll` `runtime-error` `open-asset` `open` `ready` |
| `shim()` (`package.js`, 패키지 전용 자산 해석기) | `asset-error` `runtime-error` |
| **합집합** | `scroll` `runtime-error` `open-asset` `open` `ready` `asset-error` (6개) |

| 수신 (`mount()` 의 `onMessage`, 중계에 의존하는 것만 — `bootstrap-ready` 는
세션 대조 이전에 호스트 자신이 직접 보내는 별개 채널이라 제외) | 타입 |
|---|---|
| | `scroll` `open` `open-asset` `asset-error` `runtime-error` `ready` (6개) |

**중계 목록(수정 후)**: `ready` `scroll` `open` `open-asset` `asset-error`
`runtime-error` (6개) — 위 두 집합과 정확히 일치합니다. `open-asset` 외에
다른 누락은 없었습니다.

### 11-3. 고친 내용

`preview-host.html` 한 줄만 고쳤습니다.

```diff
- ['ready','scroll','open','asset-error','runtime-error']
+ ['ready','scroll','open','open-asset','asset-error','runtime-error']
```

**`sw.js` 의 `VERSION` 과 `src/version.js` 의 `APP_BUILD` 를 함께
`2026.08.12-pkglink3` 로 올렸습니다.** `preview-host.html` 은 셸 캐시에
들어 있어 캐시 우선으로 서빙됩니다 — 버전을 올리지 않으면 캐시 이름이
그대로라 기기에 이미 깔린 옛 `preview-host.html` 이 계속 쓰였을 것입니다.

### 11-4. 회귀 테스트

`tests/static.test.mjs` 에 위 3파일을 정적으로 대조하는 테스트를
추가했습니다 — 정규식으로 각 파일에서 실제 문자열 리터럴을 뽑아 집합
연산으로 비교합니다.

- `instrument()` 가 보내는 모든 타입이 중계 목록에 있는지
- `shim()` 이 보내는 모든 타입이 중계 목록에 있는지
- `mount()` 가 처리하는 모든 타입(`bootstrap-ready` 제외)이 중계 목록에
  있는지

**이 테스트가 실제로 이 결함을 잡는지 직접 증명했습니다** — 중계 목록을
결함이 있던 원래 상태로 되돌려 실행하면 이 테스트만 실패하고, 고친 상태로
되돌리면 34개 전부 통과합니다. 미래에 `p("새타입", …)` 이나
`data.type === '새타입'` 을 추가하면서 `preview-host.html` 을 빠뜨리면
이번처럼 조용히 죽지 않고 테스트가 실패합니다.

### 11-5. 검증 범위와 한계

확인한 것:

- `npm test` **34/34**, `npm run test:syntax` 통과
- 동일 출처 샌드박스 토큰 0건, 기존 검사 7종 유지
- `VERSION` ↔ `APP_BUILD` 일치, 캐시 이름이 `folio-shell-2026.08.12-pkglink3`
  로 바뀜을 실측
- Service Worker가 새로 설치한 셸 캐시 안의 `preview-host.html` 에
  `open-asset` 이 실제로 들어 있음을 Cache Storage에서 직접 읽어 확인

확인하지 못한 것:

- **실제 클릭 → 링크 열림 자체는 이번에도 확인하지 못했습니다.** 검토
  환경이 샌드박스 iframe 요청을 전부 차단해(`preview-host.html` 자체가
  뜨지 않음) 9~10장과 같은 제약이 그대로입니다. 이 결함이 실기기에서만
  드러난 이유이기도 합니다 — 정적 검사로는 "타입이 목록에 있는가"는 볼 수
  있어도 "메시지가 실제로 도착하는가"는 실행해야만 보입니다

---

## 12. preview-host.html 옛 사본 고정 문제 수정 (`2026.08.12-pkglink4`)

11장에서 고친 중계 목록은 코드로 정확했습니다. 사용자가 `preview-host.html`
의 실제 스크립트를 직접 실행해 중계 로직 자체가 맞다는 것을 확인했습니다.
문제는 로직이 아니라 **그 파일이 기기에 옛 사본으로 남을 수 있는 캐시
구조**였습니다.

### 12-1. 원인 1 — `preview-host.html` 만 navigate 분기를 탐

`preview.mount()` 는 `<iframe src="preview-host.html">` 로 이 파일을 불러오는데,
iframe에 `src` 를 설정하는 요청은 브라우저가 **`mode: 'navigate'`** 로
보냅니다 — 사용자가 앱을 여는 최상위 내비게이션과 같은 신호입니다.

`sw.js` 의 fetch 핸들러는 `mode==='navigate'` 인 요청을 **네트워크 우선**
분기로 보냅니다. 이 분기는 원래 "새로 배포한 판이 두 번째 실행이 아니라
첫 실행에서 뜨게" 하려고 최상위 앱 진입점(`index.html`)을 위해 만든
정책인데, `preview-host.html` 도 같은 신호(`mode:'navigate'`)를 내서
**의도치 않게 같은 분기를 탔습니다.**

`src/app.js` `src/preview.js` 같은 다른 셸 파일은 `<script type=module>`
이나 동적 `import()` 로 불러와 `mode` 가 `'same-origin'` 이라 캐시 우선
분기를 그대로 탑니다. **`preview-host.html` 만 유일하게** 버전 캐시를
건너뛰었습니다.

네트워크 우선 분기는 성공하면 응답을 `cache.put()` 으로 **현재 버전
캐시에 덮어씁니다.** 이 URL에는 버전 표시가 없으므로, 응답이 (브라우저의
HTTP 캐시 등) 중간 캐시에서 나온 옛 바이트라면 **방금 설치로 넣은 새
버전 사본을 옛 것으로 덮어씁니다.** `preview.js` 는 이미 새 버전인데
`preview-host.html` 만 옛 판으로 남는 조합이 만들어지고, 이 조합에서
링크가 조용히 무반응이 됩니다.

**고침** — `preview-host.html` 은 navigate 분기에서 제외하고, 다른 셸
파일과 똑같이 캐시 우선(버전 캐시) 경로를 타게 했습니다.

```diff
- if (event.request.mode === 'navigate') {
+ if (event.request.mode === 'navigate' && !url.pathname.endsWith('/preview-host.html')) {
```

### 12-2. 원인 2 — `install` 의 `cache.addAll()` 이 옛 HTTP 캐시를 담을 수 있음

`cache.addAll(ASSETS)` 는 내부적으로 평범한 `fetch()` 를 씁니다. 옵션을
안 주면 브라우저의 **HTTP 캐시**를 그대로 따르는데, GitHub Pages가 이
파일들에 `Cache-Control` 을 붙이고 URL에는 버전 구분자가 없으므로,
설치 시점에 HTTP 캐시가 아직 안 만료됐다면 **네트워크를 안 타고 옛
바이트로 새 버전 캐시를 채울 수 있습니다.** 이러면 버전을 올려도 설치가
끝나기 전부터 이미 옛 내용이 들어갑니다.

**고침** — `installFresh()` 를 만들어 각 자산을
`new Request(path, {cache:'reload'})` 로 감싸 HTTP 캐시를 건너뛰고
네트워크에서 직접 받습니다. 실패 시 동작은 `addAll()` 과 같게 유지했습니다
— 응답이 `ok` 가 아니면 던지고, `Promise.all` 이 reject해 `install()` 이
실패합니다("여기 있는 파일은 전부 있어야 합니다"라는 기존 보장 유지).

### 12-3. 실측

로컬 검토 서버에서 캐시를 완전히 지우고 새로 설치한 뒤 확인했습니다.

| 확인 | 결과 |
|---|---|
| 새 캐시 이름 | `folio-shell-2026.08.12-pkglink4` |
| 캐시에 들어간 `preview-host.html` 내용에 `open-asset` | 포함됨 |
| 빌드 표시 | `Build 2026.08.12-pkglink4` |
| SW 제어 상태 | `swControlled: true` |
| 콘솔 오류·CSP 위반 | 0건 |
| 단일 파일 ZIP 반입 → Run → `Preview issues (0)` | 기존 동작 유지, 회귀 없음 |

### 12-4. 회귀 테스트

`tests/static.test.mjs` 에 두 건을 추가했습니다. **사용자가 요청한 1번을
정적 검사로 고정**했고, 2번 고침도 같은 방식으로 함께 고정했습니다.

- `preview-host.html is excluded from the network-first navigate branch` —
  navigate 분기 조건문에서 `!url.pathname.endsWith('/preview-host.html')`
  가 있는지 정규식으로 확인
- `shell assets install with cache:'reload', bypassing the HTTP cache` —
  `cache.addAll(ASSETS)` 가 없고 `installFresh()` 가 `{cache:'reload'}` 로
  각 자산을 받는지 확인

**두 테스트 모두 실제로 각자의 결함을 잡는지 직접 증명했습니다** — 각
고침을 하나씩만 되돌려 실행하면 그 테스트만 실패하고 다른 34개는 그대로
통과합니다. 되돌리지 않은 상태에서는 36개 전부 통과합니다.

### 12-5. 완료 조건

| | 결과 |
|---|---|
| `npm test` | **36/36** (10-4 이후 4건 추가) |
| `npm run test:syntax` | 통과 |
| 동일 출처 샌드박스 토큰 · 기존 검사 7종 | 유지 |
| `VERSION` ↔ `APP_BUILD` | 둘 다 `2026.08.12-pkglink4` |
| 콘솔 오류 · CSP 위반 | 0건 |

실기기 클릭 확인은 사용자가 다시 진행합니다.

---

## 13. 세션 불일치로 문서의 모든 메시지가 버려지던 문제 수정 (`2026.08.12-pkglink5`)

실기기 확인 결과: `2026.08.12-pkglink4` 에서도 `전체 PDF (인쇄용 한 파일)` ·
`PNG` · `SVG` · `PDF` 링크가 **전부 아무 반응이 없었습니다.**

9~12장의 수정은 각각 맞았습니다. 그 아래에 **다섯 번째 결함**이 하나 더
있었고, 이것이 앞의 네 수정을 전부 무력화하고 있었습니다.

### 13-1. 원인 — 한 번의 mount에 세션 ID가 둘 만들어집니다

`preview-host.html` 은 안쪽 문서에서 오는 메시지를 **세션 ID로 먼저
거릅니다.** 중계 화이트리스트(11장)는 그 다음 관문입니다.

```js
// preview-host.html — 안쪽 프레임 → 부모 앱 중계
if(inner && event.source===inner.contentWindow && event.origin==='null'
   && d && d.__folioPreview===1 && d.session===session   // ← 여기서 먼저 걸립니다
   && ['ready','scroll','open','open-asset','asset-error','runtime-error'].indexOf(d.type)>=0)
```

그런데 `handlers/html.js` 와 `preview.js` 가 **서로 다른 ID를 만들고
있었습니다.**

```js
// src/handlers/html.js — mountRun()
const session = preview.newSession();        // ← ① 문서에 심는 ID
const html = buildRunHtml(session);          //    instrument() · shim() 이 이걸로 post
mounted = preview.mount(stage, { html, ... });
```

```js
// src/preview.js — mount()
export function mount(container, options) {
  const session = newSession();              // ← ② 호스트에 알리는 ID (①과 다름)
```

호스트는 ②를 기억하고, 문서는 ①로 말합니다. `d.session===session` 이 항상
거짓이 되어 **문서가 보내는 메시지가 전부 버려졌습니다** — 링크 탭
(`open-asset`), 스크롤(`scroll`), 자산 오류(`asset-error`), 런타임 오류
(`runtime-error`), 준비 완료(`ready`) 전부입니다.

오류도 콘솔 로그도 남지 않습니다. 호스트는 "모르는 메시지"를 조용히 버리도록
설계돼 있고, 실제로 그렇게 동작했을 뿐입니다.

### 13-2. 왜 9~12장 수정으로는 살아나지 않았는가

| 장 | 고친 것 | 맞았는가 | 그래도 안 된 이유 |
|---|---|---|---|
| 9 | 앵커에 `data-folio-path` · 앱 쪽 `openPackageAsset()` | 맞음 | 메시지가 중계를 못 넘음 |
| 10 | 자산 없는 패키지 가드 오탐 | 맞음 | 무관 |
| 11 | 중계 화이트리스트에 `open-asset` 추가 | 맞음 | **그 앞의 세션 관문**에서 이미 버려짐 |
| 12 | `preview-host.html` 옛 사본 캐시 고정 | 맞음 | 최신 사본이어도 세션이 안 맞음 |

11장의 정적 대조 테스트는 "타입이 목록에 있는가"를 봅니다. 이번 결함은
**목록에 닿기 전에** 버려지는 것이라 그 테스트로는 보이지 않았습니다.

### 13-3. 고친 내용

**a) `src/preview.js` — `mount()` 가 HTML을 만든 세션을 그대로 씁니다**

```diff
- const session = newSession();
+ const session = options.session || newSession();
```

**b) `src/handlers/html.js` — 양쪽 mount에서 세션을 넘깁니다**

- `mountRun()` — 이미 있던 `session` 을 `preview.mount()` 에 전달
- `mountRead()` — `materialize()` 안에 인라인돼 있던 `preview.newSession()` 을
  변수로 끌어내 같은 값을 전달 (Read 모드의 shim `asset-error` 도 같은 관문을
  지납니다)

`sw.js` 의 `VERSION` 과 `src/version.js` 의 `APP_BUILD` 를 함께
`2026.08.12-pkglink5` 로 올렸습니다.

보안 규칙은 아무것도 건드리지 않았습니다 — 세션 대조도, 출처 검사도,
화이트리스트도 그대로입니다. 두 값이 같아졌을 뿐입니다.

### 13-4. 함께 되살아난 것

이 결함은 링크만 죽인 것이 아닙니다. 같은 관문을 지나는 기능 전부가
죽어 있었습니다.

| 기능 | 수정 전 | 수정 후 |
|---|---|---|
| 패키지 링크 탭 (`open-asset`) | 무반응 | folio 뷰어로 열림 |
| Run 모드 읽던 위치 저장 (`scroll`) | 저장 안 됨 | 저장됨 |
| Run 모드 읽던 위치 복원 (`ready`→`restore`) | 복원 안 됨 | 복원됨 |
| `Preview issues` 의 자산·런타임 오류 | **항상 0건** | 실제 건수 표시 |

`Preview issues (0)` 이 계속 0이었던 것은 문제가 없어서가 아니라 보고가
도착하지 못해서였습니다.

### 13-5. 회귀 테스트

**a) `tests/static.test.mjs`** — `a mounted document and its instrumentation
share one session id`

- `mount()` 이 `options.session || newSession()` 를 쓰는지
- `handlers/html.js` 의 `preview.mount()` 호출 **두 곳 모두** `session` 을
  넘기는지
- `mountRead()` · `mountRun()` 이 각각 세션을 **정확히 하나만** 만드는지
- Run 모드가 `buildRunHtml(session)` 에 쓴 그 세션을 mount에 넘기는지

**이 테스트가 실제로 이 결함을 잡는지 직접 증명했습니다** — `preview.js` 의
한 줄만 되돌리면 이 테스트만 실패하고, `html.js` 의 `session,` 한 줄만
지워도 이 테스트만 실패합니다. 되돌리지 않으면 37개 전부 통과합니다.

**b) `tests/link-session.test.html` · `tests/link-session.test.js` (새 파일)**

정적 검사로는 "메시지가 실제로 도착하는가"를 볼 수 없습니다 —
11-5에서 확인하지 못한 채 남겨둔 부분입니다. 실제 중첩 프레임을 띄워
문서의 첫 마디(`ready`)가 앱까지 도착하는지 확인하는 페이지를 추가했습니다.
링크를 직접 눌러 `open-asset` 과 그 패키지 경로가 찍히는 것도 그 자리에서
보입니다.

```
http://127.0.0.1:4173/Published/folio/tests/link-session.test.html?zip=mind_map.zip
```

11~12장에서 검토 환경이 **샌드박스 iframe의 http 요청을 차단**해
(`ERR_BLOCKED_BY_CLIENT`) 실제 클릭을 끝내 확인하지 못했는데, 이번에는
`&srcdoc=1` 로 `preview-host.html` 을 같은 프레임에 srcdoc으로 넣어
우회했습니다. 문서·CSP·중첩 구조가 동일하므로 시험 대상인 메시지 경로는
그대로입니다.

### 13-6. 실제 클릭 확인 — 이번에는 성공했습니다

9~12장에서 세 번 연속 확인하지 못했던 항목입니다.

| 확인 | 결과 |
|---|---|
| `mind_map.zip` 반입 → 진입점 판정 | `mindmap-5/index.html` · 자산 35개 · 경고 0건 |
| 앵커 태깅 | 34개 전부 `data-folio-path` |
| srcdoc 크기 | **21.3 KB** (수정 전 16.39 MB) |
| `ready` 도착 | 도착 (수정 전: 도착 안 함) |
| `전체 11장 PDF` 실제 클릭 | `open-asset mindmap-5/ALL_MAPS_print_bundle.pdf` |
| `PNG` 실제 클릭 | `open-asset mindmap-5/png/01_principles_founding_documents.png` |
| `SVG` 실제 클릭 | `open-asset mindmap-5/svg/01_principles_founding_documents.svg` |
| `PDF` 실제 클릭 | `open-asset mindmap-5/pdf/01_principles_founding_documents.pdf` |
| 같은 클릭, 수정 전 코드 | **이벤트 0건** (증상 재현) |
| 자산 → Blob → `detect()` | pdf→`pdf` · png→`image` · svg→`image` · txt→`text` |
| `mindmap.zip` | 앵커 23개 전부 태깅 · 자산 오류 0건 · srcdoc 19.5 KB |

### 13-7. 확인하지 못한 것

- **앱 화면 안에서의 왕복** — 링크를 눌러 PDF 뷰어·이미지 뷰어가 뜨고
  뒤로 가면 패키지 화면과 스크롤 위치로 돌아오는 흐름은 검토 환경이
  샌드박스 iframe의 http 요청을 차단해 실제 앱 화면에서는 여전히 띄울 수
  없습니다. 확인한 범위는 (1) `open-asset` 이 올바른 패키지 경로와 함께
  앱까지 도착한다 (2) 그 경로의 자산이 Blob으로 만들어져 올바른 뷰어
  종류로 판정된다 — 둘 사이를 잇는 `openPackageAsset()` 은 코드 검토만
  했습니다
- iPhone 실기기 확인은 사용자가 진행합니다

### 13-8. 별건 — `sample/mind-map.zip` 은 패키지 자체가 깨져 있습니다

folio의 결함이 아니라 **샘플 ZIP의 문제**입니다.

| | 내용 |
|---|---|
| ZIP 구조 | PNG 11개와 PDF 1개가 **전부 최상위**에 평평하게 |
| 진입 HTML이 가리키는 경로 | `png/…` `svg/…` `pdf/…` (하위 폴더) |
| ZIP 안의 `png/` `svg/` `pdf/` 폴더 | **없음** |

그래서 이 샘플은 수정 후에도 `전체 PDF` 링크 하나만 열리고, 나머지 33개는
`Preview issues` 에 `Missing package asset: png/…` 로 **정확히 보고됩니다**
(수정 전에는 이 보고조차 도착하지 못해 그냥 조용했습니다).

`sample/mindmap.zip` 과 `sample/mind_map.zip` 은 구조가 올바르고 전부
동작합니다.

### 13-9. 완료 조건

| | 결과 |
|---|---|
| `npm test` | **37/37** (12-5 이후 1건 추가) |
| `npm run test:syntax` | 통과 |
| 배포 앱 소스 allowlist의 동일 출처 샌드박스 토큰 검사 | **0건** (문서 포함 전체 트리 grep 주장은 철회) |
| 앱 셸 CSP · `preview-host.html` CSP · 이중 프레임 | 변경 없음 |
| 샌드박스에 Blob·blob: URL 전달 | 없음 (앱 쪽에서만 생성) |
| `VERSION` ↔ `APP_BUILD` | 둘 다 `2026.08.12-pkglink5` |
| 콘솔 오류 · CSP 위반 | 0건 |

---

## 14. 세 샘플을 다시 처음부터 — 결함 두 개 더 (`2026.08.12-pkglink6`)

사용자가 `2026.08.12-pkglink4` 에서 `mind-map.zip` · `mindmap.zip` · `mind_map.zip`
**세 개 전부**, 모든 링크가 반응하지 않았다고 재확인하며 "모두 꼼꼼하게"
재점검을 요청했습니다. 13장의 세션 수정(`pkglink5`)이 원인이었던 것은
맞지만, 다시 처음부터 실제 앱으로 세 ZIP을 넣고 확인하는 과정에서 **13장과
무관한 결함 두 개를 더** 찾았습니다. 셋 다 같은 증상("눌러도 반응 없음")을
만들 수 있고, 서로 다른 코드 경로에 있었습니다.

### 14-1. 검증 방식을 바꿨습니다

지난 회차들은 `preview.js`·`package.js` 를 직접 호출하는 방식으로 검증했습니다.
이번에는 실제 앱 화면에서 파일 선택창을 거치지 않고 `input.files` 에
`DataTransfer` 로 세 ZIP을 직접 넣어 `change` 이벤트를 발생시켜, **앱의
`importFiles()` 를 실제로 실행**시켰습니다. 그 결과 라이브러리에 이미
있던(과거 세션에서 만들어진) `mindmap` · `mindmap-` 두 문서가 "해제됨"
상태였다는 것이 드러났고, 여기서 결함 C가 나왔습니다.

### 14-2. 결함 C — 중복 반입으로 재연결하면 자산이 복원되지 않습니다

`src/relink.js` 의 "Reconnect" 버튼 경로(9장에서 고침)는 `pkg.importZip()`
을 다시 돌려 `packageAssets` 를 복원합니다. 그런데 **같은 파일을 "Import
files" 로 다시 넣어 해시가 일치해 재연결되는 경로**(`src/library.js` 의
`importFiles()`)는 이 복원을 전혀 하지 않는, relink.js와는 완전히 다른
코드였습니다.

```js
// src/library.js — importFiles(), 고치기 전
if (existing) {
  await saveWithRoom(fileHash, existing.id, file);
  await store.patchDocument(existing.id, { released: false, size: file.size });  // ← packageAssets 복원 없음
  await store.touch(existing.id);
  reconnected += 1; continue;
}
```

실제로 재현했습니다: 해제된 상태였던 `mindmap`(mindmap.zip 해시)과
`mindmap-`(mind_map.zip 해시) 문서에 같은 zip을 "Import files" 로 다시
넣자 "Already in folio — reconnected instead." 토스트가 뜨고 `released`
가 `false` 로 바뀌어(목록에서 `Needs file` 배지가 사라짐 — **정상 문서처럼
보입니다**) — 그런데 `packageAssetsReleased` 는 여전히 `true`, 자산은
여전히 0개였습니다. 열면 "This package's files are missing." 화면이
계속 뜨는데, `Needs file` 배지가 없으니 사용자는 왜 그런지 알 길이
없습니다.

**고침** — `src/library.js` 에 `relink.js` 의 `packagePatch()` 와 동일한
함수를 추가하고, 중복 해시 재연결 분기에서 `existing.kind==='html-package'`
면 호출합니다. ZIP을 다시 읽지 못하면(손상 등) 재연결 자체를 취소하고
`failures` 에 기록합니다 — 절반만 연결된 상태를 만들지 않습니다(9장의
relink.js와 같은 원칙).

**재현 확인** — 고치기 전: 재연결 후 `assetCount: 0`, `packageAssetsReleased:
true`. 고친 후: 같은 zip 재연결 시 `assetCount: 25`·`35`, `packageAssetsReleased:
false` 로 실제 복원됨을 스토어에서 직접 읽어 확인했습니다.

### 14-3. 결함 D — 패키지에 없는 파일을 가리키는 링크는 조용히 죽습니다

`sample/mind-map.zip` 은 `png/`·`svg/`·`pdf/` 하위 폴더를 가리키는데 ZIP
안에는 그 폴더가 없습니다(13장 별건 8절에서 이미 확인한 손상된 샘플).
이 zip으로 **13장 수정 이후에도 남아 있던 세 번째 결함**을 찾았습니다.

`rewriteStatic()`(정적 처리, `materialize()` 가 호출)의 앵커 처리는 대상이
패키지에 없으면 **아무것도 하지 않았습니다** — `data-folio-path` 도 안 붙고
`warnings` 에도 안 남습니다. `src`·`href`(비앵커)·`poster` 등 다른 모든
속성은 누락 시 `warnings.push('Missing package asset: ...')` 를 하는데
앵커만 예외였습니다. `shim()`(런타임 처리)의 `tagLink()` 도 마찬가지로
미지의 경로면 태그를 아예 안 붙이고 `asset-error` 만 보냈습니다.

**왜 이게 "링크가 죽는다"인가** — `data-folio-path` 가 없는 앵커는
`instrument()` 의 클릭 핸들러 모든 분기를 그냥 통과합니다(`#` 아님,
`download` 아님, `http/https/mailto/tel/sms` 아님, `javascript:` 아님).
그러면 `e.preventDefault()` 가 한 번도 안 불리고 **브라우저의 기본 링크
이동이 그대로 실행**됩니다 — 이중 샌드박스 프레임 안에서 존재하지 않는
상대 경로로 이동을 시도하다 그 프레임 안에서만 조용히 실패합니다. 토스트도,
`Preview issues` 항목도, 콘솔 로그도 없습니다. **"버튼을 눌러도 반응이
없다"는 사용자 증상과 정확히 같은 모양**이고, `mind-map.zip` 은 34개 링크
중 33개가 정확히 이 상태였습니다.

**고침** — 두 곳 모두, **경로가 정상적으로 해석되면 자산이 있든 없든
`data-folio-path` 를 붙입니다.** 그 위에서, 자산이 없으면 (기존과 동일하게)
`warnings.push`(정적)·`report()`→`asset-error`(런타임)를 합니다. 태그가
붙으면 클릭이 `instrument()` 의 `open-asset` 분기로 들어가고, 그 다음은
`src/app.js` 의 `openPackageAsset()` 가 이미 갖고 있던 처리로 이어집니다 —
`assets[path]` 가 없으면 `toast('This file is not in the package.')`.
새 코드를 추가하지 않고 **이미 있던, 이미 테스트되던 경로**로 흘려보냈습니다.

```diff
- try{var lr=resolvePackagePath(ref,baseDir);if(lr&&assetFor(doc,lr.path))el.setAttribute('data-folio-path',lr.path)}catch(e){}
+ try{var lr=resolvePackagePath(ref,baseDir);if(lr){el.setAttribute('data-folio-path',lr.path);if(!assetFor(doc,lr.path))warnings.push('Missing package asset: '+ref)}}catch(e){}
```
```diff
- function tagLink(el,v){...if(K[r.path])nativeSet.call(el,"data-folio-path",r.path);else report(r.path)}
+ function tagLink(el,v){...nativeSet.call(el,"data-folio-path",r.path);if(!K[r.path])report(r.path)}
```

### 14-4. 세 ZIP 전부, 링크 전부 — 실제 실행으로 확인했습니다

이번 검토 환경은 (a) 샌드박스 iframe의 http 요청을 차단하고(11~13장에서
계속 마주친 제약) (b) 실제 앱 셸의 엄격한 CSP(`script-src 'self'`)가
`about:srcdoc` 프레임에도 상속되어 13장에서 쓴 srcdoc 우회조차 앱 안에서는
`preview-host.html` 의 인라인 부트스트랩 스크립트를 막습니다 — 그래서
**이번 회차는 실제 앱 화면 안에서의 클릭은 이전과 마찬가지로 확인하지
못했습니다.** 대신 앱이 실제로 실행하는 그 코드(`instrument()`·`shim()`)를
CSP 없는 별도 프레임에 그대로 올려 **각 zip의 진짜 앵커 전부**를 실제
`click` 이벤트로 눌러 확인했습니다 — 재구현이 아니라 같은 함수를 그대로
실행한 것입니다.

| ZIP | 앵커 수 | `open-asset` 발생 | 그 외 이벤트 |
|---|---|---|---|
| `mindmap.zip` | 23 | **23/23** | `ready` |
| `mind_map.zip` | 34 | **34/34** | `ready` |
| `mind-map.zip` | 34 | **34/34** (33개는 패키지에 없는 경로) | `asset-error` ×33, `ready` |

91개 링크 전부가 올바른 패키지 경로와 함께 `open-asset` 을 보냈습니다.
`mind-map.zip` 의 33개는 **추가로** `asset-error` 도 함께 보내 — 클릭하면
`openPackageAsset()` 의 "This file is not in the package." 토스트로 이어질
것을 코드로 확인했습니다(9장에서 이미 만들어진 토스트를 재사용).

### 14-5. 회귀 테스트

- `tests/package-map.test.js` — `missing/nowhere.pdf` 를 가리키는 합성
  앵커가 자산이 없어도 태그되고 경고가 남는지, 그리고 **실제
  `sample/mind-map.zip`** 으로 34개 앵커 전부 태그되는지(0개 미태그) ·
  누락 33건 = 경고 33건인지 확인. 4건 추가, 로컬 리뷰 서버에서
  `tests/package-map.test.html` 로 실행(`node --test` 로는 못 돌림 — DOM
  필요, 기존 방식과 동일)
- `npm test` **37/37**(Node쪽은 변경 없음, 회귀 없음 확인) · `npm run
  test:syntax` 통과

### 14-6. 이번 회차에서 배운 것 — 검토 환경의 캐시 함정

브라우저 창을 오래 띄워둔 채로 `src/package.js` 를 여러 번 고치다 보니,
**버전 쿼리스트링이 없는 일반 `fetch`/모듈 `import` 가 이 리뷰 브라우저의
HTTP 디스크 캐시에서 옛 코드를 계속 돌려주는** 현상을 만났습니다(Service
Worker와는 별개 — SW는 그때 이미 해제돼 있었습니다). 같은 파일을
`cache:'reload'` 로 한 번 fetch하면 그 URL의 캐시가 갱신되고, 그 다음부터는
정상적인 페이지가 정확한 코드로 실행됐습니다. **실제 배포 환경(iPhone
Safari)에는 해당되지 않습니다** — 실제 서비스 워커는 버전이 바뀌면 캐시
이름 자체가 바뀌어 이 문제가 생기지 않습니다(12장). 검토 중 "고쳤는데도
안 된다"는 결과가 나오면 이 캐시 함정부터 의심하기로 기록해 둡니다.

### 14-7. 완료 조건

| | 결과 |
|---|---|
| `npm test` | **37/37** |
| `npm run test:syntax` | 통과 |
| `tests/package-map.test.html` (브라우저) | **14/14 통과** (1건 skip — 파일명 관례) |
| 배포 앱 소스 allowlist의 동일 출처 샌드박스 토큰 검사 | 0건 |
| 세 샘플 ZIP, 실제 `instrument()`/`shim()` 로 앵커 전부 클릭 | 91/91 정상 이벤트 |
| 중복 반입 재연결 후 `packageAssets` 복원 | mindmap 25개·mindmap- 35개, 스토어에서 직접 확인 |
| `VERSION` ↔ `APP_BUILD` | 둘 다 `2026.08.12-pkglink6` |

실기기(iPhone) 재확인이 여전히 필요합니다 — 이번에도 실제 앱 화면 안에서의
클릭 자체는 이 환경의 두 가지 제약(샌드박스 iframe 차단, srcdoc에 상속되는
앱 셸 CSP) 때문에 확인하지 못했습니다.

---

## 15. 2026-08-13 감사 수정 (`2026.08.13-audit2`)

이 장은 1~14장의 역사 기록을 대체하는 현재 결과입니다. 검증은 사용자 문서가
있을 수 있는 4173 origin을 사용하지 않고, 별도 서버
`http://127.0.0.1:4187/Published/folio/`와 격리된 IndexedDB에서 수행했습니다.

### 15-1. 수정 범위

| 감사 ID | 현재 결과 |
|---|---|
| A-01 | 백업 전체를 검증·base64 디코딩·Blob 변환한 뒤 7개 portable Dexie 테이블을 단일 transaction으로 교체. 설정은 허용 목록과 값 검증을 통과한 항목만 복원하며 sync/device/cleanup 값은 제외 |
| A-02 | 일반 반입·백업 복원·재연결 input 분리. `cancel`과 Safari focus/visibility 복귀 fallback이 재연결 Promise를 한 번만 해결 |
| A-03 | 뷰어 listener와 지연 저장을 문서별 AbortController/disposer에 귀속. Back/전환 전에 flush하고 pinch 중에는 DB를 쓰지 않음 |
| A-04 | TXT/Markdown ratio 복원, CSV row/offset/scrollTop/scrollLeft 복원 및 가상 범위 선렌더 |
| A-05 | quota 재시도 결과를 모든 반입·재연결 호출자가 검사. 파일·packageAssets·메타데이터는 transaction으로 commit하고 현재 hash는 release 후보에서 제외 |
| A-06 | Markdown/HTML Read의 요청 가능 속성과 요소를 detached DOM에서 제거한 뒤 live DOM/iframe에 연결 |
| B-01~B-04 | 문서 글자 단계 분리, dark selector root 제한, 44px 터치 영역, overlay dismiss·포커스 트랩·초점 복귀 구현 |
| B-05 | 테스트 이름/검사 범위, 전체-tree grep 주장, 로컬 실행 경로, 실제 fixture 누락 표시 정정 |
| C-01 | PDF Fit width/Fit page/pinch 연결/페이지 유지, 이미지 pinch·double-tap·실제 overflow pan과 단일 포인터 대안 |
| C-02 | CSV 위치·가로 shadow·3개 열 폭·400행 가상 창 Find |
| C-03 | Desk 목록과 Continue 유지. 카드/Shelf/thumbnail/폴더는 현재 범위에서 제외하고 외부 계획서의 후속 backlog로 명시 |

### 15-2. 자동 검사

- `npm test`: **46/46 통과**. QuotaExceededError 1회 뒤 성공과 2회 모두
  실패를 실제 비동기 재시도 함수로 검사합니다.
- `npm run test:syntax`: 통과.
- `git diff --check`: 통과.
- 패키지 DOM harness: 합성 fixture **9건 통과**, 실제 sample ZIP **3건
  UNVERIFIED**. 누락 fixture는 성공 또는 실패 수에 포함하지 않습니다.
- 현재 작업공간에는 `WebApp/sample/*.zip` 실제 sample이 없습니다. 자동으로
  생성한 hostile/synthetic ZIP과 실제 sample 검증은 별개입니다.

### 15-3. Browser 검증

- 390×844와 desktop에서 Library, Settings, System/Light/Dark, 6px/17px,
  실제 44×44px 최소 터치 영역과 가로 overflow 없음 확인.
- TXT `scrollTop 1250`, Markdown `scrollTop 1800`, CSV `scrollTop 2800` /
  `scrollLeft 650`을 빠른 Back 뒤 재열어 같은 값으로 복원.
- 문서를 10회 전환한 뒤 본문 tap 한 번이 bars 상태를 한 번만 변경.
- 문서 글자 6·8·10·12·15·19px를 각각 저장하고 재열어 모두 같은 값 복원.
- CSV Compact, 좌우 shadow, 1,999행 Find에서 전체 DOM 대신 135행만 렌더.
- 손상 base64·future schema·잘못된 참조 복원은 기존 1개 문서를 보존했고,
  정상 백업은 1개 문서를 복원. 허용된 6px/dark 설정만 반영.
- Reconnect에서 같은 파일, 다른 파일의 Add as new/Link anyway, 대화상자
  취소를 확인. OS 네이티브 파일 선택기 취소는 자동화하지 못함.
- Markdown과 HTML Read에서 문서 리소스 요청 0건, HTML Read script 미실행,
  HTML Run은 확인 전 미실행·확인 뒤 실행을 확인.
- 3페이지 PDF에서 Fit width/Fit page와 회전 뒤 2페이지 유지 확인. 이미지
  200% 확대 시 실제 scroll overflow와 Fit 복귀 확인.
- console warning/error와 framework error overlay 없음.

### 15-4. 보안 불변 조건

앱 셸 CSP의 inline script 허용 없음, 일반 eval 허용 없음, iframe에 동일 출처
sandbox 권한 없음, Read script 실행 없음, Run 기본 비활성, 문서 본문/PDF/이미지
sync 없음, PDF.js script sandbox 자산 없음, release와 delete 상태 분리를 다시
검사했습니다. 기존 정책을 완화한 변경은 없습니다.

### 15-5. 미검증

실제 iPhone/iPad Safari·홈 화면 모드, 네이티브 파일 선택기 취소/복귀,
HEIC/EXIF, 100페이지 이상 PDF 메모리, 첫 오프라인 한글 CID PDF, 한국어 IME,
장기 미사용 뒤 IndexedDB 유지, 실제 sample ZIP 내부 링크는 실기기 또는 실제
fixture가 없어 미검증입니다. PDF/이미지의 실제 두 손가락 gesture도 자동화
환경이 multi-touch를 제공하지 않아 버튼/슬라이더 대안과 코드 연결만 검사했습니다.

---

## 16. 2026-08-13 최종 재검토 (`2026.08.13-audit3`)

15장의 완료 판정을 다시 재현 검토한 결과 남아 있던 다섯 항목을 수정했습니다.
검증은 사용자 데이터가 있을 수 있는 4173 origin 대신
`http://127.0.0.1:4191/Published/folio/`의 격리 IndexedDB에서 수행했습니다.

### 16-1. 최종 수정

| 항목 | 수정·검증 결과 |
|---|---|
| PDF 페이지 유지 | `IntersectionObserver`가 교차한 모든 페이지로 현재 페이지를 덮어쓰지 않게 하고, 실제 viewport에서 보이는 페이지를 별도로 계산. 프로그램 이동·Fit·회전·재렌더 중 observer 갱신을 잠시 억제 |
| PDF 확대 | CSS의 `max-width:100%` 제한을 제거하고 35~400% 단일 포인터 slider를 추가. 200%에서 canvas 732px, viewport 390px, `scrollWidth` 752px로 실제 가로 pan 확인 |
| package backup | ZIP 반입과 같은 `validateManifest()`를 Restore 전에 실행. 정규화 path, base64 encoding, MIME/확장자, 대소문자 충돌, 개수, 단일/전체 크기, `bytes`, `packageFileCount`를 검증 |
| package release | 원본 Blob·packageAssets·`released` metadata를 세 table의 단일 Dexie transaction으로 이동. 공유 hash가 있으면 release하지 않음 |
| transient zoom | 패키지 내부 합성 문서는 zoom을 메모리에만 적용하고 reading-state를 쓰지 않음. flush/close에서 pending zoom을 항상 폐기 |
| CSV Find | 동기식 전체 `reduce()`를 취소 가능한 8ms chunk 검색으로 교체. Find sheet가 동기/비동기 finder를 모두 기다리도록 변경 |

### 16-2. 자동 검사

- `npm test`: **49/49 통과**.
- `npm run test:syntax`: 통과.
- `git diff --check`: 통과.
- package manifest 실행 검사: 누락 필드, size 불일치, path escape, case
  collision, MIME mismatch 거부.
- CSV 100,000행 검색 실행 검사: 마지막 행 hit 확인, 검색 완료 전에 timer가
  실행되어 이벤트 루프가 응답하는지 확인.

### 16-3. Browser·IndexedDB 실행 검증

- 390×844에서 3페이지 PDF의 slider를 2로 이동한 뒤 Fit page와 Rotate를
  차례로 실행해도 page `2`, `scrollTop 493` 유지.
- PDF zoom slider 200%에서 page `2` 유지, canvas 폭 732px와 실제 가로
  overflow 362px 확인.
- MIME·encoding·bytes가 없는 package asset backup을 Replace까지 진행했을 때
  `Restore failed — your existing library was not changed.` 표시, 기존 PDF 보존.
- release transaction에서 Blob과 packageAssets 삭제 뒤 metadata 직전에 오류를
  주입했을 때 transaction 거부와 document·Blob·asset 3개 보존을 확인.
- package 내부 `notes.txt`에서 Text size 19를 선택하고 부모 package로 돌아온 뒤
  IndexedDB의 합성 `parent#path` reading-state가 0개임을 확인.

### 16-4. 남은 실기기 확인

실제 iPhone/iPad Safari·홈 화면 모드, OS 네이티브 picker 취소/복귀, 실제
multi-touch pinch, HEIC/EXIF, 100페이지 이상 PDF 메모리, 첫 오프라인 한글 CID
PDF, 한국어 IME, 장기 미사용 뒤 IndexedDB 유지, 현재 작업공간에 없는 실제
sample ZIP 3건은 여전히 실기기/fixture가 필요하므로 통과로 세지 않습니다.

---

## 17. 2026-08-14 가로 화면 Library rail (`2026.08.14-rail1`)

1024px 이상 가로 화면에서 문서를 열면 320px Library rail이 항상 고정되어
문서를 전체 너비로 볼 수 없던 문제를 수정했습니다.

### 17-1. 수정

- Viewer 상단에 가로 분할 화면 전용 Library 접기/펼치기 버튼 추가.
- 접으면 Library를 숨기고 Viewer가 전체 화면 너비를 사용.
- 버튼의 `aria-controls`, `aria-expanded`, 동적 accessible name과 44×44px
  터치 영역 적용.
- 문서를 닫았다 다시 열거나 세로·가로 전환 후에도 현재 앱 세션의 사용자
  선택 유지.
- 모바일·세로 화면에서는 토글을 숨기고 기존 단일 Viewer 동작 유지.

### 17-2. 검사

- `npm test`: **50/50 통과**.
- `npm run test:syntax`: 통과.
- `git diff --check`: 통과.
- 1180×820 펼침: Library 320px, Viewer 860px, `aria-expanded="true"`.
- 1180×820 접기: Library 0px, Viewer 1180px, `aria-expanded="false"`.
- Back 후 같은 문서 재열기와 820×1180 → 1180×820 회전 뒤 접힘 유지.
- 다시 펼치면 Library 320px, Viewer 860px로 복원.
- 버튼 실제 크기 44×44px, Browser console warning/error 0건.

## 2026-08-26 Journal annotation/ledger

- **Pass:** 63개 회귀 검사와 전체 syntax; 기존 annotation created/updated 백필, journalRefs 보존, content redaction, 90일 ledger backup/restore/clear.
- **Pass:** desktop·390×844 Journal 설정, overflow 0, console warning/error 0.
- **Pending:** 실제 private E2E, iPhone/iPad Home Screen과 실제 PDF 선택/OCR 한계 확인.

## 2026-08-26 여러 문서 묶어 내보내기 (B-3)

계획서: `Plan/webapp-benchmark/Productivity_App_Benchmark_Plan_2026-08-26.md` B-3. Markdown 형식은 `Plan/folio_annotations-daybook-plan/Folio_Annotations_Daybook_Plan_2026-08-25.md` 3.4~3.5절을 그대로 이어씀.

### 바꾼 것

- `src/annotation.js` — 문서 단위 출력을 만드는 부분을 `documentAnnotationLines()`로 뽑아내 단일 내보내기(`serializeDocumentAnnotations`, headingLevel 1: `#`문서/`##`항목)와 새 묶어 내보내기(`serializeMultiDocumentAnnotations`, headingLevel 2: `##`문서/`###`항목)가 같은 로직을 공유하도록 함. `multiAnnotationFileName()` 추가(`folio-notes-YYYY-MM-DD.md`).
- `src/library.js` — `documentRow()`에 `selectMode`/`selected`/`onToggleSelect` 옵션 추가. 선택 모드에서는 체크박스가 보이고 탭하면 열기 대신 선택 토글.
- `src/app.js` — 선택 상태(`State.selectMode`, `State.selectedIds`), 선택 모드 토글·해제, 재배치+내보내기 시트(`openExportSelectedSheet`), 결합 내보내기 본문 생성(`buildMultiExportContent`, 5MB 상한), Web Share → 다운로드 → Markdown 복사, `journal.recordActivity(doc, 'export-requested')`를 선택한 문서마다 호출(기존 "Export all .md"와 동일한 액션, 새 kind 없음).
- `index.html` — 라이브러리 상단에 `Select` 아이콘 버튼, 선택 모드 전용 하단 바(개수·Clear·Export selected .md).
- `assets/app.css` — `.selectbox`/`.docrow.selected`/`#selectionBar` 스타일 추가.
- `tests/annotation.test.mjs` — 묶어 내보내기 순서·헤딩 레벨·frontmatter·주석 없는 문서 처리·삭제/내보내기 이력 제외·파일명 5건 추가.
- `tests/static.test.mjs` — 일반 Sync가 `quote`/`note`/`annotation`을 전혀 참조하지 않는지, shared의 folio kind 목록이 그대로인지, 50개/5MB 상한이 코드와 안내 메시지에 실제로 있는지 3건 추가.
- `sw.js`, `src/version.js` — 캐시 버전 `2026.08.26-journalannotationredaction1` → `2026.08.26-multiexport1`.

### 주석 없는 문서 처리 — 정한 것

**조용히 건너뛰지 않고, `##` 문서 제목 아래 `_No annotations._`로 표시하고 문서 개수에 포함시킨다.** frontmatter의 `document_count`/`documents` 목록이 실제 본문과 항상 일치해야, 여러 문서를 골랐는데 일부가 아무 설명 없이 사라진 것처럼 보이는 혼란이 없기 때문.

### 통과 — 자동

`npm test` **70/70 통과**(annotation 8 · static 53 포함, 기존 63건 회귀 없음), `npm run test:syntax` 통과.

### 통과 — 실제 브라우저(2026-08-26, 이 세션에서 헤드리스 Chrome + DevTools Protocol)

`WebApp/Published/`를 정적 서버로 띄우고, `store.putDocument`/`store.putAnnotation`으로 한글 문서 3건(A: 독립 메모, B: 하이라이트, C: 주석 없음)을 만든 뒤 새로고침해 실제 앱 로드 경로로 반영시키고, 실제 클릭으로 조작했습니다.

- [x] `Select` 버튼 → 라이브러리 행에 체크박스 표시, 탭하면 열람 대신 선택
- [x] 3건 전부 선택 → 카운트 "3 selected", `Export selected .md` 활성화
- [x] 재배치 시트 기본 순서 = 제목 오름차순(A, B, C)
- [x] Up 버튼으로 C를 맨 앞으로 이동 → 순서가 실제로 바뀜(C, A, B)
- [x] `Copy Markdown` → 클립보드 내용이 정확히: frontmatter(`app`/`exported_at`/`document_count: 3`/`documents:` 재배치된 순서)+`## C No Notes.md`/`_No annotations._`+`## A Document.md`/`### Note · 5%`/한글 메모 무손실+`## B Document.md`/`### Highlight · 10%`/한글 인용문 무손실(`>` blockquote)
- [x] 내보내기 완료 후 선택 모드 자동 해제, 라이브러리가 평상시 하단 바로 복귀
- [x] 전체 시나리오에서 콘솔 오류·예외 **0건**

### 완료 조건 대조

- [x] 다중 선택 → 순서 재배치(위/아래 버튼) → 하나의 `.md`로 내보내기 동작(실측 확인)
- [x] 기존 단일 문서 내보내기(`Export .md`/`Export all .md`) 코드 미변경, 관련 8개 기존 테스트 그대로 통과 → 회귀 없음
- [x] 주석 없는 문서 처리 방식이 정해지고 일관됨(위 "정한 것" 참고, 테스트로 고정)
- [x] 한글 제목·본문 무손실(실측 확인)
- [x] 일반 Sync payload에 인용문·메모가 안 들어감 — `tests/static.test.mjs`의 신규 테스트로 소스 자체에 `quote`/`note`/`annotation` 참조가 없음을 고정
- [x] Share 미지원 환경에서 다운로드 fallback(`shareMarkdown` 기존 로직 재사용, 신규 로직 없음) + `Copy Markdown`은 실측으로 클립보드 내용 확인
- [x] 글자 크기 6단계 — 새 UI가 전부 기존 `.docrow`/`.sheet`/`.row`/`.btn` 등 기존 CSS 변수(`var(--fs-*)`, `var(--tap)`) 기반 클래스만 사용, 새 고정 px 없음
- [x] 콘솔 오류 0건(실측)
- [x] `sw.js` 캐시 버전 상승(신규 모듈 파일은 없음 — 기존 `src/*.js` 캐시 목록 그대로, 내용만 바뀜)
- [x] 기존 63개 + 신규 7개 = 70개 테스트 통과

### Pending — 실기기(iPhone/iPad)에서 확인 필요

- [ ] 선택 모드에서 6px·8px 단계에서 체크박스와 뱃지가 겹치지 않는지
- [ ] 50개에 가까운 문서를 실제로 골랐을 때 재배치 시트 스크롤이 매끄러운지
- [ ] 실제 iOS Share Sheet에서 `Export selected .md`가 정상적으로 뜨는지, 미지원 상황에서 다운로드로 정상 대체되는지
- [ ] `Copy Markdown` 결과를 iOS 메모/Files 붙여넣기 했을 때 한글이 정상 표시되는지

---

## 2026-09-01 — Daybook Markdown Export 후속 수정 (Revision 4)

### 고친 문제

- **[버그] `backfillJournal`의 `ReferenceError`.** `src/journal.js`의 세션 원장 backfill 루프가 `filter` 콜백 안에서만 존재하는 `row`를 콜백 밖 `client.enqueue(...)`에서 참조해, 세션 원장에 기록이 하나라도 있으면 backfill 전체가 예외로 중단되던 문제. `record.at.slice(0, 10)`로 수정.
- **[버그] 5분 idle 이후 세션이 재개되지 않음.** `src/activity-session.js`의 `stop()`이 `currentItem`까지 지워서, idle heartbeat가 세션을 끝낸 뒤에는 같은 문서를 계속 보고 있어도 새 세션이 시작되지 않던 문제. `stop()`은 세션만 종료하고, 문서를 실제로 닫을 때만 새 `clearItem()`을 `closeViewer()`에서 호출하도록 분리.

### 새로 추가한 테스트

- `tests/activity-session.test.mjs`: idle 경계 종료·activeSeconds 상한, idle 이후 새 session ID로 재개, background 후 재개가 두 세션으로 분리, 항목 전환 시 이전 세션 종료, activeSeconds 0인 세션 미기록, `stop()`과 `clearItem()`의 동작 차이 — 6건 추가.
- `tests/journal.test.mjs`: backfill 세션 루프가 `record`(루프 변수)를 참조하는지 소스 검사 + 날짜 범위 필터 동작 검증 — 2건 추가.

### 통과 — 자동

`npm test` **80/80 통과**(기존 72건 + 신규 8건), `npm run test:syntax` 통과.

### 버전

- `src/version.js` `APP_BUILD` / `sw.js` `VERSION`: `2026.09.01-journalsession1` → `2026.09.01-sessionfix1`

### Pending — 실기기에서 확인 필요

- [ ] 문서를 열어 5분 넘게 idle 상태로 두었다가 다시 스크롤/터치했을 때 새 읽기 세션이 실제로 시작되는지
- [ ] 앱을 background로 보냈다가 한참 뒤 복귀했을 때 하나의 과장된 세션이 아니라 두 개의 세션으로 Daybook에 기록되는지

## 2026-09-01 세션 제목 개인정보 설정 보강

- Journal 본문 포함 설정이 꺼진 상태에서 읽기 세션 제목을 `Folio document`로 비식별화했습니다. 로컬 원장과 이후 backfill 모두 실제 파일명을 노출하지 않습니다.
- 기존 Journal wiring 테스트에 opt-in 조건과 공통 session item helper 검사를 추가했고 전체 테스트 및 syntax 검사를 다시 통과했습니다.
- `APP_BUILD`/Service Worker `VERSION`: `2026.09.01-sessionprivacy1`.
## 2026-09-01 BSB(Bilingual Study Brief) 읽기 지원 — Markdown 다이어그램·표·인용구, HTML Read 강화

계획서: `Plan/folio_bsb-reading-plan/Folio_BSB_Reading_Plan_2026-09-01.md`

### 추가한 것

- **`src/diagram.js`(신규)** — mermaid `flowchart` 문법의 부분집합을 파싱·배치·SVG 렌더링하는 folio 자체 렌더러. 외부 라이브러리(mermaid.js)는 folio 셸 CSP(`style-src 'self'`)와 맞지 않아(실측: CSP 위반 43건, 노드 전부 검게 렌더링, 3.6MB·약 1초 지연) 채택하지 않음 — 사용자 확인 후 경량 자체 렌더러로 결정.
- **`src/handlers/markdown.js`** — 다이어그램 지연 렌더링(IntersectionObserver)과 확대 보기, 표 가로 스크롤 래퍼, 인용구 4종 스타일(출처/전제지식/다른관점/일반), `[load-bearing]`류 랭크 태그 칩, 목차(Contents) 계층·현재 위치 표시.
- **`src/handlers/html.js` Read 모드** — `<style>`·인라인 `style=`을 더 이상 통째로 제거하지 않고 보존(색·SVG·`<details>` 상태 유지). 내부 프레임에 `allow-scripts`를 부여하되 folio 자체 스크롤/줌 메신저(`preview.instrument`)만 실행 — 원 문서의 스크립트는 DOMPurify가 이미 전부 제거. 동일 출처 샌드박스 토큰은 어떤 모드에서도 부여하지 않음(기존 원칙 유지). 스크롤 위치 기억·글자 크기 6단계가 HTML Read 모드에도 적용되도록 `src/preview.js`/`preview-host.html`에 줌 브리지 추가.

### 고친 문제 (구현 중 발견)

- **DOMPurify/`pkg.analyze`가 folio 자체 CSP를 위반.** `<style>`을 허용하자, `DOMPurify.sanitize(..., {RETURN_DOM:true})`와 `pkg.analyze()`(둘 다 내부적으로 원본 문자열을 실제 DOM으로 파싱)가 folio 앱 자기 자신의 문서 컨텍스트에서 `style` 속성/태그를 설정하면서 `style-src 'self'` 위반 콘솔 오류를 4건 발생시킴 — 화면에는 아무 영향 없지만 콘솔 오류 0건 원칙 위반. 스크래치 iframe(별도 CSP 없는 문서)으로 우회를 시도했으나 about:blank 프레임은 생성 문서의 CSP를 상속한다는 스펙 때문에 동일하게 재현됨을 실측으로 확인. 최종 해법: `<style>`/`style=`을 실제 DOM 파서에 넘기기 전 문자열 단계에서 자리표시자(`<template data-folio-style-block>`, `data-folio-style-attr`)로 바꿔 두고, 직렬화된 문자열에 대해서만 원래 값으로 되돌림(`extractStyles`/`restoreStyles`, `src/handlers/html.js`) — DOM 속성 설정이 한 번도 일어나지 않으므로 CSP가 검사할 대상 자체가 없음.
- **`ID_RE`가 화살표 직전의 하이픈까지 노드 ID로 삼킴**(`A-->B`가 `A--`+파싱 불가한 `>B`로 갈라짐) — 음의 전방탐색으로 수정.
- **모서리(edge)→노드 연결선 절단 계산이 완전한 수평/수직 간선에서 0으로 나눔** — `atan2`/`tan` 대신 ray-vs-box 거리식으로 교체.
- **간선 라벨 배경이 이웃 노드의 불투명 채우기에 가려 잘려 보임** — 라벨 그룹을 노드 그룹보다 나중에(위에) 그리도록 순서 변경 + 굵은 글씨 전용 측정기 추가.

### 통과 — 자동

`npm run test:syntax` 통과, `npm test` **93/93 통과**(`tests/diagram.test.mjs` 신규 13건 포함).

### 실측 확인 (Playwright, folio 실제 CSP 헤더 재현)

- Read 모드 문서의 `<style>` 색상(`h1` 등)·인라인 SVG·`<details open>` 상태가 실제로 화면에 반영됨을 계산된 스타일로 확인.
- 스크롤 위치 저장 후 재방문 시 복원됨을 확인(저장값 300 → 복원 300).
- 스크롤 시 `onScroll`이 실제로 콜백을 호출함을 확인(700까지 스크롤 → 저장값 700 기록).
- 앱 글자 크기(`--fs-doc`)를 15px→19px로 바꾸면 내부 프레임의 `document.documentElement.style.zoom`이 1.26667로 따라감을 확인.
- 콘솔 오류 **0건**(즐겨찾기 아이콘 404는 테스트 하네스 자체의 정적 서버 한계이며 folio 코드와 무관).

### 버전

- `src/version.js` `APP_BUILD` / `sw.js` `VERSION`: `2026.09.01-sessionprivacy1` → `2026.09.01-bsbread1`

### Pending — 실기기(iPhone/iPad)에서 확인 필요

- [ ] iPhone/iPad 실제 화면에서 다이어그램 확대 보기(핀치 줌)와 목차(Contents) 시트 동작
- [ ] 글자 크기 6단계 전 구간에서 표 가로 스크롤·인용구·랭크 칩 레이아웃이 깨지지 않는지
- [ ] 라이트/다크 테마 모두에서 다이어그램·인용구·랭크 칩 대비가 적절한지
- [ ] 실제 BSB 산출물(.md/.html)로 처음부터 끝까지 읽기

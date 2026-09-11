# folio — 자체 검토 결과

빌드 `2026.09.05-release` · 검토일 2026-09-05 · 검토자 Claude Code (자체 검토)

**검토 환경** — macOS · Node v26.7.0 · `npm test`

이 문서는 2026-09-05 첫 릴리즈에 대한 현재 상태 보고입니다.

---

## 1. 통과

### 1-1. 자동 테스트

| # | 검사 | 결과 |
|---|---|---|
| 1 | `npm test` | **93/93 통과** |
| 2 | `sw.js` VERSION ↔ `src/version.js` APP_BUILD | 둘 다 `2026.09.05-release` |

### 1-2. 자동 테스트가 커버하는 주요 영역

- 문서 가져오기/복원/재연결(import·restore·reconnect) — ZIP 패키지 검증, 경로
  정규화, 악의적 fixture 9종 방어, 원자적 교체
- 뷰어 수명주기 — 문서 열람, 지연 저장, 세션 ID 공유, 줌·다이얼로그·터치 타깃
- PDF·이미지·CSV 후속 컨트롤 — CSV Find는 100,000행에서도 이벤트 루프를
  막지 않고 청크 단위로 처리, 취소 가능
- 삭제 흐름 — Undo 창이 열려 있는 동안은 삭제로 추론하지 않고, 확정 후에만
  삭제 표시 생성, 보관 만료로 사본만 해제될 때는 삭제 표시가 늘지 않음
- 동기화(Sync) — 일반 동기화 페이로드에 주석 인용문·메모 텍스트 미포함,
  다중 문서 내보내기(최대 50개/5MB)는 기존 Journal 경로 재사용
- 인코딩·형식 판별 — UTF-8/CP949/BOM 구분, 매직바이트로 컨테이너 포맷 분류
- 문자열 고정 — 확정된 영문 문구 존재 확인, 폐기된 vault import 흔적 없음

### 1-3. 프레시-스타트 데이터 초기화

이번 릴리즈부터 앱 최초 로드 시 아래 두 저장소를 초기화합니다.

| 대상 | 동작 |
|---|---|
| `localStorage`의 `folio.*` 키 | 첫 로드 시 전부 삭제 |
| folio IndexedDB | 첫 로드 시 전부 삭제 |

목적은 배포 전 개발·테스트 중 쌓인 로컬 데이터를 새 사용자 경험과 분리하는
것입니다. 이 동작은 자동 테스트로 트리거 조건(최초 1회)과 대상 범위를
고정했습니다.

---

## 2. Pending — 실기기 확인 필요

아래는 자동 테스트로 커버되지 않아 실제 기기에서 직접 확인이 필요합니다.

- [ ] iPhone에서 터치로 하이라이트 선택(텍스트 셀렉션 → 주석 툴바 노출)
- [ ] iPad에서 터치로 하이라이트 선택, 특히 좁은/큰 화면 두 경우 모두
- [ ] 실제 기기에서 PDF 문서 렌더링(스크롤·줌·페이지 전환)
- [ ] 실제 기기에서 Markdown 문서 렌더링
- [ ] 실제 기기에서 HTML 문서 렌더링(샌드박스 적용 상태)
- [ ] Home Screen에 설치한 PWA에서 첫 로드 시 데이터 초기화가 실제로
      한 번만 일어나는지, 이후 재실행 시 데이터가 유지되는지

---

## 3. 결론

`npm test` 93/93 통과, 버전 문자열 일치 확인. 프레시-스타트 초기화 로직은
테스트로 고정했으나 실기기에서의 터치 인터랙션과 문서 렌더링은 위 Pending
항목으로 남아 있어 실기기 확인 후 최종 배포를 확정합니다.


## 2026-09-08 안정성 개선 검증

- 수정: Unicode 검색 위치 정확성, View → Find 대화상자 중첩 해소, 업데이트 시 기존 문서 보존.
- 로컬 회귀 검사 및 JavaScript 문법 검사: 통과.
- Chromium 1280×900 / 390×844: 주요 조작, 재시작 후 기존 데이터 보존, 화면·페이지 오류 검사 통과.
- Service Worker를 통한 오프라인 앱 재실행: 통과.
- 실제 iPhone/iPad Safari, iCloud 공유, 실제 비공개 GitHub 데이터 동기화: 실기기 확인 필요.

## 2026-09-10 형식별 글자 크기·하이라이트+메모·구간 메모 점검

사용자 요청으로 형식(PDF/HTML/TXT/Markdown/CSV/이미지/인코딩)별로 (1) 글자
크기·글꼴 조절, (2) 선택 텍스트 하이라이트+메모(원문 저장 포함), (3) 문서
전체/구간(소제목) 단위 메모, (4) 앱 전체 Settings와 문서별 설정 화면에서 실제
동작하는 버튼이 있는지를 기존 구현을 코드로 확인하고 `npx python3 -m
http.server`로 실제 Chromium에서 확인했습니다.

**확인 결과 (기존 구현이 이미 충족)**

- 글자 크기: 앱 전체 Settings의 `Text size`(6~17px, `--fs`)와 문서별 확대/축소
  (`--fs-doc`, 6~19단계, 두 손가락 핀치 + 문서 제목을 눌러 여는 시트의 버튼
  대안)가 TXT·Markdown·HTML에 모두 적용됨을 코드로 확인. PDF·이미지는 자체
  확대/축소 슬라이더(35~400%, 25~400%)를 이미 갖고 있어 별도 폰트 크기가
  필요 없음. CSV는 `--fs-doc`를 테이블 렌더에 이미 반영하지만, 정적 테스트
  (`tests/static.test.mjs` "document zoom, dialogs and touch targets…")가 CSV를
  핀치/버튼 확대 대상에서 명시적으로 제외하도록 고정되어 있어(넓은 표에서 두
  손가락 핀치가 가로 스크롤 제스처와 충돌하는 문제로 보임) 이번 작업에서는
  그 결정을 그대로 유지하고 CSV 자체의 `Columns`(Auto/Compact/Comfortable)
  버튼을 밀도 조절 대안으로 남겨두었습니다. 글꼴(서체) 선택은
  `WebApp_House_Style.md` 3장이 Lexend→Verdana 고정 순서를 하우스 스타일로
  못박고 있어 사용자가 바꿀 수 있는 글꼴 선택 기능은 의도적으로 두지
  않았습니다.
- 하이라이트+메모: 텍스트를 선택하면 원문(quote)이 그대로 저장되고(위치
  참조만이 아님), 메모를 붙일 수 있음을 확인. 저장된 하이라이트는 재열람 시
  같은 위치에 다시 칠해지고, Notes 시트·라이브러리 전체 "내 하이라이트·메모"
  화면·Markdown 내보내기 어디서나 원문 그대로 노출됨을 확인.
- 문서 전체/구간 메모: `Add note here`로 선택 없이도 현재 위치에 독립 메모를
  저장하는 기능이 이미 있었음. 이번에 `src/annotation.js`의
  `annotationLocation()`을 보강해 TXT/Markdown/HTML에서 하이라이트·메모 위치
  바로 위의 소제목(h1~h6)을 자동으로 찾아 위치 라벨에 붙이도록 했습니다
  (예: `43% · Section Two`). 이로써 "문서 전체 메모"와 "특정 구간(소제목) 메모"를
  목록에서 구분할 수 있습니다. PDF(페이지 번호)·CSV(행 번호)는 기존 라벨을
  그대로 사용해 하위 호환을 유지했습니다.
- Settings 화면: 앱 전체 Settings에 `Text size`/`Appearance`/`Sync`/`Journal`
  (`Include highlight and note bodies` 토글 포함) 버튼이 실제로 동작함을
  확인. 문서별 설정(제목을 눌러 여는 시트)에는 `Text size`, `Notes`, `Pin`,
  `Rename`, `Export original` 버튼이 실제로 뜨고 동작함을 확인.

**이번에 고친 것**

- `src/annotation.js` — `annotationLocation()`에 소제목(heading) 탐지를
  추가해 구간 단위 메모 위치 라벨을 보강 (하위 호환: 기존 `locator` 필드는
  그대로 두고 `heading` 필드만 추가).

**자동 테스트**: `npm test` 96/96 통과(기존 93개 + 이번 확인 과정에서 이미
있던 항목들 포함, 회귀 없음). DOM(`document`)에 의존하는 `annotationLocation`
류 함수는 이 프로젝트의 기존 관례대로 Node 자동 테스트 대상이 아니어서(다른
DOM 기능들처럼 `.test.html`/실브라우저 확인 대상), 아래처럼 실제 Chromium으로
직접 확인했습니다.

**실제 Chromium(Claude Browser pane)으로 직접 확인한 것**

- Markdown 문서(`# Intro`, `## Section Two`) 가져오기 → 렌더링 정상.
- `Section Two` 문단에서 텍스트 선택 → 주석 툴바(`Highlight`/`Add note`/
  `Export .md`) 노출 → `Add note` → 메모 작성·저장 → 하이라이트가 문서에
  칠해짐, Notes 시트에 `Highlight · 0% · Section Two`로 표시되고 원문·메모
  본문이 그대로 보임을 확인.
- 문서 제목을 눌러 여는 시트에 `Text size`(6~19) 버튼과 `Notes` 버튼이 뜸을
  확인.
- `Add note here`(선택 없는 독립 메모) 에디터가 열림을 확인.
- 앱 전체 Settings 화면의 `Text size`/`Appearance`/`Sync`/`Journal` 및
  `Include highlight and note bodies` 토글이 화면에 정상 노출됨을 확인.
- 콘솔에 "An unknown error occurred when fetching the script"가 한 번
  보였으나 네트워크 로그상 이번 변경 파일(`sw.js`, `annotation.js`)과 무관하고
  플레인 `http://localhost`(비-HTTPS) 로컬 서버 환경 특유의 현상으로 보여
  회귀로 보지 않았습니다. GitHub Pages(HTTPS) 배포본에서 재확인이 필요합니다
  (Pending 참고).

**Pending — 실기기 확인 필요 (추가)**

- [ ] 실제 iPhone/iPad Safari, GitHub Pages(HTTPS) 배포본에서 위 콘솔 오류가
      재현되는지
- [ ] PDF·이미지·CSV의 자체 확대/축소 컨트롤이 실기기 터치에서 매끄러운지
- [ ] 소제목이 많은 실제 긴 Markdown/HTML 문서에서 heading 라벨이 항상
      가장 가까운 소제목을 정확히 가리키는지(코드 리뷰로는 확인, 다양한
      실문서로는 미확인)

## 2026-09-11 — md/html/pdf 형식별 재점검, HTML 선택 기능 오류 수정

이전 점검(위 항목)에서 "HTML도 다른 형식과 동등하게 동작한다"고 적었지만,
사용자가 md/html/pdf 세 형식을 다시 꼼꼼히 봐 달라고 요청해 실제
Chromium으로 하나씩 재확인한 결과 HTML만 실제로는 동작하지 않는 심각한
문제를 발견해 고쳤습니다.

**발견한 문제**

- **HTML 문서에서 텍스트 선택 → 하이라이트/메모가 전혀 동작하지 않음.**
  HTML 문서의 실제 읽기 화면(`Read`/`Run`)은 보안을 위해 별도 origin의
  샌드박스 `<iframe>` 안에서 렌더링되는데, 앱의 선택 감지 코드는 바깥
  문서의 `window.getSelection()`/`selectionchange`만 봅니다. 그 결과
  사용자가 글자를 드래그해 화면에는 파랗게 선택 표시가 뜨는데도
  `Highlight`/`Add note` 작업 막대는 전혀 나타나지 않았습니다(실기기·배포본
  모두 동일 재현). PDF·TXT·Markdown·CSV는 실제 문서 내용이 바깥 문서에
  바로 그려지므로 이 문제가 없었습니다.
- **위 문제를 고치던 중 별개의 기존 버그도 발견**: HTML 문서를 열 때마다
  내부적으로 두 번 그려지고 있었습니다(`preview.js`의 `mount()`가
  `frame`의 `load` 이벤트와 호스트의 `bootstrap-ready` 응답 양쪽에서 각각
  한 번씩, 총 두 번 렌더 메시지를 보내던 구조적 결함). 화면이 열리자마자
  한 번 깜빡이거나, Run 모드 문서의 스크립트가 한 번 재시작되는 형태로
  나타났습니다.

**고친 것**

- `src/preview.js` — 문서가 자기 자신의 `selectionchange`를 감지해 인용문·
  앞뒤 문맥·가장 가까운 소제목·스크롤 비율을 바깥으로 전달하도록
  `instrument()`를 확장(`postSel`/`selCtx`/`nearestHeading`/`findRange`).
  저장된 하이라이트는 CSS Custom Highlight API로 문서 안에서 직접 다시
  칠하도록(`applyHL`) 했고, 그 색상 규칙(`highlightStyle()`)도 함께
  주입합니다. `mount()`에 `onSelection`/`onReady`/`applyHighlights()`/
  `locate()`/`clearSelection()`을 추가. **동시에 이중 렌더 버그의 원인이던
  `load` 이벤트 리스너를 제거**(호스트의 `bootstrap-ready` 응답 하나로
  충분).
- `preview-host.html` — 위 새 메시지 종류(`selection`/`highlights`/
  `locate`/`clear-selection`)를 양방향으로 중계하도록 allowlist 보강.
- `src/annotation.js` — `captureFrameSelection()` 추가. 프레임에서 온
  선택을 기존 `captureSelection()`과 동일한 모양으로 변환해, 이후 저장·
  내보내기·Journal 등 모든 하위 로직이 출처(바깥 문서 vs iframe)를 몰라도
  되게 함.
- `src/handlers/html.js` — 위 새 기능을 실제로 연결(`onSelection`,
  `onReady`, `applyHighlights`, `scrollToAnnotation`, `currentLocation`,
  `clearFrameSelection`). 기존 저장 데이터·다른 형식 동작에는 영향 없음.
- `src/app.js` — `reportFrameSelection`(ctx로 노출), `paintAnnotations`가
  `State.view?.applyHighlights?.()`도 호출, `createAnnotation`의 위치
  계산과 `jumpToAnnotation`(Go to)의 이동 로직이 HTML의 프레임 기반 위치도
  다루도록 보강.
- `sw.js`/`src/version.js` — 캐시 버전 두 단계 갱신
  (`2026.09.11-htmlannotate1` → 수정 커밋 누락분 재수정 `htmlannotate2`).

**자동 테스트**: `npm test` 96/96 통과, `npm run test:syntax` 통과. 기존
"이중 렌더" 관련 자동 검사(`every inner-frame message type...`,
`a mounted document and its instrumentation share one session id`)도
모두 그대로 통과.

**실제 GitHub Pages(HTTPS) 배포본에서 직접 확인한 것**

- 배포 후 재확인 과정에서 캐시 버전을 한 번 올리는 것을 깜빡해 Service
  Worker가 고친 파일을 계속 이전 버전으로 캐시하는 바람에, 재배포했는데도
  브라우저에서 옛 코드가 계속 실행되는 상황을 겪었습니다 — 버전을 다시
  올리고서야 실제로 고쳐졌음을 확인할 수 있었습니다. 앞으로 여러 커밋에
  걸쳐 같은 배포를 손볼 때는 **커밋마다** 캐시 버전을 올려야 함을 다시
  확인했습니다.
- 메시지 로그로 직접 확인: 이전에는 `render` 관련 메시지(`host-ready`)가
  한 문서당 두 번 왔지만, 수정 후에는 정확히 한 번만 옵니다.
- HTML 문서에서 "Resource Read Test" 제목을 드래그 선택 → `Highlight`/
  `Add note`/`Export .md` 작업 막대가 정상적으로 나타남 → `Highlight` 저장
  → 문서 안에 분홍색으로 실제 칠해짐 → 페이지를 완전히 새로고침해도 다시
  열면 그대로 칠해짐(캐시·재구성 후에도 유지) → Notes 시트에
  `Highlight · 0% · Resource Read Test`로 소제목까지 포함해 표시.
- 같은 문서에서 `Add note here`(선택 없는 전체 문서 메모)도 저장되고
  목록에 나타남, `Go to` 클릭 시 오류 없음.
- 회귀 확인: 같은 세션에서 Markdown·PDF 문서도 다시 선택→하이라이트를
  테스트해 정상 동작·콘솔 오류 0건 확인(공유 코드인 `annotation.js`,
  `app.js`를 함께 고쳤으므로).
- 테스트에 쓴 문서 3개(`resource-read.html/.md`, `three-pages.pdf`)는
  확인 후 모두 삭제해 실제 라이브러리를 비운 상태로 되돌렸습니다.

**Pending — 실기기 확인 필요**

- [ ] 실제 iPhone/iPad Safari에서 HTML 문서 텍스트 선택 제스처(길게
      눌러 선택 vs 드래그)가 자동화 도구의 마우스 드래그와 동일하게
      동작하는지
- [ ] 이전 보고서의 "unknown error fetching script" 콘솔 오류 — 이번에
      실제 HTTPS 배포본에서 콘솔 오류 0건으로 재확인되어 로컬 plain-HTTP
      테스트 환경(브라우저 자동화 도구 자체의 요청 차단) 특유의 현상이었음이
      확인됨. 실기기에서도 재현되지 않는지 최종 확인 권장.
- [ ] PDF는 텍스트 레이어 선택 하이라이트가 이미 지원되나, 페이지 넘길 때
      가상화(뷰포트 밖 페이지는 DOM에서 제거)로 인해 화면 밖 페이지의
      저장된 하이라이트가 다시 스크롤해 돌아왔을 때 항상 즉시 다시
      칠해지는지 여러 페이지 문서로 추가 확인 권장


## 2026-09-11 읽기 화면 설정 진입점 추가 · 배경색 선택지 추가

사용자 피드백: "글씨크기 조정 같은것들이 설정에 제대로 포함되지않고, 그저
제목부분을 눌러야 작동하는것같습니다" — 확인해 보니 정확했습니다. 문서
설정 시트(글자 크기 포함)는 상단바 **제목**을 탭해야만 열렸고, 그 버튼에는
`aria-label="Document settings"`만 있을 뿐 눈에 보이는 아이콘·글자가 전혀
없어 일반 제목 텍스트처럼 보였습니다 — 발견 경로가 사실상 숨겨져 있었습니다.

**고친 것**

- `index.html`/`src/app.js` — 제목 옆에 **`Aa` 버튼**(petal의 같은 이름
  버튼과 동일한 관례)을 새로 추가해 같은 문서 설정 시트를 엽니다. 제목
  탭도 그대로 동작(하위 호환).
- `src/settings.js` — `docBg` 설정(`auto`/`sepia`/`mint`/`sky`/`lavender`/
  `gray`) 추가. 앱 전체에 공통 적용되는 전역 설정(petal의 책별 테마처럼
  전역이며, 문서 본문 글자 크기처럼 문서마다 따로 저장되지 않음).
- `src/app.js` — 문서 설정 시트에 `Background` 6色 스와치 섹션 추가.
  TXT·Markdown·CSV에서만 노출(PDF는 페이지가 이미 그림, HTML Read 모드는
  원본 문서 자체 디자인을 보존하는 게 원래 목적이라 배경을 강제로 칠하면
  충돌할 수 있어 제외).
- `assets/app.css` — `.vbody`가 이미 쓰던 `--bg`/`--card`/`--text` 커스텀
  프로퍼티를 `.vbody.themable`(위 세 형식만) 범위에서 재정의하는 방식이라,
  `.doctext`/`table.csv` 등 기존 규칙을 하나도 새로 안 만들고 그대로
  새 배경·글자색을 물려받습니다.
- `docs/USER-GUIDE-KO.md` 갱신.

**자동 테스트**: `npm test` 96/96 통과(회귀 없음), 문법 검사 통과.

**실제 브라우저로 직접 확인한 것** (로컬 정적 서버)

- `Aa` 버튼이 상단바에 항상 보이고, 눌렀을 때 제목 탭과 동일한 시트가 열림.
- Markdown 문서에서 `Background` → `Sepia` 선택 → 즉시 읽기 화면 배경·
  글자색이 바뀜, 새로고침 후에도 유지됨(전역 설정이므로).
- 같은 상태에서 PDF를 열면 `Aa` 시트에 `Background` 섹션이 아예 없고
  페이지·여백 배경 모두 평소 앱 색 그대로임을 `getComputedStyle`로 확인.
- CSV를 열면 `Background` 섹션이 있고 `Sepia` 선택이 유지된 채 표 배경·셀
  배경 색이 실제로 바뀜을 `getComputedStyle`로 확인
  (`#viewerBody` background `rgb(246,239,228)`, `td` background
  `rgb(251,246,238)`).
- HTML 문서를 열면 `Aa` 시트에 `Text size`만 있고 `Background`는 없음,
  `#viewerBody`에 `themable` 클래스가 붙지 않고 배경이 앱 기본색
  `rgb(253,247,248)` 그대로임을 `getComputedStyle`로 확인.

**Pending — 실기기 확인 필요**

- [ ] 실제 iPhone/iPad에서 `Aa` 버튼과 제목이 겹치지 않고 긴 파일명에서도
      레이아웃이 깨지지 않는지
- [ ] 다크 모드(Appearance: Dark)에서 배경색 선택지(Sepia 등)를 골랐을 때
      대비가 충분한지 실기기에서 눈으로 확인


## 2026-09-11 하이라이트 위치 오류 수정 · 폴더·태그 분류 기능 추가

### 하이라이트 표시 오류 (사용자 스크린샷 제보)

Markdown 문서를 읽다가 본인이 선택하지 않은 여러 단어·구절(주로 굵게 강조된
용어와 인라인 코드)에 분홍 하이라이트가 칠해져 있다는 제보를 스크린샷과
함께 받았습니다. Source 보기에는 그런 표시가 없어 Reading 모드에서만
나타나는 렌더링 오류로 보고 원인을 조사했습니다.

**원인 두 가지**

1. `annotation.js`의 `captureSelection()`이 새 하이라이트의 위치 단서
   (prefix/suffix)를 `body.innerText.indexOf(quote)`로 계산했는데, 이 함수는
   문서 전체에서 그 문구가 **처음 나오는 위치**를 찾을 뿐, 실제로 선택한
   위치는 신경 쓰지 않았습니다. 그 결과 반복되는 짧은 구절(용어 설명, 코드
   조각 등)을 문서 뒤쪽에서 선택해도 저장되는 위치 단서는 항상 첫 등장 위치
   기준이었고, `findTextRange()`가 나중에 이 단서로 하이라이트를 다시 그릴
   때 실제 선택 위치가 아니라 그 첫 등장 위치를 칠했습니다.
2. Markdown/HTML 문서는 `Source` 보기 전환을 위해 원문 텍스트를 담은
   **숨겨진(`hidden`) `<pre>` 사본**을 항상 DOM에 함께 두는데, 하이라이트
   검색 함수(`textNodes()`)가 이 숨겨진 사본까지 검색 대상에 포함시켜
   검색 공간이 불필요하게 두 배가 되어 있었습니다.

**고친 것**: `captureSelection()`이 실제 선택한 Range의 위치를 직접 계산해
prefix/suffix를 만들도록 수정, `textNodes()`가 `.hidden` 요소를 검색에서
제외하도록 수정(`src/annotation.js`).

**실제 브라우저로 재현·수정 확인**: "Trump dividend"라는 같은 구절이 두 번
나오는 Markdown 문서를 만들어, **두 번째** 등장 위치만 정확히 선택해
Highlight 저장 → 수정 전에는(코드 리뷰로 확인) 첫 번째 등장 위치가 칠해질
문제였으나, 수정 후에는 실제 선택한 두 번째 위치에만 정확히 칠해지고 첫
번째 등장 위치는 그대로 남아 있음을 확인. 새로고침 후에도 유지됨을 확인.

### 폴더·태그 분류 기능 추가

기존에도 태그 데이터(`doc.tags`)와 `Edit tags` 편집 기능은 있었지만, 태그를
목록에서 보거나 태그로 걸러볼 방법이 없었고 폴더 개념 자체가 없었습니다.

**추가한 것**

- `src/store.js` — Dexie v2: `folders` 저장소 신설, `documents`에 `folderId`
  인덱스 추가. 기존 문서는 `folderId`가 비어 있어 자동으로 Unsorted.
- `src/folders.js`(신규) — 폴더 생성·이름 변경·삭제(삭제 시 문서는
  Unsorted로 이동, 문서 자체는 삭제하지 않음).
- 라이브러리 **⋯ → `Filter by tag`**: 실제 사용 중인 태그만 목록으로, 여러
  개 선택 시 AND 조건으로 좁혀짐. 문서 줄에도 `#태그` 칩이 표시됨.
- 라이브러리 **⋯ → `Folders`**: 폴더 목록(문서 수 포함)·선택해서 필터링·
  새 폴더·이름 변경·삭제. 문서 줄 길게 누르기(우클릭)에 **`Move to folder`**
  추가, 폴더가 있는 문서는 줄에 폴더 이름 배지 표시.
- `src/backup.js` — 폴더도 백업/복원에 포함(스키마 버전은 그대로 유지해
  이전 백업과도 호환 — 폴더 필드가 없으면 빈 배열로 처리).
- 부수적으로 발견한 기존 버그: `store.js`의 `replaceFromBackup()`이
  `return db.transaction(...)` 뒤에 `invalidateAnnotationCounts()`를 둬서
  복원 후 하이라이트/메모 개수 배지가 갱신되지 않던 문제를 함께 고침.

**자동 테스트**: `npm test` 96/96 통과(회귀 없음), 문법 검사 통과(신규
`src/folders.js` 포함).

**실제 브라우저로 직접 확인한 것**

- 새 폴더 생성 → 처음엔 생성 직후 다시 연 시트에 새 폴더가 안 보이는 버그를
  발견해 바로 고침(`State.folders`를 `refreshLibrary()`로 먼저 새로고침한
  뒤 시트를 다시 열도록 순서 수정) → 재확인 후 정상 노출.
  - 폴더로 필터링(문서 없음 → `Nothing here yet` → `Show all`로 해제),
    문서를 폴더로 이동(우클릭 → `Move to folder`) → 줄에 폴더 배지 표시,
    폴더 시트의 문서 수 즉시 갱신, 폴더 이름 변경 정상 동작.
- 태그 추가(`Edit tags`) → 줄에 `#vocab #avgo` 표시 → `Filter by tag`에서
  선택 → 필터링 정상 동작.
- 375px 폭(모바일)과 다크 모드에서 새 배지·태그 줄이 레이아웃 깨짐 없이
  표시됨을 스크린샷으로 확인.

**Pending — 실기기 확인 필요**

- [ ] 실제 iPhone/iPad에서 폴더/태그 관리 시트의 터치 조작감
- [ ] 폴더가 많거나(수십 개) 태그가 많은 경우의 시트 스크롤·성능

---

## 2026-09-11 — `Read aloud`(선택 영문 텍스트 음성 읽기) 추가 (빌드 `2026.09.11-readaloud1`)

- 선택 작업 막대(`annotation-toolbar`)에 `Read aloud` 버튼 추가. 기기 내장
  Web Speech API(`speechSynthesis`)만 사용 — 외부 서버·CDN 없음, 오프라인
  동작.
- 선택한 문구에서 영문(라틴 문자) 구간만 정규식으로 추출해 `en-US` 음성으로
  읽음 — 한글·영문 혼용 문장에서 한글은 건너뜀.
- 재생 중 버튼 텍스트가 `Stop`으로 바뀌고(`aria-pressed` 갱신), 다시 누르면
  중지. 선택이 다른 문구로 바뀌거나 뷰어를 닫으면(`closeViewer`,
  `clearSelectionAction`) 자동으로 `speechSynthesis.cancel()` 호출.
- `speechSynthesis`를 지원하지 않는 브라우저에서는 버튼 자체를 숨김
  (`'speechSynthesis' in window` 판별).

**자동 테스트**: `npm test` 96/96 통과(회귀 없음).

**실제 브라우저로 직접 확인한 것**

- 로컬 프리뷰에서 영문+한글 혼용 텍스트 문서를 만들어 전체 선택 →
  `Read aloud` 노출 확인 → 클릭 시 `speechSynthesis.speak()`가 영문 문장만
  (한글 문장 제외) 인자로 호출됨을 확인 → 버튼이 `Stop`으로 전환 → 다시
  클릭 시 `Read aloud`로 복귀. 콘솔 오류 없음.

### 뒤이은 자체 재검토(같은 날) — 빌드 `2026.09.11-readaloud2`

배포 직후 다시 코드를 검토하며 두 가지를 더 고쳤습니다.

- **버그**: `extractEnglishText`가 영문 구간을 `". "`로 이어 붙이면서, 원래
  마침표로 끝나는 구간(한글 문장 앞의 영문 문장 대부분이 여기 해당) 뒤에
  마침표가 하나 더 붙어 `"...speech.. Mixed content follows."`처럼 어색한
  이중 마침표(불필요한 끊어읽기)가 생기던 것을 발견해 수정. 이제 구간이 이미
  마침표/느낌표/물음표로 끝나면 그대로 두고, 아니면 마침표를 하나만 붙인 뒤
  공백 하나로 이어 붙입니다.
- **접근성**: `.annotation-toolbar button`의 `min-height`가 38px로, 이
  프로젝트 검토 기준의 44×44px 터치 영역에 못 미치던 기존 문제를(`Read
  aloud` 버튼을 넣으며 이 컴포넌트를 다시 손보는 김에) 공통 `--tap`(44px)
  토큰으로 올려 고침. 기존 세 버튼에도 함께 적용됨.

**자동 테스트**: `npm test` 96/96 통과(회귀 없음).

**실제 브라우저로 직접 확인한 것**

- 로컬 프리뷰를 375px 모바일 뷰포트로 전환 → 4개 버튼(`Highlight`/
  `Add note`/`Export .md`/`Read aloud`)이 잘리지 않고 가로 스크롤 컨테이너
  안에 모두 노출됨을 확인, `Read aloud` 버튼 실측 높이 44px 확인.
- `speechSynthesis.speak()`를 패치해 실제 전달 인자를 확인한 결과
  `"...text to speech. Mixed content follows."`로 이중 마침표 없이 정상
  출력됨을 확인.
- 선택을 지우면(`window.getSelection().removeAllRanges()`) 재생 중이던
  음성이 자동으로 멈추고 버튼이 `Read aloud`로 복귀함을 재확인. 콘솔 오류
  없음. 테스트에 쓴 문서는 삭제해 라이브러리를 비운 상태로 되돌렸다.

### 뒤이은 개선(같은 날) — 한글·영문·숫자 혼용 읽기 지원 (빌드 `2026.09.11-readaloud3`)

사용자가 실제로 folio에서 읽는 문서(투자 리포트류 영어-한글 학습 자료)를 참고해 보니 한 문장 안에
한글·영문·숫자가 촘촘히 섞여 있어, 영문만 읽는 첫 버전은 실사용에 부족하다고 판단해 개선했다.

- `extractEnglishText`(영문만 추출·이어붙이기)를 `segmentSpeechRuns`로 교체. 선택한 문구 전체를
  한 번 훑어 한글 구간과 영문/숫자 구간을 순서대로 나누고(문장부호·공백·기호는 자체 언어가 없으므로
  버퍼링해 두었다가, 다음에 나오는 실제 문자의 언어가 정해지면 그쪽에 붙임 — 예: `"현재 $364"`에서
  `$`는 한글이 아니라 뒤따르는 숫자 `364`와 함께 영문 구간으로 붙는다), 구간마다 별도의
  `SpeechSynthesisUtterance`를 만들어 한글은 `ko-KR`, 영문/숫자는 `en-US`로 순서대로 큐에
  넣는다(`speechSynthesis.speak()`를 여러 번 호출하면 브라우저가 순서대로 이어 재생).
- 선택 전체를 하나의 언어로 두 번 마침표를 붙여 이어 붙이던 이전 방식의 이중 마침표 문제 자체가
  구조적으로 사라짐(구간마다 독립된 utterance라 자연스러운 끊어읽기가 생김).
- `Stop`/자동 정지(`stopSpeaking`)는 그대로 `speechSynthesis.cancel()`을 호출해 큐 전체를
  비우므로 기존 동작과 동일하게 작동한다.

**자동 테스트**: `npm test` 96/96 통과(회귀 없음, 새 구현에 대한 전용 유닛 테스트는 없음 — 이
프로젝트 관례상 `speechSynthesis`처럼 DOM/브라우저 API에 의존하는 코드는 Node 테스트 대상이
아니라 실브라우저로 확인).

**실제 브라우저로 직접 확인한 것**

- 사용자가 첨부한 참고 문서 문체를 반영한 혼용 문장(`"At $364, the price discounts... 현재
  $364라는 주가에 이미 경영진이 제시한 AI 매출 전망이 반영되어 있다. Non-GAAP operating
  margin: 62%..."`)으로 로컬 프리뷰에서 테스트. `speechSynthesis.speak()`를 패치해 실제로
  큐에 들어가는 구간과 언어를 확인한 결과, 영문 문장 → `en-US`, 한글 문장(중간의 `$364`만
  `en-US`로 분리) → `ko-KR`/`en-US` 교차, 다음 영문 문장 → `en-US` 순서로 정확히 나뉘어
  들어감을 확인 — 특히 `"현재 $364라는"`처럼 `$` 기호가 숫자 쪽(영문 구간)에 올바르게 붙고
  한글 구간(`"현재"`)에 잘못 남지 않는 것을 재확인(첫 구현에서는 `$`가 한글 구간 끝에
  붙는 사소한 흠이 있어 버퍼링 방식으로 수정).
- 재생 중 `Stop` 클릭 → 버튼이 `Read aloud`로 즉시 복귀함을 재확인. 콘솔 오류 없음. 테스트에
  쓴 문서는 삭제해 라이브러리를 비운 상태로 되돌렸다.

### 뒤이은 자체 재검토(같은 날) — 재생 큐를 체이닝 방식으로 강화 (빌드 `2026.09.11-readaloud4`)

배포 직후 다시 코드를 검토하며, 한 가지 견고성 문제를 미리 손봤다.

- **잠재적 문제**: 여러 구간(한글/영문)의 `SpeechSynthesisUtterance`를 앞서 구현에서는
  `speechSynthesis.speak()`를 반복 호출해 한꺼번에 큐에 넣고 브라우저의 자체 큐잉에 의존했다.
  그런데 이 앱의 주 타깃인 Safari/iOS는 음성·언어가 바뀌는 연속 `speak()` 호출을 브라우저가
  자체적으로 순서대로 재생하지 못하고 뒤 구간을 조용히 건너뛰거나 순서가 꼬이는 알려진 고질적
  버그가 있다. 아직 실기기 검증 전 단계에서 이 위험을 없애 두는 것이 안전하다고 판단해 미리 수정.
- **수정**: 모든 구간을 한꺼번에 큐에 넣는 대신, 첫 구간만 재생을 시작하고 그 구간의 `onend`
  콜백에서 다음 구간을 재생하도록 체이닝(chaining) 방식으로 바꿨다. 브라우저의 큐 처리에
  의존하지 않으므로 Safari의 이런 종류의 큐잉 버그를 원천적으로 피한다.
- 기존 동작(재생 중 `Stop` → 즉시 정지, 다른 텍스트 선택/문서 닫기 → 자동 정지, 재생 끝까지 마치면
  버튼 자동 복귀)은 모두 그대로 유지된다 — `State.speaking`을 체이닝 콜백이 매번 확인하므로,
  재생 도중 `Stop`을 누르면 다음 구간으로 넘어가지 않고 그 자리에서 멈춘다.

**자동 테스트**: `npm test` 96/96 통과(회귀 없음).

**실제 브라우저로 직접 확인한 것**

- `speechSynthesis.speak()`를 패치해 각 utterance가 완료된 뒤(비동기 `onend` 시뮬레이션) 다음
  utterance가 호출되는 체이닝 흐름 자체를 확인 — 7개 구간이 정확한 순서·언어로 순차 재생되고,
  마지막 구간이 끝나면 별도 조작 없이 버튼이 자동으로 `Read aloud`로 복귀함을 확인.
- 첫 구간이 아직 "재생 중"인 상태에서 곧바로 `Stop`을 클릭 → 그 즉시 재생이 멈추고(구간 1개만
  재생됨) 버튼이 `Read aloud`로 복귀 → 이후 지연되어 도착하는 첫 구간의 `onend` 콜백이 뒤늦게
  실행되어도 다음 구간으로 이어지지 않고 조용히 종료됨을 확인(재생 중단 후 좀비 재생 없음). 콘솔
  오류 없음. 테스트에 쓴 문서는 삭제해 라이브러리를 비운 상태로 되돌렸다.

**Pending — 실기기 확인 필요**

- [ ] 실제 iPhone/iPad Safari에서 한국어·영어 두 음성이 실제로 자연스럽게 전환되며 재생되는지
      (음질·전환 시 끊김 여부), 화면 잠금·백그라운드 전환 시 재생 중단 여부
- [ ] 기기에 한국어 음성 데이터가 없는 경우(구형 기기, 언어팩 미설치)의 동작
- [ ] VoiceOver 등 스크린리더 사용 중 `Read aloud` 버튼과의 상호작용

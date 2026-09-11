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

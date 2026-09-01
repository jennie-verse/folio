# folio — 사용 방법

화면에 나오는 메뉴 이름은 **영문**입니다. 아래에 한국어 설명과 함께 적었습니다.

---

## 1. 문서 넣기

1. 아래쪽 **가져오기(Import files)** 를 누릅니다.
2. Files·iCloud Drive에서 파일을 여러 개 고를 수 있습니다.
3. iPad에서는 다른 앱에서 파일을 끌어다 놓아도 됩니다.

넣고 나면 `Added 3 documents.` 같은 안내가 잠깐 뜹니다.

- 같은 파일을 다시 넣으면 복사본이 생기지 않고 원래 문서에 다시 연결됩니다 —
  `Already in folio — reconnected instead.`
- 열 수 없는 파일은 이유와 함께 목록으로 보여 줍니다.
- 한글 파일명은 그대로 표시·검색됩니다.

---

## 2. 첫 화면(Library)

| 요소 | 뜻 |
|---|---|
| 검색창 **Search documents** | 제목·파일명·태그·본문을 한 번에 찾습니다 |
| **⇅ Sort** | 정렬 — 최근 열람 / 추가일 / 제목 / 크기 / 형식 |
| **⌗ Filter by type** | 형식으로 걸러 보기 |
| **☑ Select** | 여러 문서를 골라 주석을 하나의 Markdown으로 묶어 내보내기 |
| **Continue** 줄 | 최근에 보던 문서 3건. 가는 선이 어디까지 읽었는지 보여 줍니다 |
| 상태 칩 | `All` `Pinned` `Needs file` `Recent` |

글자 크기를 6px·8px로 줄이면 Continue 줄은 자동으로 접히고 화면이 순수한
목록이 됩니다.

### 여러 문서 묶어 내보내기(Select → Export selected .md)

1. Library 상단의 **☑ Select**를 누릅니다. 문서 줄마다 체크박스가 나타나고,
   탭하면 열기 대신 선택됩니다.
2. 원하는 만큼 고르면(**최대 50개, 합쳐서 5MB**) 아래 바에 선택 개수가 뜨고
   `Export selected .md`가 활성화됩니다. `Clear`로 선택을 비울 수 있습니다.
3. `Export selected .md`를 누르면 순서를 정하는 화면이 열립니다. **기본
   순서는 제목 오름차순**이고, 각 문서의 `↑ Up`/`↓ Down`으로 순서를 바꿉니다.
4. `Export selected .md`(공유/다운로드) 또는 `Copy Markdown`(클립보드로 복사)
   중 고릅니다. 공유가 가능하면 Apple 공유 시트가 열리고, 안 되면 자동으로
   `.md` 파일 다운로드로 대체됩니다.
5. 결과는 **하나의 Markdown 파일**(`folio-notes-YYYY-MM-DD.md`)입니다. 문서마다
   `##` 제목으로 구분되고, 그 아래 하이라이트·메모가 기존 문서별 내보내기와
   같은 형식으로 들어갑니다. **주석이 하나도 없는 문서도 포함되며**, 그 자리에
   `_No annotations._`라고 표시됩니다 — 조용히 빠지지 않습니다.

> 기존 `Export .md`(주석 1건)와 `Export all .md`(문서 1개 전체)는 그대로 있습니다.
> `Select`는 **문서 여러 개를 한 번에** 묶을 때만 씁니다.

### 문서 줄 왼쪽의 세로선 (keep line)

색이 아니라 **굵기와 모양**으로 상태를 구분합니다.

| 선 | 뜻 |
|---|---|
| 굵은 실선 (3px) | 핀 지정 — 사본이 절대 사라지지 않습니다 |
| 가는 실선 (1px) | 사본이 이 기기에 있습니다 |
| 가는 점선 | **Needs file** — 사본이 해제되었습니다. 원본 파일이 필요합니다 |

만료가 3일 이하로 남으면 `3d` 같은 작은 표시가 붙습니다.

### 문서 줄을 길게 누르면

`Open`(열기) · `Pin`(핀) · `Rename`(제목 수정) · `Edit tags`(태그) ·
`Export original`(원본 내보내기) · `Delete`(삭제)

---

## 3. 문서 보기(Viewer)

- **본문을 한 번 탭하면** 위아래 바가 함께 사라집니다. 다시 탭하면 돌아옵니다.
- 상단 바의 **제목을 탭하면 문서 시트**가 열립니다. 여기에 `Text size`(문서
  본문 글자 크기)가 있습니다. 본문을 두 손가락으로 오므리거나 벌려도 됩니다.
- 문서 본문 글자 크기는 **문서마다 따로 저장**되고, 설정(Settings)의 앱 글자
  크기와는 별개입니다.

### 선택·하이라이트·메모

- PDF의 실제 텍스트, TXT, Markdown, CSV 등에서 글자를 선택하면 Apple의
  `Copy`, `Look Up` 같은 기본 메뉴를 그대로 사용할 수 있습니다.
- 선택이 유지되는 동안 Folio 작업 막대에서 `Highlight`, `Add note`,
  `Export .md`를 선택할 수 있습니다.
- 상단의 `▧` 또는 제목 메뉴의 `Notes`에서 저장한 하이라이트와 메모를 보고,
  수정·삭제·개별 내보내기·문서 전체 Markdown 내보내기를 할 수 있습니다.
- 선택하지 않고 `Add note here`를 누르면 현재 PDF 페이지 또는 문서의 현재
  읽기 위치에 독립 메모가 저장됩니다.
- 주석은 Folio 데이터에 따로 저장되며 원본 PDF와 문서 파일은 수정하지 않습니다.
- 스캔 PDF와 이미지는 선택할 실제 텍스트가 없으므로 독립 메모만 사용할 수 있습니다.

### 형식별 도구

| 형식 | 위쪽 | 아래쪽 |
|---|---|---|
| PDF | `Outline` `Find` `Rotate` | 페이지 슬라이더 + `12 / 184` |
| Markdown | `Contents` `Find` `Source` | 없음 |
| HTML | `Read` `Run` `Source` + `Find` | Run일 때 `Preview issues` |
| 텍스트 | `Find` `Encoding` `Wrap` | 스크롤 위치 |
| CSV | `Find` `Columns` `Delimiter` `Encoding` | `Row 1,204 / 8,391` |
| 이미지 | `Rotate` `Info` | 확대 슬라이더 + `Fit` |

### 한글이 깨져 보일 때

텍스트·CSV 뷰어의 **Encoding** 에서 `CP949` 를 고르면 됩니다. Excel에서 저장한
한글 CSV가 대개 여기에 해당합니다. 고른 값은 그 문서에 저장됩니다.

---

## 4. HTML 문서의 세 가지 모드

| 모드 | 하는 일 |
|---|---|
| **Read** (기본) | 스크립트를 제거하고 글만 보여 줍니다. 가장 안전합니다 |
| **Run** | 스크립트를 격리된 샌드박스 안에서 실행합니다 |
| **Source** | 원문 코드를 그대로 봅니다 |

**Run은 문서마다 따로 켭니다.** 처음 켤 때 확인을 한 번 받습니다 —
`Scripts in this document will run in an isolated sandbox. It cannot read your
other documents, send data anywhere, or keep anything after you leave.`

ZIP 패키지(`.zip`)는 Run 전용입니다. 실행 중 문제가 생기면 아래쪽
`Preview issues` 에 목록으로 모입니다. 이 내용은 저장되지도, 동기화되지도
않습니다.

---

## 5. 보관과 해제 (Retention)

저장 공간을 위해, 오랫동안 열지 않은 문서의 **원본 사본만** 지웁니다.

- 제목·태그·읽은 위치·본문 검색은 **그대로 남습니다.**
- 텍스트·Markdown·HTML·CSV는 **절대 해제하지 않습니다.**
- 핀(Pin)을 찍은 문서는 시계가 멈춥니다.
- 처음 자동 해제가 일어날 때 한 번 물어봅니다. 그다음부터는 알림만 뜹니다.

해제된 문서를 열면 **Choose the original file** 화면이 나옵니다. 원본 파일을
고르면 해시를 대조해 다시 연결하고 읽던 위치로 돌아갑니다 — `Reconnected.`
다른 파일을 고르면 두 파일을 나란히 보여 주고 선택하게 합니다.

---

## 6. 설정(Settings)

| 구역 | 항목 |
|---|---|
| Display | `Text size` 6단계(6·8·10·12·14·17) · `Reset` · `Appearance` (System/Light/Dark) |
| Storage | `Retention` (7d·14d·30d·Never) · `Release expired now` · 사용량 |
| Backup | `Export backup` · `Restore from backup` |
| Sync | 기본 꺼짐. 켤 때 기기 이름을 먼저 묻습니다 |
| Journal | 기본 꺼짐. Daybook에 활동을 보냅니다. 선택 문구·메모 본문 포함 여부를 따로 정합니다 |
| Danger | `Delete all documents` |
| About | 빌드 번호 · `Licences` |

`Text size` 는 **앱 화면 글자**입니다. 문서 본문 글자는 뷰어에서 따로
조절합니다.

---

## 7. 삭제

- 문서 하나 삭제는 확인 없이 실행되고 **5초 동안 `Undo`** 가 뜹니다. 누르면
  사본·본문·읽은 위치가 한 번에 되돌아옵니다.
- 5초가 지나면 확정됩니다. Files에 있는 **원본 파일은 건드리지 않습니다.**
- Undo가 떠 있는 채로 앱을 닫으면 다음 실행에서 삭제가 확정됩니다.
- 전체 삭제(`Delete all documents`)는 확인 대화상자가 뜹니다.

## Daybook Journal 기록 복원

- **Add existing history**는 문서 added 날짜뿐 아니라 저장된 highlight/note의 createdAt·updatedAt도 가져옵니다. 가져온 주석 참조가 보존되어 이후 삭제도 같은 remote record를 정리할 수 있습니다.
- **Include selected text and note bodies**를 끄면 pending 및 새 record의 quote/note가 제외됩니다. **Remove content**는 선택 기간의 현재 projection만 정제합니다.
- 90일 파일 metadata activity는 Journal opt-in과 무관하게 로컬에 보관되고 JSON 백업/복원에 포함됩니다. **Clear captured activity**는 문서·주석을 건드리지 않고 이 원장만 지웁니다.

---

## 2026-09-01 업데이트 — 읽기 세션 재개 버그 수정

문서를 열어 두고 5분 넘게 손을 떼었다가(idle) 다시 스크롤하거나 터치하면, 이전에는 그 문서의 읽기 시간이 더 기록되지 않는 버그가 있었습니다. 이번 업데이트로 idle 이후 다시 활동하면 새 읽기 세션이 정상적으로 시작되어 Daybook에 반영됩니다. 문서를 실제로 닫거나 다른 문서로 넘어갈 때만 세션이 완전히 종료됩니다.

또한 Journal 과거 기록 채우기(backfill) 중 세션 원장에 기록이 있으면 오류로 중단되던 문제도 함께 고쳤습니다.

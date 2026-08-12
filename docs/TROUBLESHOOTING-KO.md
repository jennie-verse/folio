# folio — 문제 해결

---

## 화면이 비어 있거나 예전 화면이 계속 나옵니다

folio는 오프라인에서도 열리도록 파일을 기기에 저장해 둡니다. 새 버전을
올렸는데 예전 화면이 나온다면 그 저장본이 남아 있는 것입니다.

**순서대로 해 보세요.**

1. 앱을 완전히 껐다가(앱 전환기에서 위로 밀어 닫기) 다시 엽니다.
   화면 이동은 항상 최신 판을 먼저 시도하므로 대개 여기서 해결됩니다.
2. 그래도 같다면 **설정(Settings)** 아래쪽 `Build` 줄을 확인합니다. 올린
   버전과 다르면 배포한 파일에서 `sw.js` 의 `VERSION` 과 `src/version.js` 의
   `APP_BUILD` 가 **둘 다** 올라갔는지 확인합니다. 하나만 올리면 예전 판이
   계속 나옵니다.
3. Safari 탭으로 연 경우: **설정 앱 → Safari → 방문 기록 및 웹 사이트 데이터
   지우기.** (홈 화면 앱의 데이터는 지워지지 않습니다.)
4. 홈 화면 앱을 지웠다 다시 추가하면 저장본이 새로 만들어집니다.
   **문서도 함께 사라지므로 먼저 백업하세요.**

---

## 문서가 안 열립니다 — `Needs file`

사본이 해제된 문서입니다. 문서를 누르면 **Choose the original file** 화면이
나오고, Files에서 원본을 고르면 다시 연결됩니다.

너무 자주 해제된다면 **설정 → Retention** 을 `30d` 나 `Never` 로 바꾸거나,
자주 보는 문서에 **핀(Pin)** 을 찍으세요. 핀 문서는 해제되지 않습니다.
(핀은 최대 50개입니다.)

---

## 한글이 깨져 보입니다

텍스트·CSV 뷰어의 **Encoding** 에서 `CP949` 를 고르세요. Windows나 Excel에서
저장한 한글 파일이 대개 여기에 해당합니다. 고른 값은 그 문서에 저장됩니다.

`Reading as CP949.` 라고 뜨면 적용된 것입니다.

---

## 한글 PDF의 글자가 네모로 보입니다

한글 CID 폰트용 표가 함께 배포되어야 합니다. 배포 폴더에
`vendor/pdfjs/cmaps/` 가 통째로 들어갔는지 확인하세요. 특히 `KSC*.bcmap`,
`UniKS*.bcmap`, `Adobe-Korea1-*.bcmap` 24개가 필요합니다.

---

## PDF가 열리지 않습니다

| 화면 문구 | 뜻 |
|---|---|
| `This PDF is password-protected. folio can't open encrypted files.` | 암호가 걸린 PDF입니다. folio는 암호를 풀지 않습니다 |
| `This file could not be read. It may be damaged.` | 파일이 손상되었습니다. `Export original` 로 꺼내 다른 앱에서 확인해 보세요 |
| `No text layer — search and highlights are unavailable for this document.` | 스캔 이미지 PDF입니다. 그림은 보이지만 글자 검색은 안 됩니다 |

---

## 사진이 안 보입니다

`This device can't display this image format. Export the original to open it in
Files.` 가 나오면 이 기기가 그 형식을 그리지 못하는 것입니다. HEIC는 iOS
버전에 따라 다릅니다. **Export original** 로 꺼내 사진 앱에서 여세요.

---

## ZIP이 거부됩니다

| 이유 | 한도 |
|---|---|
| 압축 파일이 큼 | 15 MB |
| 풀었을 때 큼 | 25 MB |
| 파일 하나가 큼 | 10 MB |
| 파일 수가 많음 | 500개 |
| 암호가 걸림 | 지원하지 않습니다 |
| 진입 HTML이 없음 | ZIP 안에 `index.html` 이 있어야 합니다 |

진입 파일은 ZIP 루트의 `index.html`, 또는 HTML이 하나뿐이면 그 파일, 또는
폴더 한 겹으로 싸인 경우 그 안의 `index.html` 입니다. 최상위 폴더가 두 개
이상이면 어느 것을 열지 정할 수 없어 거부됩니다.

---

## Run(실행)에서 그림이나 버튼이 동작하지 않습니다

`Required JavaScript is blocked` 가 나오면 그 문서가 인터넷에서 스크립트를
받아 오도록 만들어진 것입니다. folio는 외부 스크립트를 실행하지 않습니다.

필요한 파일을 문서와 같은 폴더에 넣고 상대 경로로 바꾼 뒤, 폴더를 ZIP으로
압축해 넣으면 실행됩니다.

아래쪽 **Preview issues** 를 열면 무엇이 막혔는지 볼 수 있습니다. 이 내용은
저장되지도 동기화되지도 않습니다.

---

## 저장 공간이 부족하다고 합니다

`Storage is full — released 3 old copies and saved.` 가 뜨면 folio가 오래된
비핀 사본부터 해제하고 새 문서를 저장한 것입니다. 핀 문서는 건드리지
않습니다.

공간을 더 확보하려면 **설정 → Release expired now** 를 누르거나, Retention을
짧게(`7d`) 두세요.

---

## 동기화(Sync)가 실패합니다

| 문구 | 확인할 것 |
|---|---|
| `Token may be expired or lacks permission.` | 토큰이 만료되었거나 권한이 없습니다 |
| `Network unavailable. Changes are queued.` | 연결이 안 됩니다. 다음에 자동으로 다시 보냅니다 |
| `The repository path was not found.` | `webapp-data` 저장소 경로를 확인하세요 |
| `Another device wrote first. Queued to send again.` | 다른 기기가 먼저 썼습니다. 다시 보냅니다 |

동기화는 꺼도 됩니다. **꺼져 있어도 앱은 완전히 동작합니다.**

---

## 문서를 잘못 지웠습니다

삭제 직후 5초 동안 뜨는 **Undo** 를 누르면 되돌아옵니다. 5초가 지났다면 백업
파일에서 복원하거나, Files에 있는 원본을 다시 넣으세요. **Files의 원본은
folio가 지우지 않습니다.**

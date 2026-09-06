# folio — GitHub Pages 배포와 홈 화면 추가

저장소: `jennie-verse/folio` · 배포 주소: `https://jennie-verse.github.io/folio/`

---

## 1. 저장소 만들기

1. GitHub에 로그인합니다.
2. 오른쪽 위 **+** → **New repository** 를 누릅니다.
3. **Repository name** 에 `folio` 를 적습니다.
4. **Public** 을 고릅니다. (GitHub Pages 무료 버전은 Public이어야 합니다.)
5. README·.gitignore·license는 **체크하지 않습니다.** 이미 폴더에 있습니다.
6. **Create repository** 를 누릅니다.

## 2. 파일 올리기

`Deliverable/folio/` 폴더 **안의 내용**을 저장소 최상위에 올립니다.
`folio` 폴더를 통째로 올려 `folio/folio/index.html` 이 되지 않게 주의합니다.

터미널을 쓰는 경우:

```bash
cd Deliverable/folio
git init
git add -A
git commit -m "folio 첫 배포"
git branch -M main
git remote add origin https://github.com/jennie-verse/folio.git
git push -u origin main
```

웹으로 올리는 경우 — 저장소 화면의 **Add file → Upload files** 에서 폴더 안의
파일을 전부 끌어다 놓습니다. `.nojekyll` 처럼 점으로 시작하는 파일도 반드시
포함해야 합니다. (macOS Finder에서 `Command + Shift + .` 로 숨긴 파일을 보이게
할 수 있습니다.)

## 3. Pages 켜기

1. 저장소 → **Settings** → 왼쪽 **Pages**
2. **Source** 를 `Deploy from a branch` 로 둡니다.
3. **Branch** 를 `main`, 폴더를 `/ (root)` 로 고르고 **Save**.
4. 1~2분 뒤 `https://jennie-verse.github.io/folio/` 가 열립니다.

## 4. 열리는지 확인

Safari에서 위 주소를 엽니다. 아래가 모두 맞아야 합니다.

- `folio` 제목과 검색창이 보입니다.
- **가져오기(Import files)** 로 파일을 넣으면 목록에 나타납니다.
- 새로고침해도 목록이 그대로 있습니다.

빈 화면이 나오면 [TROUBLESHOOTING-KO.md](TROUBLESHOOTING-KO.md) 를 봅니다.

---

## 5. iPhone·iPad 홈 화면에 추가

1. **Safari** 로 `https://jennie-verse.github.io/folio/` 를 엽니다.
   (Chrome이 아니라 Safari여야 합니다.)
2. 아래 가운데 **공유(Share)** 버튼을 누릅니다.
3. 목록을 내려 **홈 화면에 추가(Add to Home Screen)** 를 누릅니다.
4. 이름을 확인하고 **추가(Add)**.

홈 화면 아이콘으로 열면 주소창 없이 앱처럼 뜹니다. 저장 공간도 Safari 탭보다
넉넉하게 잡힙니다.

---

## 6. 새 버전 올리기

고친 파일을 올리기 **전에** 아래 두 값을 같은 값으로 함께 올립니다.

| 파일 | 값 |
|---|---|
| `sw.js` | `const VERSION = '2026.08.12-init1'` |
| `src/version.js` | `export const APP_BUILD = "2026.08.12-init1"` |

형식은 `YYYY.MM.DD-태그` 입니다. 예: `2026.08.20-fix1`

이 값을 올리지 않으면 이전에 저장된 화면이 계속 나올 수 있습니다. 올린 뒤에는
앱을 한 번 껐다 켜면 새 버전이 뜹니다. 설정(Settings) 아래쪽 `Build` 줄에서
지금 돌고 있는 버전을 확인할 수 있습니다.

---

## 7. 알아 둘 점

- 저장소가 **Public** 이라도 **문서는 올라가지 않습니다.** 저장소에 있는 것은
  앱 코드뿐이고, 문서는 기기 안에만 있습니다.
- 동기화(Sync)를 켜면 별도의 비공개 저장소(`webapp-data`)에 **제목·태그·날짜·
  크기만** 올라갑니다. 본문은 올라가지 않습니다.
- 모든 경로가 상대 경로라 `/folio/` 같은 하위 주소에서도 그대로 동작합니다.

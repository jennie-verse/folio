# folio — 백업과 복원

folio의 문서는 **이 기기 안에만** 있습니다. 기기를 바꾸거나 앱을 지우기 전에
백업을 만들어 두세요.

---

## 1. 백업 만들기

**설정(Settings) → 백업 내보내기(Export backup)**

1. 예상 크기와, 포함되지 않는 문서 수를 먼저 알려 줍니다.
2. **저장(Save)** 을 누르면 공유 시트가 열립니다.
3. **파일에 저장(Save to Files)** 을 골라 iCloud Drive 등에 둡니다.

파일 이름은 `folio-backup-2026-08-12.json` 형식입니다.

### 무엇이 들어가나

| 형식 | 백업에 포함되는 것 |
|---|---|
| 텍스트 · Markdown · HTML · CSV · ZIP 패키지 | **본문까지 전부** |
| PDF · 이미지 | 제목·태그·읽은 위치 등 **정보만** |

PDF와 사진은 원본이 커서 넣지 않습니다. 복원하면 `Needs file` 로 표시되고,
Files에 있는 원본을 다시 고르면 그대로 이어집니다.

### 크기 상한

| 대상 | 상한 |
|---|---|
| 문서 하나 | 5 MB |
| ZIP 패키지 하나 | 15 MB |
| 백업 전체 | 40 MB |

상한을 넘어 빠진 문서는 **저장한 뒤 목록으로 보여 줍니다.** 어떤 문서가 왜
빠졌는지 확인할 수 있습니다.

> 백업 파일은 JSON이라 원본보다 약 1.33배 커집니다. 전체 40 MB면 파일은 약
> 53 MB가 됩니다.

---

## 2. 복원하기

**설정(Settings) → 백업에서 복원(Restore from backup)**

1. 백업 JSON 파일을 고릅니다.
2. 형식을 먼저 검사합니다. folio 백업이 아니면 여기서 멈춥니다.
3. 확인 대화상자가 뜹니다 — **Replace everything?**
   *“Restoring replaces the documents currently in folio.”*
4. **Replace** 를 누르면 지금 있는 문서를 지우고 백업 내용으로 바꿉니다.

**복원은 합치기가 아니라 교체입니다.** 지금 기기에 남겨 두고 싶은 문서가
있다면 복원 전에 먼저 백업을 하나 더 만들어 두세요.

복원이 끝나면 `Restored 128 documents.` 처럼 알려 줍니다.

---

## 3. PDF·사진 다시 연결하기

복원 뒤 PDF와 사진은 `Needs file` 로 표시됩니다.

1. 그 문서를 누릅니다.
2. **Choose the original file** 화면에서 파일명·크기·페이지 수를 확인합니다.
3. **Choose file** 로 Files에서 원본을 고릅니다.
4. 해시가 같으면 바로 열리고 읽던 위치로 돌아갑니다 — `Reconnected.`

다른 파일을 고르면 두 파일의 이름·크기를 나란히 보여 주고 세 가지 중에서
고르게 합니다 — `Add as new document`(새 문서로 추가) /
`Link anyway`(그래도 연결) / `Cancel`.

---

## 4. 원본 파일 하나만 꺼내기

문서 줄을 길게 눌러 **Export original** 을 고르면 그 문서의 원본 파일을 공유
시트로 내보냅니다. 사본이 해제된 문서에서는 이 메뉴가 비활성입니다.

---

## 5. 전체 삭제

**설정(Settings) → Delete all documents**

확인 대화상자가 뜹니다 — *“This deletes everything folio has stored, including
pinned documents and highlights. Back up first if you want to keep a copy.”*

Files에 있는 **원본 파일은 지워지지 않습니다.** folio가 보관하던 사본과 목록만
사라집니다.

---

## 6. 언제 백업하면 좋은가

- 문서를 많이 넣은 다음
- iOS를 크게 업데이트하기 전
- 기기를 바꾸기 전
- 오랫동안 앱을 안 쓸 것 같을 때

Safari의 저장 공간은 오래 쓰지 않으면 정리될 수 있습니다. 홈 화면에 추가해
쓰면 훨씬 안정적이지만, 그래도 중요한 문서는 원본을 Files에 함께 두는 편이
안전합니다.

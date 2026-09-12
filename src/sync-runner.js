/* sync-runner.js — 언제 동기화를 돌릴지, 무엇을 올릴지 정하는 곳.
   실제 GitHub 통신은 sync.js 가 합니다.

     1. 원격 목록 전부 받아오기 (pullAllRemote) — 다른 기기가 올린 폴더·태그를 반영
     2. 올리기 — 올릴 목록은 **저장소에서 새로 읽습니다.** 화면 상태를 쓰지 않습니다.
     3. 이벤트 큐 보내기

   folio 는 본문을 올리지 않으므로 받아오기가 문서를 새로 만들거나 지우지
   않습니다 — 이미 이 기기에 있는 문서의 폴더 배정·태그만 최신 쪽으로
   맞춥니다 (2026-09-12, fileHash 로 같은 파일을 알아봅니다). */

import * as sync from "./sync.js";

// 공용 모듈과 같은 4초 디바운스입니다.
const PUSH_DEBOUNCE_MS = 4000;

let pushTimer = null;
let inFlight = null;
let listener = null;
let listDocs = async () => [];
let applyRemote = async () => false;

/** 앱이 시작할 때 한 번 부릅니다.
    getDocs — 문서 목록은 저장소에서 직접 읽어 옵니다.
    applyRemote(list) — 받아온 원격 메타 목록을 로컬 문서에 반영하고, 뭔가
    바뀌었으면 true 를 돌려줍니다(화면을 다시 그릴지 판단하는 데 씁니다). */
export function attach({ getDocs, applyRemote: apply } = {}) {
  if (typeof getDocs === "function") listDocs = getDocs;
  if (typeof apply === "function") applyRemote = apply;
}

/** 설정 화면이 상태 줄을 갱신할 수 있도록 등록합니다. */
export function onSyncState(fn) {
  listener = typeof fn === "function" ? fn : null;
}

function notify(state, detail) {
  if (listener) {
    try { listener(state, detail); } catch { /* UI 갱신 실패가 동기화를 막지 않습니다. */ }
  }
}

export function schedulePush() {
  if (!sync.isReady()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { runSync().catch(() => {}); }, PUSH_DEBOUNCE_MS);
}

export function runSync() {
  if (inFlight) return inFlight;
  inFlight = runSyncOnce().finally(() => { inFlight = null; });
  return inFlight;
}

async function runSyncOnce() {
  if (!sync.isReady()) return { skipped: true };
  clearTimeout(pushTimer);
  notify("syncing");

  try {
    // 1. 원격 목록 전부. 로컬에 이미 있는 문서(fileHash 로 매칭)의 폴더·태그만
    //    최신 쪽으로 맞춥니다. 새 문서를 만들지도, 지우지도 않습니다.
    const remote = await sync.pullAllRemote();
    const changed = await applyRemote(remote);

    // 2. 올리기 — 저장소에서 새로 읽습니다. 화면 상태(State.docs)는 쓰지 않습니다.
    //    metaFor() 가 필드를 하나씩 골라 담아 본문(content)은 빠집니다.
    const docs = await listDocs();
    await sync.pushIndex(docs.map((doc) => sync.metaFor(doc, doc.folderName)));

    // 3. 밀린 이벤트
    await sync.flushEvents();

    notify("idle");
    return { ok: true, changed };
  } catch (error) {
    notify("error", { error });
    return { error };
  }
}

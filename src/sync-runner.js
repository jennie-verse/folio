/* sync-runner.js — 언제 동기화를 돌릴지, 무엇을 올릴지 정하는 곳.
   실제 GitHub 통신은 sync.js 가 합니다.

     1. 목록 받아오기 (pullIndex) — 합집합을 만들기 위해서만
     2. 올리기 — 올릴 목록은 **저장소에서 새로 읽습니다.** 화면 상태를 쓰지 않습니다.
     3. 이벤트 큐 보내기

   folio 는 본문을 올리지 않으므로 받아오기가 로컬을 건드리지 않습니다.
   원격이 로컬 문서를 지우거나 덮을 길이 아예 없습니다. */

import * as sync from "./sync.js";

// 공용 모듈과 같은 4초 디바운스입니다.
const PUSH_DEBOUNCE_MS = 4000;

let pushTimer = null;
let inFlight = null;
let listener = null;
let listDocs = async () => [];

/** 앱이 시작할 때 한 번 부릅니다. 문서 목록은 저장소에서 직접 읽어 옵니다. */
export function attach({ getDocs } = {}) {
  if (typeof getDocs === "function") listDocs = getDocs;
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
    // 1. 원격 목록. 여기서 얻은 것은 합집합에만 쓰이고 로컬에 반영되지 않습니다.
    await sync.pullIndex();

    // 2. 올리기 — 저장소에서 새로 읽습니다. 화면 상태(State.docs)는 쓰지 않습니다.
    //    metaFor() 가 필드를 하나씩 골라 담아 본문(content)은 빠집니다.
    const docs = await listDocs();
    await sync.pushIndex(docs.map((doc) => sync.metaFor(doc)));

    // 3. 밀린 이벤트
    await sync.flushEvents();

    notify("idle");
    return { ok: true };
  } catch (error) {
    notify("error", { error });
    return { error };
  }
}

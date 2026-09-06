/* sync.js — webapp-data(비공개 저장소)와 주고받는 부분만 모아 둔 모듈.
   화면 코드는 여기 함수만 부르고 GitHub API 를 직접 다루지 않습니다.

   다루는 것 두 가지입니다.
     A. folio/index.<ctx>.json           문서 **메타만** (제목·태그·시각·크기)
     B. events/folio.<ctx>.YYYY-MM.json  공용 활동 기록 (atlas·trace 가 읽음)

   **문서 본문은 올리지 않습니다.** HTML 문서 한 건이 수 MB 라, 커밋마다 전체가
   다시 전송되면 통신량과 저장소 크기가 급격히 커집니다. 본문 백업은 기존
   `Export backup` 을 그대로 씁니다. 그래서 이 모듈에는 백업(C층) 기능이 없습니다.

   본문을 올리지 않으므로 **받아오기로 문서가 생기지 않습니다.** folio 의 동기화는
   사실상 올리기 전용이고, 원격 목록은 합집합을 만들기 위해서만 읽습니다.
   이 단순함이 곧 안전장치입니다 — 원격이 로컬 문서를 지우거나 덮을 길이 없습니다.

   동기화는 기본으로 꺼져 있습니다. 꺼진 상태에서도 앱은 완전히 동작해야 하고,
   로컬 저장이 언제나 먼저입니다. */

/* ── 공용 모듈은 필요할 때만 부릅니다 ──────────────────────────────────────
   정적 `import` 로 부르면 그 파일 하나를 못 받는 순간 모듈 그래프가 통째로 실패해
   앱이 빈 화면이 됩니다. (2026-08-10 loom 에서 실제로 재현한 문제) */

import { webappDataConfig } from './deployment.js';

let sharedPromise = null;

async function api() {
  if (!sharedPromise) {
    sharedPromise = import("../../shared/v1/sync.js").catch((cause) => {
      sharedPromise = null; // 다음에 다시 시도합니다.
      const error = new Error("The shared sync module could not be loaded.");
      error.type = "network";
      error.cause = cause;
      throw error;
    });
  }
  return sharedPromise;
}

const NAMESPACE = "folio";

export const KEYS = Object.freeze({
  token: "sync.token.v1",
  enabled: "folio.syncEnabled",
  lastSyncAt: "folio.lastSyncAt",
  pendingEvents: "folio.pendingEvents",
  tombstones: "folio.deletedDocs",
});

// GitHub Contents API 는 1MB 를 넘으면 읽기가 느려지고 커밋도 무거워집니다.
// 메타만 올리므로 넘길 일이 거의 없지만, 넘으면 조용히 실패하지 않게 막습니다.
const MAX_FILE_BYTES = 1000000;
const CONFLICT_RETRY = 3;
const EPOCH = "1970-01-01T00:00:00.000Z";

/* ── localStorage 도우미 ───────────────────────────────────────────────── */

function readItem(key, fallback = "") {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function writeItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeItem(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in private browsing modes.
  }
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

/* ── 토큰과 켜짐 여부 ──────────────────────────────────────────────────── */

export function getToken() {
  return readItem(KEYS.token, "");
}

export function saveToken(token) {
  const trimmed = String(token || "").trim();
  if (!trimmed) return false;
  return writeItem(KEYS.token, trimmed);
}

export function clearToken() {
  removeItem(KEYS.token);
}

/** 화면에는 마지막 네 자리만 보여 줍니다. */
export function tokenHint() {
  const token = getToken();
  return token ? `••••${token.slice(-4)}` : "";
}

export function isEnabled() {
  return readItem(KEYS.enabled) === "1";
}

export function setEnabled(enabled) {
  writeItem(KEYS.enabled, enabled ? "1" : "0");
}

/* 컨텍스트 값은 localStorage 만 읽고 씁니다. 통신이 없으므로 공용 모듈을 부르지
   않고 여기서 처리합니다. shared/v1 은 고정이라 키 이름이 바뀌지 않고, 검사
   스크립트가 실제 shared/v1 소스와 대조해 어긋나면 실패합니다. */

const CONTEXT_KEY = `${NAMESPACE}.syncContextId`;
const CONTEXT_LABEL_KEY = `${NAMESPACE}.syncContextLabel`;

export function getContextId() {
  return readItem(CONTEXT_KEY, "");
}

export function getContextLabel() {
  return readItem(CONTEXT_LABEL_KEY, "");
}

function contextFilePath(basePath, contextId) {
  const dot = basePath.lastIndexOf(".");
  if (dot === -1) return `${basePath}.${contextId}`;
  return `${basePath.slice(0, dot)}.${contextId}${basePath.slice(dot)}`;
}

/** 컨텍스트 ID 를 만듭니다.

    **ID 는 만들 때 정해지고 이후 바뀌지 않습니다.** 파일 이름에 들어가기 때문입니다.
    그래서 동기화를 켜기 전에 받은 이름을 여기로 넘겨 ID 에 반영합니다.
    공용 모듈은 이름에서 영문 소문자와 숫자만 남깁니다. */
export async function ensureContext(preferredName) {
  const Shared = await api();
  return Shared.ensureContextId(NAMESPACE, () => String(preferredName || "").trim());
}

/** 사용자가 붙이는 이름입니다. 한글도 그대로 저장됩니다. 파일 이름과는 무관합니다. */
export function setContextLabel(label) {
  writeItem(CONTEXT_LABEL_KEY, String(label || "").trim());
}

export function getLastSyncAt() {
  return Number(readItem(KEYS.lastSyncAt, "0")) || 0;
}

/** 동기화가 실제로 동작할 수 있는 상태인지. 셋 중 하나라도 없으면 조용히 쉽니다. */
export function isReady() {
  return Boolean(isEnabled() && getToken() && getContextId());
}

function config() {
  return webappDataConfig(getToken());
}

/** 화면에 그대로 보여 줄 수 있는 영문 한 줄로 바꿉니다. */
export function describeError(error) {
  if (!error) return "Sync failed.";
  if (error.type === "auth") return "Token may be expired or lacks permission.";
  if (error.type === "network") return "Network unavailable. Changes are queued.";
  if (error.type === "notfound") return "The repository path was not found.";
  if (error.type === "conflict") return "Another device wrote first. Queued to send again.";
  if (error.type === "toolarge") return "The document list is too large to sync.";
  if (error.type === "configuration") return error.message;
  return "Sync failed. Check the token and repository access.";
}

function tooLarge(message) {
  const error = new Error(message);
  error.type = "toolarge";
  return error;
}

/* ── B. 공용 활동 기록 ─────────────────────────────────────────────────── */

function pad2(value) {
  return String(value).padStart(2, "0");
}

/** 로컬 오프셋을 살린 ISO 문자열. 하루 경계를 보는 앱들이 있어 UTC 로 바꾸지 않습니다. */
export function localIso(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const pad = (value) => String(Math.abs(value)).padStart(2, "0");
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
    + `T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
    + `${sign}${pad(Math.trunc(offsetMinutes / 60))}:${pad(offsetMinutes % 60)}`;
}

function monthKey(isoLocal) {
  return String(isoLocal).slice(0, 7);
}

/** 문서 하나를 공용 이벤트 모양으로 바꿉니다.

    **문서당 이벤트는 하나입니다.** `at` 은 저장한 시각이라 Trace 타임라인에서
    제자리에 남고, 이름을 바꾸면 같은 id 의 `detail` 만 갱신되어 Atlas 에서 항상
    현재 제목으로 찾힙니다. 문서를 열 때마다 남기지는 않습니다 — 같은 문서가
    여러 날에 중복해 보이면 타임라인이 읽기 어려워집니다. */
export function docToEvent(doc, { deleted = false } = {}) {
  if (!doc || !doc.id) return null;
  const created = new Date(Number(doc.addedAt) || Date.now());
  const event = {
    v: 1,
    id: `${NAMESPACE}:${doc.id}`,
    app: NAMESPACE,
    kind: "doc.added",
    at: localIso(Number.isNaN(created.getTime()) ? new Date() : created),
    title: "Added a document",
    // 사용자가 붙인 제목입니다. 한글 그대로 두고, HTML 은 넣지 않습니다.
    detail: String(doc.title || "").trim().slice(0, 200),
    ref: "../folio/",
  };
  if (deleted) event.deleted = true;
  return event;
}

function pendingEvents() {
  const value = parseJson(readItem(KEYS.pendingEvents, "[]"), []);
  return Array.isArray(value) ? value : [];
}

export function queueEvent(event) {
  if (!event) return;
  const queue = pendingEvents().filter((item) => item.id !== event.id);
  queue.push(event);
  writeItem(KEYS.pendingEvents, JSON.stringify(queue));
}

export function pendingEventCount() {
  return pendingEvents().length;
}

function mergeEventsById(current, incoming) {
  const merged = new Map();
  current.forEach((event) => { if (event && event.id) merged.set(event.id, event); });
  let changed = false;
  incoming.forEach((event) => {
    if (!event || !event.id) return;
    const previous = merged.get(event.id);
    if (previous && JSON.stringify(previous) === JSON.stringify(event)) return;
    merged.set(event.id, event);
    changed = true;
  });
  return { list: [...merged.values()], changed };
}

async function writeEventMonth(cfg, path, incoming) {
  const Shared = await api();
  for (let attempt = 0; attempt < CONFLICT_RETRY; attempt += 1) {
    const existing = await Shared.readFile(cfg, path);
    const current = existing.exists ? parseJson(existing.content, []) : [];
    const merged = mergeEventsById(Array.isArray(current) ? current : [], incoming);
    if (!merged.changed) return;

    const body = `${JSON.stringify(merged.list, null, 2)}\n`;
    if (body.length > MAX_FILE_BYTES) throw tooLarge("The monthly event file is too large.");

    try {
      await Shared.writeFile(cfg, path, body, {
        sha: existing.sha || undefined,
        message: `folio: add ${incoming.length} event(s) to ${path}`,
      });
      return;
    } catch (error) {
      // 다른 기기가 먼저 썼습니다. 최신 sha 로 다시 읽어 합친 뒤 재시도합니다.
      if (error && error.type === "conflict" && attempt < CONFLICT_RETRY - 1) continue;
      throw error;
    }
  }
}

/** 쌓인 이벤트를 달별로 나눠 보냅니다. 성공한 달의 것만 큐에서 뺍니다. */
export async function flushEvents() {
  if (!isReady()) return { sent: 0, remaining: pendingEventCount() };
  const queue = pendingEvents();
  if (queue.length === 0) return { sent: 0, remaining: 0 };

  const cfg = config();
  const contextId = getContextId();
  const byMonth = new Map();
  queue.forEach((event) => {
    const key = monthKey(event.at);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(event);
  });

  let sent = 0;
  let firstError = null;
  const stillPending = [];

  for (const [month, events] of byMonth) {
    // 이름 순서가 <앱>.<기기>.<YYYY-MM>.json 이어야 atlas·trace 파서가 알아봅니다.
    // contextFilePath() 는 마지막 점 앞에 기기 ID 를 넣어 순서가 어긋나므로 직접 만듭니다.
    const path = `events/${NAMESPACE}.${contextId}.${month}.json`;
    try {
      await writeEventMonth(cfg, path, events);
      sent += events.length;
    } catch (error) {
      if (!firstError) firstError = error;
      stillPending.push(...events);
    }
  }

  writeItem(KEYS.pendingEvents, JSON.stringify(stillPending));
  if (firstError && sent === 0) throw firstError;
  return { sent, remaining: stillPending.length };
}

/* ── 삭제 표시(tombstone) ──────────────────────────────────────────────────

   **표시는 사용자가 직접 지웠을 때만 찍습니다.** "로컬에 없으니 지워진 것"이라고
   절대 추론하지 않습니다. 그 추론이 2026-08-09 focus 사고의 본질이었습니다.

   folio 는 본문을 올리지 않으므로 이 표시가 다른 기기의 문서를 지우지는 않습니다.
   목록이 지운 문서로 계속 부풀지 않게 하는 용도입니다. */

function tombstones() {
  const value = parseJson(readItem(KEYS.tombstones, "[]"), []);
  return Array.isArray(value) ? value : [];
}

/** 삭제 표시를 남깁니다.

    **확정된 삭제에서만 부릅니다** (계획서 5-4, 2026-08-12 확정). 단건 삭제는
    `Undo` 5초를 거치는 소프트 삭제라, 그 창이 열려 있는 동안 표시를 만들면
    다른 기기에서 되살릴 수 없는 삭제가 됩니다. 그래서 이 함수의 유일한 호출
    지점은 `store.finalizeDelete()` 뒤입니다. */
export function markDeleted(doc) {
  if (!doc || !doc.id) return;
  const list = tombstones().filter((item) => item.id !== doc.id);
  list.push({
    id: doc.id,
    title: String(doc.title || ""),
    createdAt: Number(doc.addedAt) || 0,
    deletedAt: Date.now(),
  });
  writeItem(KEYS.tombstones, JSON.stringify(list));
}

export function tombstoneCount() {
  return tombstones().length;
}

/* ── A. 문서 메타 목록 ─────────────────────────────────────────────────── */

function indexPath(contextId) {
  return contextFilePath(`${NAMESPACE}/index.json`, contextId);
}

function stamp(entry) {
  return Number(entry && entry.updatedAt ? entry.updatedAt : 0);
}

/** 문서 하나의 메타. **필드를 여기서 하나씩 골라 담습니다.**

    `{...doc}` 로 통째로 복사하면 `content` 가 딸려 올라갑니다. 문서 본문은
    한 건이 수 MB 라 저장소가 금방 무거워지고, 개인 문서 원문이 공용 층에
    올라가서도 안 됩니다. 검사 스크립트가 올라간 JSON 전체에 `content` 가
    한 글자도 없는지 확인합니다. */
export function metaFor(doc) {
  return {
    id: String(doc.id),
    title: String(doc.title || "").slice(0, 200),
    tags: Array.isArray(doc.tags) ? doc.tags.map(String).slice(0, 20) : [],
    kind: String(doc.kind || ""),
    createdAt: Number(doc.addedAt) || 0,
    updatedAt: Number(doc.updatedAt) || 0,
    lastOpenedAt: Number(doc.lastTouchedAt) || 0,
    sizeBytes: Number(doc.size) || 0,
  };
}

/** 같은 id 는 updatedAt 이 최신인 쪽이 이깁니다. **항목은 절대 사라지지 않습니다.** */
function mergeEntries(base, incoming) {
  const merged = new Map();
  (Array.isArray(base) ? base : []).forEach((item) => {
    if (item && item.id) merged.set(String(item.id), item);
  });
  (Array.isArray(incoming) ? incoming : []).forEach((item) => {
    if (!item || !item.id) return;
    const key = String(item.id);
    const previous = merged.get(key);
    if (!previous || stamp(item) >= stamp(previous)) merged.set(key, item);
  });
  return [...merged.values()];
}

/** 이 기기의 목록 파일 하나를 읽습니다. 합집합을 만들기 위해서만 씁니다. */
export async function pullIndex() {
  if (!isReady()) return null;
  const Shared = await api();
  const cfg = config();
  const path = indexPath(getContextId());
  const read = await Shared.readFile(cfg, path);
  if (!read.exists) return [];
  const payload = parseJson(read.content, null);
  const list = payload && payload.data ? payload.data.docs : null;
  return Array.isArray(list) ? list : [];
}

/** 문서 메타 목록을 올립니다.

    **올리기는 절대로 목록을 줄이지 않습니다.** 원격에 이미 있던 항목과 합집합을
    만들어 씁니다. 화면 상태가 아직 안 채워졌거나 저장소가 잠깐 안 열리는 등
    어떤 이유로든 빈 목록이 들어와도 원격 기록이 지워지지 않게 하기 위한 안전장치입니다.
    (2026-08-09: focus 에서 빈 목록이 올라가 원격 세션 3건이 실제로 사라졌습니다.) */
export async function pushIndex(entries) {
  if (!isReady()) return false;
  const Shared = await api();
  const cfg = config();
  const contextId = getContextId();
  const path = indexPath(contextId);

  const existing = await Shared.readFile(cfg, path);
  let previous = [];
  if (existing.exists) {
    const payload = parseJson(existing.content, null);
    if (payload && payload.data && Array.isArray(payload.data.docs)) previous = payload.data.docs;
  }

  const deletions = tombstones().map((item) => ({
    id: item.id,
    title: item.title,
    tags: [],
    createdAt: item.createdAt,
    updatedAt: item.deletedAt,
    lastOpenedAt: 0,
    sizeBytes: 0,
    deleted: true,
  }));

  const body = `${JSON.stringify({
    v: 1,
    app: NAMESPACE,
    context: contextId,
    updatedAt: new Date().toISOString(),
    data: { docs: mergeEntries(mergeEntries(previous, entries), deletions) },
  }, null, 2)}\n`;

  if (body.length > MAX_FILE_BYTES) throw tooLarge("The document list is too large to sync.");

  await Shared.writeFile(cfg, path, body, {
    sha: existing.sha || undefined,
    message: `folio: update ${path}`,
  });
  writeItem(KEYS.lastSyncAt, String(Date.now()));
  return true;
}

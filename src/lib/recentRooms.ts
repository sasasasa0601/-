/**
 * 「最近参加したルーム」を端末の localStorage に置く。
 * ルームの実体はサーバー側にあり、ここは入り口のブックマークに過ぎない。
 *
 * localStorage は React の外にある状態なので、useSyncExternalStore で読む。
 * (effect で setState するとハイドレーション後に無駄な再レンダリングが走る)
 */
const KEY = "poker-ledger:recent-rooms";
const MAX = 12;

export type RecentRoom = { code: string; name: string; visitedAt: number };

const EMPTY: RecentRoom[] = [];
const listeners = new Set<() => void>();

/** getSnapshot は同じ内容なら同じ参照を返す必要があるのでキャッシュする */
let cachedRaw: string | null = null;
let cachedValue: RecentRoom[] = EMPTY;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): RecentRoom[] {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed
      .filter(
        (r): r is RecentRoom =>
          typeof r?.code === "string" && typeof r?.name === "string",
      )
      .sort((a, b) => (b.visitedAt ?? 0) - (a.visitedAt ?? 0));
  } catch {
    return EMPTY;
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeRecentRooms(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", emit);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", emit);
  };
}

export function getRecentRooms(): RecentRoom[] {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = parse(raw);
  }
  return cachedValue;
}

/** SSR 時は空。ハイドレーション後に実際の値へ差し替わる。 */
export function getRecentRoomsServerSnapshot(): RecentRoom[] {
  return EMPTY;
}

function write(rooms: RecentRoom[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rooms));
  } catch {
    /* プライベートモード等で書けなくても致命的ではない */
  }
  emit();
}

export function rememberRoom(code: string, name: string): void {
  if (typeof window === "undefined") return;
  const current = getRecentRooms();
  const existing = current.find((r) => r.code === code);
  // 同じ内容なら書かない(無駄な再レンダリングを防ぐ)
  if (existing && existing.name === name && Date.now() - existing.visitedAt < 60_000) {
    return;
  }
  write(
    [{ code, name, visitedAt: Date.now() }, ...current.filter((r) => r.code !== code)].slice(
      0,
      MAX,
    ),
  );
}

export function forgetRoom(code: string): void {
  if (typeof window === "undefined") return;
  write(getRecentRooms().filter((r) => r.code !== code));
}

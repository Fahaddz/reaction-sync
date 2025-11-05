import type { ProgressRecord, ProgressIndex } from '../types/progress';
import { normalizeUrl } from '../utils/youtube';

const TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_PAIRS = 2;
const INDEX_KEY = 'rsync:index';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function getNow(): number {
  return Date.now();
}

export function getPairKey(baseId: string | null, reactId: string | null): string | null {
  if (!baseId || !reactId) return null;
  return `rsync:pair:${baseId}||${reactId}`;
}

export function readIndex(): ProgressIndex {
  if (!isBrowser()) return [];
  try {
    const s = localStorage.getItem(INDEX_KEY);
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

export function writeIndex(index: ProgressIndex): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {}
}

export function readPair(key: string): ProgressRecord | null {
  if (!isBrowser()) return null;
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function writePair(key: string, record: ProgressRecord): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(record));
    let idx = readIndex().filter(x => x.k !== key);
    idx.unshift({ k: key, t: getNow() });
    writeIndex(idx);
    prune();
  } catch {}
}

export function prune(): void {
  if (!isBrowser()) return;
  const now = getNow();
  let idx = readIndex().filter(x => now - x.t <= TTL);
  if (idx.length > MAX_PAIRS) {
    idx = idx.sort((a, b) => b.t - a.t).slice(0, MAX_PAIRS);
  }
  writeIndex(idx);
  const keys = new Set(idx.map(x => x.k));
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('rsync:pair:') && !keys.has(k)) {
      try {
        localStorage.removeItem(k);
      } catch {}
    }
  }
}

export function sigForLocal(file: File): string {
  return `file:${file.name}|${file.size}|${file.lastModified}`;
}

export function sigForYouTube(player: YT.Player | null): string | null {
  try {
    if (!player || !player.getVideoData) return null;
    const id = player.getVideoData().video_id;
    return id ? `yt:${id}` : null;
  } catch {
    return null;
  }
}

export function sigForUrl(url: string): string {
  return `url:${normalizeUrl(url)}`;
}

export function getPos(): { l: number; t: number; w: number; h: number } | null {
  if (!isBrowser()) return null;
  try {
    const c = document.getElementById('videoReactContainer');
    if (!c) return null;
    return {
      l: c.offsetLeft || 0,
      t: c.offsetTop || 0,
      w: c.offsetWidth || 0,
      h: c.offsetHeight || 0
    };
  } catch {
    return null;
  }
}

export function saveNow(
  baseId: string | null,
  reactId: string | null,
  baseMeta: any,
  reactMeta: any,
  delay: number,
  baseTime: number,
  baseVol: number | null,
  reactVol: number | null
): void {
  try {
    if (!baseId || !reactId) return;
    const k = getPairKey(baseId, reactId);
    if (!k) return;
    const obj: ProgressRecord = {
      baseId,
      reactId,
      baseMeta,
      reactMeta,
      delay,
      baseTime,
      pos: getPos(),
      baseVol: isFinite(baseVol ?? NaN) ? baseVol : null,
      reactVol: isFinite(reactVol ?? NaN) ? reactVol : null,
      updatedAt: getNow()
    };
    writePair(k, obj);
  } catch {}
}

let autoSaveTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoSave(
  getState: () => {
    baseId: string | null;
    reactId: string | null;
    baseMeta: any;
    reactMeta: any;
    delay: number;
    baseTime: number;
    baseVol: number | null;
    reactVol: number | null;
  }
): void {
  if (autoSaveTimer) clearInterval(autoSaveTimer);
  autoSaveTimer = setInterval(() => {
    const state = getState();
    saveNow(
      state.baseId,
      state.reactId,
      state.baseMeta,
      state.reactMeta,
      state.delay,
      state.baseTime,
      state.baseVol,
      state.reactVol
    );
  }, 10000);
}

export function stopAutoSave(): void {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
}

export function loadLastPair(): ProgressRecord | null {
  const idx = readIndex();
  if (!idx || !idx.length) return null;
  const sorted = idx.sort((a, b) => b.t - a.t);
  return readPair(sorted[0].k);
}

export function clearAll(): void {
  if (!isBrowser()) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('rsync:')) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch {}
}

if (typeof window !== 'undefined') {
  prune();
}


import { writable, derived, type Writable } from 'svelte/store';
import type { SyncState } from '../types/sync';

export const syncState: Writable<SyncState> = writable({
  isSynced: false,
  delay: 0,
  isSeeking: false,
  isUserInteracting: false,
  lastInteractionTime: 0,
  seekingSource: null
});

export const syncThreshold = derived(syncState, ($state) => {
  const base = (Math.abs($state.delay) * 0.05);
  return Math.max(0.3, Math.min(1.0, base));
});

export const syncInterval = derived(syncThreshold, ($threshold) => {
  const interval = $threshold * 1000;
  return Math.max(200, Math.min(1000, interval));
});

export function enableSync(baseTime?: number, reactTime?: number): void {
  syncState.update(s => {
    let newDelay = s.delay;
    if (baseTime !== undefined && reactTime !== undefined) {
      newDelay = reactTime - baseTime;
      newDelay = Math.max(-300, Math.min(300, newDelay));
    }
    return { ...s, isSynced: true, delay: newDelay };
  });
}

export function disableSync(): void {
  syncState.update(s => ({ ...s, isSynced: false }));
}

export function setDelay(delay: number): void {
  syncState.update(s => ({ ...s, delay: Math.max(-300, Math.min(300, delay)) }));
}

export function markSeeking(source: 'base' | 'react' | 'sync'): void {
  syncState.update(s => ({
    ...s,
    isSeeking: true,
    seekingSource: source,
    lastInteractionTime: Date.now()
  }));
}

export function clearSeeking(): void {
  syncState.update(s => ({
    ...s,
    isSeeking: false,
    seekingSource: null
  }));
}

export function markUserInteraction(): void {
  syncState.update(s => ({
    ...s,
    isUserInteracting: true,
    lastInteractionTime: Date.now()
  }));
}

export function clearUserInteraction(): void {
  syncState.update(s => ({
    ...s,
    isUserInteracting: false
  }));
}



import { get, set, type SyncHealth } from './state.ts'
import type { Player } from './player.ts'

let basePlayer: Player | null = null
let reactPlayer: Player | null = null
let syncInterval: ReturnType<typeof setInterval> | null = null
let lastBaseTime = 0
let lastReactTime = 0
let consecutiveDrifts = 0
const SYNC_THRESHOLD = 0.15
const MAX_SYNC_ADJUST = 0.5
const SYNC_INTERVAL_MS = 100

export function setPlayers(base: Player | null, react: Player | null): void {
  basePlayer = base
  reactPlayer = react
}

export function getBasePlayer(): Player | null {
  return basePlayer
}

export function getReactPlayer(): Player | null {
  return reactPlayer
}

export function getBaseCurrentTime(): number {
  return basePlayer?.getCurrentTime() || 0
}

export function getBaseDuration(): number {
  return basePlayer?.getDuration() || 0
}

export function getReactCurrentTime(): number {
  return reactPlayer?.getCurrentTime() || 0
}

export function getReactDuration(): number {
  return reactPlayer?.getDuration() || 0
}

export function setDelay(delay: number): void {
  set({ delay })
}

export function enableSync(): void {
  if (syncInterval) return
  set({ synced: true })
  syncInterval = setInterval(syncLoop, SYNC_INTERVAL_MS)
}

export function disableSync(): void {
  set({ synced: false, syncHealth: '' })
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
  reactPlayer?.setPlaybackRate(1)
  consecutiveDrifts = 0
}

export function forceResync(): void {
  const state = get()
  if (!basePlayer || !reactPlayer || !state.synced) return
  const target = basePlayer.getCurrentTime() + state.delay
  reactPlayer.seek(target)
  reactPlayer.setPlaybackRate(1)
  consecutiveDrifts = 0
  set({ syncHealth: 'healthy' })
}

function syncLoop(): void {
  const state = get()
  if (!state.synced || !basePlayer || !reactPlayer) return
  if (state.seeking || state.userInteracting) return

  const baseTime = basePlayer.getCurrentTime()
  const reactTime = reactPlayer.getCurrentTime()
  const target = baseTime + state.delay
  const drift = reactTime - target

  const baseStalled = Math.abs(baseTime - lastBaseTime) < 0.01
  const reactStalled = Math.abs(reactTime - lastReactTime) < 0.01
  lastBaseTime = baseTime
  lastReactTime = reactTime

  const basePlaying = basePlayer.isPlaying()
  const reactPlaying = reactPlayer.isPlaying()

  if (!basePlaying || baseStalled) {
    if (reactPlaying) reactPlayer.pause()
    return
  }

  if (!reactPlaying) {
    reactPlayer.play()
  }

  let health: SyncHealth = 'healthy'

  if (Math.abs(drift) <= SYNC_THRESHOLD) {
    if (reactStalled && !baseStalled && Math.abs(drift) > 0.05) {
      consecutiveDrifts++
      if (consecutiveDrifts > 5) {
        reactPlayer.seek(target)
        consecutiveDrifts = 0
      }
    } else {
      consecutiveDrifts = 0
    }
    reactPlayer.setPlaybackRate(1)
  } else if (Math.abs(drift) <= MAX_SYNC_ADJUST) {
    const rate = drift > 0 ? 0.95 : 1.05
    reactPlayer.setPlaybackRate(rate)
    health = 'correcting'
    consecutiveDrifts++
  } else {
    reactPlayer.seek(target)
    reactPlayer.setPlaybackRate(1)
    health = 'drifting'
    consecutiveDrifts = 0
  }

  if (consecutiveDrifts > 20) {
    reactPlayer.seek(target)
    reactPlayer.setPlaybackRate(1)
    consecutiveDrifts = 0
  }

  if (state.syncHealth !== health) {
    set({ syncHealth: health })
  }
}

export function syncPlay(): void {
  basePlayer?.play()
  if (get().synced) {
    reactPlayer?.play()
  }
}

export function syncPause(): void {
  basePlayer?.pause()
  reactPlayer?.pause()
}

export function syncSeek(isBase: boolean, time: number): void {
  const state = get()
  set({ seeking: true })
  
  if (isBase) {
    basePlayer?.seek(time)
    if (state.synced && reactPlayer) {
      reactPlayer.seek(time + state.delay)
    }
  } else {
    reactPlayer?.seek(time)
  }
  
  setTimeout(() => set({ seeking: false }), 200)
}

export function syncToggle(): void {
  if (basePlayer?.isPlaying()) {
    syncPause()
  } else {
    syncPlay()
  }
}

export function adjustBaseVolume(delta: number): void {
  if (!basePlayer) return
  const newVol = Math.max(0, Math.min(1, basePlayer.getVolume() + delta))
  basePlayer.setVolume(newVol)
  set({ baseVolume: newVol })
}

export function adjustReactVolume(delta: number): void {
  if (!reactPlayer) return
  const newVol = Math.max(0, Math.min(1, reactPlayer.getVolume() + delta))
  reactPlayer.setVolume(newVol)
  set({ reactVolume: newVol })
}


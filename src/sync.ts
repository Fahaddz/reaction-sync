import type { Player } from './player.ts'
import { get, set, type SyncHealth } from './state.ts'
import { clamp } from './utils.ts'

let basePlayer: Player | null = null
let reactPlayer: Player | null = null
let syncIntervalId: ReturnType<typeof setInterval> | null = null
let driftRetryCount = 0
let lastDriftDirection = 0

const SYNC_THRESHOLD_BASE = 0.3
const SYNC_THRESHOLD_MAX = 1.0
const SEEK_COOLDOWN = 800
const DELAY_STEP = 0.1

function getSyncThreshold(): number {
  const delay = Math.abs(get().delay)
  return clamp(delay * 0.05, SYNC_THRESHOLD_BASE, SYNC_THRESHOLD_MAX)
}

function getSyncInterval(): number {
  const threshold = getSyncThreshold()
  return clamp(threshold * 1000, 200, 1000)
}

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

export function enableSync(): void {
  if (!basePlayer || !reactPlayer) return
  const baseTime = basePlayer.getCurrentTime()
  const reactTime = reactPlayer.getCurrentTime()
  const delay = Math.round((reactTime - baseTime) * 100) / 100
  set({ delay: clamp(delay, -300, 300), synced: true, syncHealth: 'healthy' })
  startSyncLoop()
}

export function disableSync(): void {
  stopSyncLoop()
  set({ synced: false, syncHealth: '' })
  reactPlayer?.setPlaybackRate(1)
  driftRetryCount = 0
  lastDriftDirection = 0
}

export function forceResync(): void {
  if (!basePlayer || !reactPlayer) return
  const wasPlaying = basePlayer.isPlaying() || reactPlayer.isPlaying()
  basePlayer.pause()
  reactPlayer.pause()
  const { delay } = get()
  const reactTime = reactPlayer.getCurrentTime()
  const targetBase = Math.max(0, reactTime - delay)
  basePlayer.seek(targetBase)
  setTimeout(() => {
    const verifyReact = targetBase + delay
    if (Math.abs(reactPlayer!.getCurrentTime() - verifyReact) > 0.15) {
      reactPlayer!.seek(verifyReact)
    }
    setTimeout(() => {
      if (wasPlaying) {
        basePlayer!.play()
        reactPlayer!.play()
      }
      driftRetryCount = 0
      lastDriftDirection = 0
    }, 80)
  }, 100)
}

export function setDelay(value: number, shouldSeek = false): void {
  const delay = clamp(Math.round(value * 100) / 100, -300, 300)
  set({ delay })
  if (!get().synced) {
    set({ synced: true })
    startSyncLoop()
  }
  if (shouldSeek && basePlayer && reactPlayer) {
    const baseTime = basePlayer.getCurrentTime()
    const targetReact = Math.max(0, baseTime + delay)
    reactPlayer.seek(targetReact)
  }
}

export function adjustDelay(direction: number, elapsed: number): void {
  const { delay } = get()
  let step = DELAY_STEP
  if (elapsed > 2000) step = 1.0
  else if (elapsed > 1000) step = 0.5
  setDelay(delay + direction * step, true)
}

export function syncPlay(sourceIsBase: boolean): void {
  set({ userInteracting: true, lastInteractionTime: Date.now() })
  if (get().synced) {
    basePlayer?.play()
    reactPlayer?.play()
  } else {
    if (sourceIsBase) basePlayer?.play()
    else reactPlayer?.play()
  }
  setTimeout(() => set({ userInteracting: false }), SEEK_COOLDOWN)
}

export function syncPause(sourceIsBase: boolean): void {
  set({ userInteracting: true, lastInteractionTime: Date.now() })
  if (get().synced) {
    basePlayer?.pause()
    reactPlayer?.pause()
  } else {
    if (sourceIsBase) basePlayer?.pause()
    else reactPlayer?.pause()
  }
  setTimeout(() => set({ userInteracting: false }), SEEK_COOLDOWN)
}

export function syncSeek(sourceIsBase: boolean, time: number): void {
  set({ seeking: true, userInteracting: true, lastInteractionTime: Date.now() })
  const { delay, synced } = get()
  if (synced) {
    if (sourceIsBase) {
      basePlayer?.seek(time)
      setTimeout(() => reactPlayer?.seek(Math.max(0, time + delay)), 150)
    } else {
      reactPlayer?.seek(time)
      setTimeout(() => basePlayer?.seek(Math.max(0, time - delay)), 150)
    }
  } else {
    if (sourceIsBase) basePlayer?.seek(time)
    else reactPlayer?.seek(time)
  }
  setTimeout(() => set({ seeking: false, userInteracting: false }), SEEK_COOLDOWN)
}

export function syncToggle(): void {
  if (basePlayer?.isPlaying() || reactPlayer?.isPlaying()) {
    syncPause(true)
  } else {
    syncPlay(true)
  }
}

function syncLoop(): void {
  if (!get().synced || !basePlayer || !reactPlayer) return
  if (get().seeking || get().userInteracting) return
  const baseTime = basePlayer.getCurrentTime()
  const reactTime = reactPlayer.getCurrentTime()
  const { delay } = get()
  const targetReact = baseTime + delay
  const drift = Math.abs(reactTime - targetReact)
  const threshold = getSyncThreshold()
  let health: SyncHealth = 'healthy'
  if (drift <= threshold * 0.5) {
    driftRetryCount = 0
    lastDriftDirection = 0
  } else if (drift > threshold * 2) {
    health = 'drifting'
  } else if (drift > threshold) {
    health = 'correcting'
  }
  set({ syncHealth: health })
  const basePlaying = basePlayer.isPlaying()
  const reactPlaying = reactPlayer.isPlaying()
  if (basePlaying !== reactPlaying) {
    if (basePlaying) reactPlayer.play()
    else reactPlayer.pause()
  }
  if (basePlaying && reactPlaying && drift > threshold) {
    const driftDir = Math.sign(targetReact - reactTime)
    if (driftDir !== lastDriftDirection) {
      driftRetryCount = 0
      lastDriftDirection = driftDir
    }
    driftRetryCount++
    if (drift < 0.3 && drift > 0.05) {
      const rate = driftDir > 0 ? 1.03 : 0.97
      reactPlayer.setPlaybackRate(rate)
      setTimeout(() => reactPlayer?.setPlaybackRate(1.0), 500)
    } else {
      const aggression = drift > threshold * 2 ? 0.85 : 0.6
      const correction = reactTime + (targetReact - reactTime) * aggression
      reactPlayer.seek(correction)
    }
    if (driftRetryCount > 3 && drift > threshold * 1.5) {
      const fallback = Math.max(0, reactTime - delay)
      basePlayer.seek(fallback)
      driftRetryCount = 0
    }
  }
}

function startSyncLoop(): void {
  stopSyncLoop()
  syncIntervalId = setInterval(syncLoop, getSyncInterval())
}

function stopSyncLoop(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId)
    syncIntervalId = null
  }
}

export function getBaseCurrentTime(): number {
  return basePlayer?.getCurrentTime() || 0
}

export function getReactCurrentTime(): number {
  return reactPlayer?.getCurrentTime() || 0
}

export function getBaseDuration(): number {
  return basePlayer?.getDuration() || 0
}

export function getReactDuration(): number {
  return reactPlayer?.getDuration() || 0
}

export function isBasePlaying(): boolean {
  return basePlayer?.isPlaying() || false
}

export function isReactPlaying(): boolean {
  return reactPlayer?.isPlaying() || false
}

export function setBaseVolume(v: number): void {
  basePlayer?.setVolume(v)
  set({ baseVolume: v })
}

export function setReactVolume(v: number): void {
  reactPlayer?.setVolume(v)
  set({ reactVolume: v })
}


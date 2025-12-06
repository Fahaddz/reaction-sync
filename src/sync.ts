import type { Player, PlayState } from './player.ts'
import { get, set, type SyncHealth } from './state.ts'
import { clamp } from './utils.ts'

let basePlayer: Player | null = null
let reactPlayer: Player | null = null
let rafId: number | null = null
let lastSyncTime = 0

const SYNC_INTERVAL_MS = 100
const TIGHT_THRESHOLD = 0.05
const LOOSE_THRESHOLD = 0.25
const SEEK_THRESHOLD = 0.5
const RATE_MIN = 0.97
const RATE_MAX = 1.03
const SEEK_COOLDOWN = 600
const DELAY_STEP = 0.1
const DRIFT_HISTORY_SIZE = 10
const SEEK_VERIFY_DELAY = 150

let isBuffering = { base: false, react: false }
let driftHistory: number[] = []
let currentRate = 1.0
let lastSeekTime = 0
let pendingSeekVerify: { target: number; time: number } | null = null
let consecutiveDriftDir = 0
let lastDriftDir = 0

function getAdaptiveThreshold(): number {
  if (isBuffering.base || isBuffering.react) return LOOSE_THRESHOLD
  if (get().seeking || get().userInteracting) return LOOSE_THRESHOLD
  const avgDrift = driftHistory.length > 0 
    ? driftHistory.reduce((a, b) => a + Math.abs(b), 0) / driftHistory.length 
    : 0
  if (avgDrift < TIGHT_THRESHOLD) return TIGHT_THRESHOLD
  return clamp(avgDrift * 1.5, TIGHT_THRESHOLD, LOOSE_THRESHOLD)
}

function addDriftSample(drift: number): void {
  driftHistory.push(drift)
  if (driftHistory.length > DRIFT_HISTORY_SIZE) driftHistory.shift()
}

function getDriftTrend(): number {
  if (driftHistory.length < 3) return 0
  const recent = driftHistory.slice(-5)
  const positive = recent.filter(d => d > 0.01).length
  const negative = recent.filter(d => d < -0.01).length
  if (positive >= 4) return 1
  if (negative >= 4) return -1
  return 0
}

function calculateRateCorrection(drift: number, threshold: number): number {
  if (Math.abs(drift) <= threshold * 0.5) {
    return currentRate > 1 ? Math.max(1.0, currentRate - 0.002) : Math.min(1.0, currentRate + 0.002)
  }
  const driftDir = Math.sign(drift)
  const driftMagnitude = Math.abs(drift)
  let targetRate = 1.0
  if (driftMagnitude > threshold) {
    const intensity = clamp((driftMagnitude - threshold) / (SEEK_THRESHOLD - threshold), 0, 1)
    const rateOffset = intensity * 0.03
    targetRate = driftDir > 0 ? 1.0 + rateOffset : 1.0 - rateOffset
  }
  const smoothing = 0.3
  return clamp(currentRate + (targetRate - currentRate) * smoothing, RATE_MIN, RATE_MAX)
}

export function setPlayers(base: Player | null, react: Player | null): void {
  if (basePlayer) basePlayer.onStateChange(() => {})
  if (reactPlayer) reactPlayer.onStateChange(() => {})
  basePlayer = base
  reactPlayer = react
  if (basePlayer) {
    basePlayer.onStateChange((state: PlayState) => {
      isBuffering.base = state === 'buffering'
      handleBufferingChange()
    })
  }
  if (reactPlayer) {
    reactPlayer.onStateChange((state: PlayState) => {
      isBuffering.react = state === 'buffering'
      handleBufferingChange()
    })
  }
}

function handleBufferingChange(): void {
  if (!get().synced || !basePlayer || !reactPlayer) return
  if (isBuffering.base || isBuffering.react) {
    if (isBuffering.base && reactPlayer.isPlaying()) reactPlayer.pause()
    if (isBuffering.react && basePlayer.isPlaying()) basePlayer.pause()
  }
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
  driftHistory = []
  currentRate = 1.0
  consecutiveDriftDir = 0
  lastDriftDir = 0
  set({ delay: clamp(delay, -300, 300), synced: true, syncHealth: 'healthy' })
  startSyncLoop()
}

export function disableSync(): void {
  stopSyncLoop()
  set({ synced: false, syncHealth: '' })
  reactPlayer?.setPlaybackRate(1)
  currentRate = 1.0
  driftHistory = []
  consecutiveDriftDir = 0
  lastDriftDir = 0
  isBuffering = { base: false, react: false }
}

export function forceResync(): void {
  if (!basePlayer || !reactPlayer) return
  const wasPlaying = basePlayer.isPlaying() || reactPlayer.isPlaying()
  basePlayer.pause()
  reactPlayer.pause()
  currentRate = 1.0
  reactPlayer.setPlaybackRate(1.0)
  const { delay } = get()
  const baseTime = basePlayer.getCurrentTime()
  const targetReact = Math.max(0, baseTime + delay)
  reactPlayer.seek(targetReact)
  lastSeekTime = Date.now()
  pendingSeekVerify = { target: targetReact, time: Date.now() }
  setTimeout(() => {
    verifySeek()
    setTimeout(() => {
      if (wasPlaying) {
        basePlayer?.play()
        reactPlayer?.play()
      }
      driftHistory = []
      consecutiveDriftDir = 0
    }, 100)
  }, SEEK_VERIFY_DELAY)
}

function verifySeek(): void {
  if (!pendingSeekVerify || !reactPlayer) return
  const actual = reactPlayer.getCurrentTime()
  const expected = pendingSeekVerify.target
  const error = Math.abs(actual - expected)
  if (error > 0.2 && Date.now() - pendingSeekVerify.time < 1000) {
    reactPlayer.seek(expected)
  }
  pendingSeekVerify = null
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
    lastSeekTime = Date.now()
    pendingSeekVerify = { target: targetReact, time: Date.now() }
    setTimeout(verifySeek, SEEK_VERIFY_DELAY)
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
  lastSeekTime = Date.now()
  if (synced) {
    if (sourceIsBase) {
      basePlayer?.seek(time)
      const targetReact = Math.max(0, time + delay)
      setTimeout(() => {
        reactPlayer?.seek(targetReact)
        pendingSeekVerify = { target: targetReact, time: Date.now() }
        setTimeout(verifySeek, SEEK_VERIFY_DELAY)
      }, 100)
    } else {
      reactPlayer?.seek(time)
      const targetBase = Math.max(0, time - delay)
      setTimeout(() => basePlayer?.seek(targetBase), 100)
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

function syncLoop(timestamp: number): void {
  if (!get().synced) {
    rafId = null
    return
  }
  rafId = requestAnimationFrame(syncLoop)
  if (timestamp - lastSyncTime < SYNC_INTERVAL_MS) return
  lastSyncTime = timestamp
  if (!basePlayer || !reactPlayer) return
  if (get().seeking || get().userInteracting) return
  if (Date.now() - lastSeekTime < SEEK_COOLDOWN) return
  if (isBuffering.base || isBuffering.react) {
    set({ syncHealth: 'correcting' })
    return
  }
  const baseTime = basePlayer.getCurrentTime()
  const reactTime = reactPlayer.getCurrentTime()
  const { delay } = get()
  const targetReact = baseTime + delay
  const drift = targetReact - reactTime
  addDriftSample(drift)
  const threshold = getAdaptiveThreshold()
  const absDrift = Math.abs(drift)
  let health: SyncHealth = 'healthy'
  if (absDrift <= threshold * 0.5) {
    health = 'healthy'
  } else if (absDrift > SEEK_THRESHOLD) {
    health = 'drifting'
  } else if (absDrift > threshold) {
    health = 'correcting'
  }
  set({ syncHealth: health })
  const basePlaying = basePlayer.isPlaying()
  const reactPlaying = reactPlayer.isPlaying()
  if (basePlaying && !reactPlaying && !isBuffering.react) {
    reactPlayer.play()
    return
  }
  if (!basePlaying && reactPlaying) {
    reactPlayer.pause()
    return
  }
  if (!basePlaying || !reactPlaying) {
    if (currentRate !== 1.0) {
      currentRate = 1.0
      reactPlayer.setPlaybackRate(1.0)
    }
    return
  }
  const driftDir = Math.sign(drift)
  if (driftDir === lastDriftDir && driftDir !== 0) {
    consecutiveDriftDir++
  } else {
    consecutiveDriftDir = 0
  }
  lastDriftDir = driftDir
  if (absDrift > SEEK_THRESHOLD) {
    currentRate = 1.0
    reactPlayer.setPlaybackRate(1.0)
    const correction = targetReact
    reactPlayer.seek(correction)
    lastSeekTime = Date.now()
    pendingSeekVerify = { target: correction, time: Date.now() }
    setTimeout(verifySeek, SEEK_VERIFY_DELAY)
    driftHistory = []
    consecutiveDriftDir = 0
    return
  }
  if (absDrift > threshold || consecutiveDriftDir > 5) {
    const trend = getDriftTrend()
    let newRate = calculateRateCorrection(drift, threshold)
    if (trend !== 0 && Math.sign(trend) === driftDir) {
      newRate = clamp(newRate + trend * 0.005, RATE_MIN, RATE_MAX)
    }
    if (Math.abs(newRate - currentRate) > 0.001) {
      currentRate = newRate
      reactPlayer.setPlaybackRate(currentRate)
    }
  } else if (absDrift <= threshold * 0.3 && currentRate !== 1.0) {
    currentRate = 1.0
    reactPlayer.setPlaybackRate(1.0)
  }
}

function startSyncLoop(): void {
  stopSyncLoop()
  lastSyncTime = 0
  rafId = requestAnimationFrame(syncLoop)
}

function stopSyncLoop(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
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

export function getCurrentRate(): number {
  return currentRate
}

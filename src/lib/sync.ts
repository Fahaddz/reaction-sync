import type { Player, PlayState } from './player.ts'
import { get } from 'svelte/store'
import {
  synced,
  delay as delayStore,
  syncHealth,
  interactionState,
  baseVolume as baseVolumeStore,
  reactVolume as reactVolumeStore,
  lastInteractionTime,
  syncStats,
  userSpeed as userSpeedStore,
  baseSource,
  reactSource,
  type SyncHealth as SyncHealthType,
  type SyncStats
} from './stores.ts'
import { clamp } from './utils.ts'

const SYNC_INTERVAL_MS = 100
const TIGHT_THRESHOLD = 0.05
const LOOSE_THRESHOLD = 0.25
const SEEK_THRESHOLD = 0.5
const RATE_CORRECTION_MIN = 0.97
const RATE_CORRECTION_MAX = 1.03
const SEEK_COOLDOWN = 300
const DELAY_STEP = 0.1
const DRIFT_HISTORY_SIZE = 10
const SEEK_VERIFY_DELAY = 150
const BUFFER_FREQUENCY_WINDOW = 30000
const BUFFER_FREQUENCY_THRESHOLD = 3
const STABLE_PLAYBACK_DURATION = 10000
const THRESHOLD_INCREASE_STEP = 0.05
const THRESHOLD_DECREASE_STEP = 0.01

export class SyncEngine {
  private basePlayer: Player | null = null
  private reactPlayer: Player | null = null
  private rafId: number | null = null
  private lastSyncTime = 0
  private isBuffering = { base: false, react: false }
  private bufferPauseActive = false
  private wasPlayingBeforeBuffer = false
  private driftHistory: number[] = []
  private driftCorrection = 1.0
  private lastSeekTime = 0
  private pendingSeekVerify: { target: number; time: number } | null = null
  private consecutiveDriftDir = 0
  private lastDriftDir = 0
  private bufferEvents: number[] = []
  private lastStableTime = 0
  private adaptiveThresholdOffset = 0

  private getBaseThreshold(): number {
    const base = get(baseSource)
    const react = get(reactSource)
    const baseIsYouTube = base?.type === 'youtube'
    const reactIsYouTube = react?.type === 'youtube'
    if (baseIsYouTube || reactIsYouTube) {
      return LOOSE_THRESHOLD
    }
    return TIGHT_THRESHOLD
  }

  private recordBufferEvent(): void {
    const now = Date.now()
    this.bufferEvents.push(now)
    this.bufferEvents = this.bufferEvents.filter(t => now - t < BUFFER_FREQUENCY_WINDOW)
  }

  private getBufferFrequency(): number {
    const now = Date.now()
    this.bufferEvents = this.bufferEvents.filter(t => now - t < BUFFER_FREQUENCY_WINDOW)
    return this.bufferEvents.length
  }

  private updateAdaptiveThreshold(): void {
    const bufferFreq = this.getBufferFrequency()
    const now = Date.now()
    
    if (bufferFreq >= BUFFER_FREQUENCY_THRESHOLD) {
      this.adaptiveThresholdOffset = Math.min(
        this.adaptiveThresholdOffset + THRESHOLD_INCREASE_STEP,
        LOOSE_THRESHOLD - TIGHT_THRESHOLD
      )
      this.lastStableTime = now
    } else if (now - this.lastStableTime > STABLE_PLAYBACK_DURATION && this.adaptiveThresholdOffset > 0) {
      this.adaptiveThresholdOffset = Math.max(
        this.adaptiveThresholdOffset - THRESHOLD_DECREASE_STEP,
        0
      )
    }
  }

  private updateSyncStats(drift: number, threshold: number): void {
    const baseThreshold = this.getBaseThreshold()
    let thresholdMode: 'tight' | 'loose' | 'adaptive'
    if (baseThreshold === TIGHT_THRESHOLD && this.adaptiveThresholdOffset === 0) {
      thresholdMode = 'tight'
    } else if (baseThreshold === LOOSE_THRESHOLD) {
      thresholdMode = 'loose'
    } else {
      thresholdMode = 'adaptive'
    }
    const userSpeed = get(userSpeedStore)
    syncStats.set({
      drift,
      rate: userSpeed * this.driftCorrection,
      baseBuffering: this.isBuffering.base,
      reactBuffering: this.isBuffering.react,
      bufferPauseActive: this.bufferPauseActive,
      thresholdMode,
      currentThreshold: threshold
    })
  }

  private getAdaptiveThreshold(): number {
    if (this.isBuffering.base || this.isBuffering.react) return LOOSE_THRESHOLD
    if (get(interactionState) !== 'idle') return LOOSE_THRESHOLD
    
    const baseThreshold = this.getBaseThreshold()
    this.updateAdaptiveThreshold()
    
    const driftTrend = this.getDriftTrend()
    let driftAdjustment = 0
    if (driftTrend !== 0) {
      driftAdjustment = 0.02
    }
    
    return clamp(
      baseThreshold + this.adaptiveThresholdOffset + driftAdjustment,
      TIGHT_THRESHOLD,
      LOOSE_THRESHOLD
    )
  }

  private addDriftSample(drift: number): void {
    this.driftHistory.push(drift)
    if (this.driftHistory.length > DRIFT_HISTORY_SIZE) this.driftHistory.shift()
  }

  private getDriftTrend(): number {
    if (this.driftHistory.length < 3) return 0
    const recent = this.driftHistory.slice(-5)
    const positive = recent.filter(d => d > 0.01).length
    const negative = recent.filter(d => d < -0.01).length
    if (positive >= 4) return 1
    if (negative >= 4) return -1
    return 0
  }

  private calculateRateCorrection(drift: number, threshold: number): number {
    if (Math.abs(drift) <= threshold * 0.5) {
      return this.driftCorrection > 1 ? Math.max(1.0, this.driftCorrection - 0.002) : Math.min(1.0, this.driftCorrection + 0.002)
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
    return clamp(this.driftCorrection + (targetRate - this.driftCorrection) * smoothing, RATE_CORRECTION_MIN, RATE_CORRECTION_MAX)
  }

  private applyPlaybackRate(): void {
    const userSpeed = get(userSpeedStore)
    const finalRate = userSpeed * this.driftCorrection
    this.basePlayer?.setPlaybackRate(finalRate)
    this.reactPlayer?.setPlaybackRate(finalRate)
  }

  private handleBufferingChange(): void {
    if (!get(synced) || !this.basePlayer || !this.reactPlayer) return
    if (get(interactionState) !== 'idle') return
    
    const anyBuffering = this.isBuffering.base || this.isBuffering.react
    
    if (anyBuffering && !this.bufferPauseActive) {
      this.recordBufferEvent()
      this.wasPlayingBeforeBuffer = this.basePlayer.isPlaying() || this.reactPlayer.isPlaying()
      if (this.wasPlayingBeforeBuffer) {
        this.bufferPauseActive = true
        if (!this.isBuffering.base && this.basePlayer.isPlaying()) {
          this.basePlayer.pause()
        }
        if (!this.isBuffering.react && this.reactPlayer.isPlaying()) {
          this.reactPlayer.pause()
        }
      }
    } else if (!anyBuffering && this.bufferPauseActive) {
      this.bufferPauseActive = false
      if (this.wasPlayingBeforeBuffer) {
        this.basePlayer.play()
        this.reactPlayer.play()
      }
      this.wasPlayingBeforeBuffer = false
    }
  }

  private verifySeek(): void {
    if (!this.pendingSeekVerify || !this.reactPlayer) return
    const actual = this.reactPlayer.getCurrentTime()
    const expected = this.pendingSeekVerify.target
    const error = Math.abs(actual - expected)
    if (error > 0.2 && Date.now() - this.pendingSeekVerify.time < 1000) {
      this.reactPlayer.seek(expected)
    }
    this.pendingSeekVerify = null
  }

  private syncLoop = (timestamp: number): void => {
    if (!get(synced)) {
      this.rafId = null
      return
    }
    this.rafId = requestAnimationFrame(this.syncLoop)
    if (timestamp - this.lastSyncTime < SYNC_INTERVAL_MS) return
    this.lastSyncTime = timestamp
    if (!this.basePlayer || !this.reactPlayer) return
    if (get(interactionState) !== 'idle') return
    if (Date.now() - this.lastSeekTime < SEEK_COOLDOWN) return
    if (this.isBuffering.base || this.isBuffering.react) {
      syncHealth.set('correcting')
      return
    }
    const basePlaying = this.basePlayer.isPlaying()
    const reactPlaying = this.reactPlayer.isPlaying()
    
    // Don't sync if both videos are paused
    if (!basePlaying && !reactPlaying) {
      if (this.driftCorrection !== 1.0) {
        this.driftCorrection = 1.0
        this.applyPlaybackRate()
      }
      return
    }
    
    const baseTime = this.basePlayer.getCurrentTime()
    const reactTime = this.reactPlayer.getCurrentTime()
    const currentDelay = get(delayStore)
    const targetReact = baseTime + currentDelay
    const drift = targetReact - reactTime
    this.addDriftSample(drift)
    const threshold = this.getAdaptiveThreshold()
    const absDrift = Math.abs(drift)
    let health: SyncHealthType = 'healthy'
    if (absDrift <= threshold * 0.5) {
      health = 'healthy'
    } else if (absDrift > SEEK_THRESHOLD) {
      health = 'drifting'
    } else if (absDrift > threshold) {
      health = 'correcting'
    }
    syncHealth.set(health)
    this.updateSyncStats(drift, threshold)
    
    // Only sync play/pause state if there's a mismatch AND we're not already well-synced
    // This prevents the feedback loop
    if (basePlaying && !reactPlaying && !this.isBuffering.react && absDrift > threshold * 0.5) {
      this.reactPlayer.play()
      return
    }
    if (!basePlaying && reactPlaying && !this.isBuffering.base && absDrift > threshold * 0.5) {
      this.basePlayer.play()
      return
    }
    
    if (!basePlaying || !reactPlaying) {
      if (this.driftCorrection !== 1.0) {
        this.driftCorrection = 1.0
        this.applyPlaybackRate()
      }
      return
    }
    const driftDir = Math.sign(drift)
    if (driftDir === this.lastDriftDir && driftDir !== 0) {
      this.consecutiveDriftDir++
    } else {
      this.consecutiveDriftDir = 0
    }
    this.lastDriftDir = driftDir
    if (absDrift > SEEK_THRESHOLD) {
      this.driftCorrection = 1.0
      this.applyPlaybackRate()
      const correction = targetReact
      this.reactPlayer.seek(correction)
      this.lastSeekTime = Date.now()
      this.pendingSeekVerify = { target: correction, time: Date.now() }
      setTimeout(() => this.verifySeek(), SEEK_VERIFY_DELAY)
      this.driftHistory = []
      this.consecutiveDriftDir = 0
      return
    }
    if (absDrift > threshold || this.consecutiveDriftDir > 5) {
      const trend = this.getDriftTrend()
      let newRate = this.calculateRateCorrection(drift, threshold)
      if (trend !== 0 && Math.sign(trend) === driftDir) {
        newRate = clamp(newRate + trend * 0.005, RATE_CORRECTION_MIN, RATE_CORRECTION_MAX)
      }
      if (Math.abs(newRate - this.driftCorrection) > 0.001) {
        this.driftCorrection = newRate
        this.applyPlaybackRate()
      }
    } else if (absDrift <= threshold * 0.3 && this.driftCorrection !== 1.0) {
      this.driftCorrection = 1.0
      this.applyPlaybackRate()
    }
  }

  private startSyncLoop(): void {
    this.stopSyncLoop()
    this.lastSyncTime = 0
    this.rafId = requestAnimationFrame(this.syncLoop)
  }

  private stopSyncLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  setPlayers(base: Player | null, react: Player | null): void {
    if (this.basePlayer) this.basePlayer.onStateChange(() => {})
    if (this.reactPlayer) this.reactPlayer.onStateChange(() => {})
    this.basePlayer = base
    this.reactPlayer = react
    if (this.basePlayer) {
      this.basePlayer.onStateChange((state: PlayState) => {
        this.isBuffering.base = state === 'buffering'
        this.handleBufferingChange()
        // Don't sync play/pause in state callbacks - let the sync loop handle it
        // This prevents feedback loops where each video triggers the other
      })
    }
    if (this.reactPlayer) {
      this.reactPlayer.onStateChange((state: PlayState) => {
        this.isBuffering.react = state === 'buffering'
        this.handleBufferingChange()
        // Don't sync play/pause in state callbacks - let the sync loop handle it
        // This prevents feedback loops where each video triggers the other
      })
    }
  }

  getBasePlayer(): Player | null {
    return this.basePlayer
  }

  getReactPlayer(): Player | null {
    return this.reactPlayer
  }

  enableSync(): void {
    if (!this.basePlayer || !this.reactPlayer) return
    const baseTime = this.basePlayer.getCurrentTime()
    const reactTime = this.reactPlayer.getCurrentTime()
    const computedDelay = Math.round((reactTime - baseTime) * 100) / 100
    this.driftHistory = []
    this.driftCorrection = 1.0
    this.consecutiveDriftDir = 0
    this.lastDriftDir = 0
    delayStore.set(clamp(computedDelay, -300, 300))
    synced.set(true)
    syncHealth.set('healthy')
    this.applyPlaybackRate()
    this.startSyncLoop()
  }

  disableSync(): void {
    this.stopSyncLoop()
    synced.set(false)
    syncHealth.set('')
    this.driftCorrection = 1.0
    this.applyPlaybackRate()
    this.driftHistory = []
    this.consecutiveDriftDir = 0
    this.lastDriftDir = 0
    this.isBuffering = { base: false, react: false }
    this.bufferPauseActive = false
    this.wasPlayingBeforeBuffer = false
    this.bufferEvents = []
    this.adaptiveThresholdOffset = 0
  }

  forceResync(): void {
    if (!this.basePlayer || !this.reactPlayer) return
    const wasPlaying = this.basePlayer.isPlaying() || this.reactPlayer.isPlaying()
    this.basePlayer.pause()
    this.reactPlayer.pause()
    this.driftCorrection = 1.0
    this.applyPlaybackRate()
    const currentDelay = get(delayStore)
    const baseTime = this.basePlayer.getCurrentTime()
    const targetReact = Math.max(0, baseTime + currentDelay)
    this.reactPlayer.seek(targetReact)
    this.lastSeekTime = Date.now()
    this.pendingSeekVerify = { target: targetReact, time: Date.now() }
    setTimeout(() => {
      this.verifySeek()
      setTimeout(() => {
        if (wasPlaying) {
          this.basePlayer?.play()
          this.reactPlayer?.play()
        }
        this.driftHistory = []
        this.consecutiveDriftDir = 0
      }, 100)
    }, SEEK_VERIFY_DELAY)
  }

  setDelay(value: number, shouldSeek = false): void {
    const newDelay = clamp(Math.round(value * 100) / 100, -300, 300)
    delayStore.set(newDelay)
    if (!get(synced)) {
      synced.set(true)
      this.startSyncLoop()
    }
    if (shouldSeek && this.basePlayer && this.reactPlayer) {
      const baseTime = this.basePlayer.getCurrentTime()
      const targetReact = Math.max(0, baseTime + newDelay)
      this.reactPlayer.seek(targetReact)
      this.lastSeekTime = Date.now()
      this.pendingSeekVerify = { target: targetReact, time: Date.now() }
      setTimeout(() => this.verifySeek(), SEEK_VERIFY_DELAY)
    }
  }

  adjustDelay(direction: number, elapsed: number): void {
    const currentDelay = get(delayStore)
    let step = DELAY_STEP
    if (elapsed > 2000) step = 1.0
    else if (elapsed > 1000) step = 0.5
    this.setDelay(currentDelay + direction * step, true)
  }

  syncPlay(sourceIsBase: boolean): void {
    interactionState.set('interacting')
    lastInteractionTime.set(Date.now())
    if (get(synced)) {
      this.basePlayer?.play()
      this.reactPlayer?.play()
    } else {
      if (sourceIsBase) this.basePlayer?.play()
      else this.reactPlayer?.play()
    }
    setTimeout(() => interactionState.set('idle'), SEEK_COOLDOWN)
  }

  syncPause(sourceIsBase: boolean): void {
    interactionState.set('interacting')
    lastInteractionTime.set(Date.now())
    if (get(synced)) {
      this.basePlayer?.pause()
      this.reactPlayer?.pause()
    } else {
      if (sourceIsBase) this.basePlayer?.pause()
      else this.reactPlayer?.pause()
    }
    setTimeout(() => interactionState.set('idle'), SEEK_COOLDOWN)
  }

  syncSeek(sourceIsBase: boolean, time: number): void {
    const wasPlaying = this.basePlayer?.isPlaying() || this.reactPlayer?.isPlaying()
    interactionState.set('seeking')
    lastInteractionTime.set(Date.now())
    const currentDelay = get(delayStore)
    const isSynced = get(synced)
    this.lastSeekTime = Date.now()
    if (isSynced) {
      const baseTime = sourceIsBase ? time : Math.max(0, time - currentDelay)
      const reactTime = sourceIsBase ? Math.max(0, time + currentDelay) : time
      this.basePlayer?.seek(baseTime)
      this.reactPlayer?.seek(reactTime)
      this.pendingSeekVerify = { target: reactTime, time: Date.now() }
      setTimeout(() => this.verifySeek(), SEEK_VERIFY_DELAY)
      if (wasPlaying) {
        setTimeout(() => {
          if (get(synced) && get(interactionState) === 'idle') {
            this.basePlayer?.play()
            this.reactPlayer?.play()
          }
        }, SEEK_COOLDOWN + 100)
      }
    } else {
      if (sourceIsBase) this.basePlayer?.seek(time)
      else this.reactPlayer?.seek(time)
    }
    setTimeout(() => interactionState.set('idle'), SEEK_COOLDOWN)
  }

  syncToggle(): void {
    if (this.basePlayer?.isPlaying() || this.reactPlayer?.isPlaying()) {
      this.syncPause(true)
    } else {
      this.syncPlay(true)
    }
  }

  getBaseCurrentTime(): number {
    return this.basePlayer?.getCurrentTime() || 0
  }

  getReactCurrentTime(): number {
    return this.reactPlayer?.getCurrentTime() || 0
  }

  getBaseDuration(): number {
    return this.basePlayer?.getDuration() || 0
  }

  getReactDuration(): number {
    return this.reactPlayer?.getDuration() || 0
  }

  isBasePlaying(): boolean {
    return this.basePlayer?.isPlaying() || false
  }

  isReactPlaying(): boolean {
    return this.reactPlayer?.isPlaying() || false
  }

  setBaseVolume(v: number): void {
    this.basePlayer?.setVolume(v)
    baseVolumeStore.set(v)
  }

  setReactVolume(v: number): void {
    this.reactPlayer?.setVolume(v)
    reactVolumeStore.set(v)
  }

  getCurrentRate(): number {
    const userSpeed = get(userSpeedStore)
    return userSpeed * this.driftCorrection
  }

  getDriftCorrection(): number {
    return this.driftCorrection
  }

  setUserSpeed(speed: number): void {
    const clampedSpeed = clamp(speed, 0.25, 4.0)
    userSpeedStore.set(clampedSpeed)
    this.applyPlaybackRate()
  }

  getUserSpeed(): number {
    return get(userSpeedStore)
  }

  isBufferPauseActive(): boolean {
    return this.bufferPauseActive
  }

  getThresholdInfo(): { baseThreshold: number; adaptiveOffset: number; currentThreshold: number } {
    const baseThreshold = this.getBaseThreshold()
    return {
      baseThreshold,
      adaptiveOffset: this.adaptiveThresholdOffset,
      currentThreshold: this.getAdaptiveThreshold()
    }
  }

  getBufferEventCount(): number {
    return this.getBufferFrequency()
  }
}

export const syncEngine = new SyncEngine()

export const setPlayers = syncEngine.setPlayers.bind(syncEngine)
export const getBasePlayer = syncEngine.getBasePlayer.bind(syncEngine)
export const getReactPlayer = syncEngine.getReactPlayer.bind(syncEngine)
export const enableSync = syncEngine.enableSync.bind(syncEngine)
export const disableSync = syncEngine.disableSync.bind(syncEngine)
export const forceResync = syncEngine.forceResync.bind(syncEngine)
export const setDelay = syncEngine.setDelay.bind(syncEngine)
export const adjustDelay = syncEngine.adjustDelay.bind(syncEngine)
export const syncPlay = syncEngine.syncPlay.bind(syncEngine)
export const syncPause = syncEngine.syncPause.bind(syncEngine)
export const syncSeek = syncEngine.syncSeek.bind(syncEngine)
export const syncToggle = syncEngine.syncToggle.bind(syncEngine)
export const getBaseCurrentTime = syncEngine.getBaseCurrentTime.bind(syncEngine)
export const getReactCurrentTime = syncEngine.getReactCurrentTime.bind(syncEngine)
export const getBaseDuration = syncEngine.getBaseDuration.bind(syncEngine)
export const getReactDuration = syncEngine.getReactDuration.bind(syncEngine)
export const isBasePlaying = syncEngine.isBasePlaying.bind(syncEngine)
export const isReactPlaying = syncEngine.isReactPlaying.bind(syncEngine)
export const setBaseVolume = syncEngine.setBaseVolume.bind(syncEngine)
export const setReactVolume = syncEngine.setReactVolume.bind(syncEngine)
export const getCurrentRate = syncEngine.getCurrentRate.bind(syncEngine)
export const getDriftCorrection = syncEngine.getDriftCorrection.bind(syncEngine)
export const setUserSpeed = syncEngine.setUserSpeed.bind(syncEngine)
export const getUserSpeed = syncEngine.getUserSpeed.bind(syncEngine)
export const isBufferPauseActive = syncEngine.isBufferPauseActive.bind(syncEngine)
export const getThresholdInfo = syncEngine.getThresholdInfo.bind(syncEngine)
export const getBufferEventCount = syncEngine.getBufferEventCount.bind(syncEngine)

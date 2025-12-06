import type { Player, PlayState } from './player.ts'
import { get, set, type SyncHealth } from './state.ts'
import { clamp } from './utils.ts'

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

export class SyncEngine {
  private basePlayer: Player | null = null
  private reactPlayer: Player | null = null
  private rafId: number | null = null
  private lastSyncTime = 0
  private isBuffering = { base: false, react: false }
  private driftHistory: number[] = []
  private currentRate = 1.0
  private lastSeekTime = 0
  private pendingSeekVerify: { target: number; time: number } | null = null
  private consecutiveDriftDir = 0
  private lastDriftDir = 0

  private getAdaptiveThreshold(): number {
    if (this.isBuffering.base || this.isBuffering.react) return LOOSE_THRESHOLD
    if (get().interactionState !== 'idle') return LOOSE_THRESHOLD
    const avgDrift = this.driftHistory.length > 0 
      ? this.driftHistory.reduce((a, b) => a + Math.abs(b), 0) / this.driftHistory.length 
      : 0
    if (avgDrift < TIGHT_THRESHOLD) return TIGHT_THRESHOLD
    return clamp(avgDrift * 1.5, TIGHT_THRESHOLD, LOOSE_THRESHOLD)
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
      return this.currentRate > 1 ? Math.max(1.0, this.currentRate - 0.002) : Math.min(1.0, this.currentRate + 0.002)
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
    return clamp(this.currentRate + (targetRate - this.currentRate) * smoothing, RATE_MIN, RATE_MAX)
  }

  private handleBufferingChange(): void {
    if (!get().synced || !this.basePlayer || !this.reactPlayer) return
    if (this.isBuffering.base || this.isBuffering.react) {
      if (this.isBuffering.base && this.reactPlayer.isPlaying()) this.reactPlayer.pause()
      if (this.isBuffering.react && this.basePlayer.isPlaying()) this.basePlayer.pause()
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
    if (!get().synced) {
      this.rafId = null
      return
    }
    this.rafId = requestAnimationFrame(this.syncLoop)
    if (timestamp - this.lastSyncTime < SYNC_INTERVAL_MS) return
    this.lastSyncTime = timestamp
    if (!this.basePlayer || !this.reactPlayer) return
    if (get().interactionState !== 'idle') return
    if (Date.now() - this.lastSeekTime < SEEK_COOLDOWN) return
    if (this.isBuffering.base || this.isBuffering.react) {
      set({ syncHealth: 'correcting' })
      return
    }
    const baseTime = this.basePlayer.getCurrentTime()
    const reactTime = this.reactPlayer.getCurrentTime()
    const { delay } = get()
    const targetReact = baseTime + delay
    const drift = targetReact - reactTime
    this.addDriftSample(drift)
    const threshold = this.getAdaptiveThreshold()
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
    const basePlaying = this.basePlayer.isPlaying()
    const reactPlaying = this.reactPlayer.isPlaying()
    if (basePlaying && !reactPlaying && !this.isBuffering.react) {
      this.reactPlayer.play()
      return
    }
    if (!basePlaying && reactPlaying && !this.isBuffering.base) {
      this.basePlayer.play()
      return
    }
    if (!basePlaying || !reactPlaying) {
      if (this.currentRate !== 1.0) {
        this.currentRate = 1.0
        this.reactPlayer.setPlaybackRate(1.0)
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
      this.currentRate = 1.0
      this.reactPlayer.setPlaybackRate(1.0)
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
        newRate = clamp(newRate + trend * 0.005, RATE_MIN, RATE_MAX)
      }
      if (Math.abs(newRate - this.currentRate) > 0.001) {
        this.currentRate = newRate
        this.reactPlayer.setPlaybackRate(this.currentRate)
      }
    } else if (absDrift <= threshold * 0.3 && this.currentRate !== 1.0) {
      this.currentRate = 1.0
      this.reactPlayer.setPlaybackRate(1.0)
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
      })
    }
    if (this.reactPlayer) {
      this.reactPlayer.onStateChange((state: PlayState) => {
        this.isBuffering.react = state === 'buffering'
        this.handleBufferingChange()
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
    const delay = Math.round((reactTime - baseTime) * 100) / 100
    this.driftHistory = []
    this.currentRate = 1.0
    this.consecutiveDriftDir = 0
    this.lastDriftDir = 0
    set({ delay: clamp(delay, -300, 300), synced: true, syncHealth: 'healthy' })
    this.startSyncLoop()
  }

  disableSync(): void {
    this.stopSyncLoop()
    set({ synced: false, syncHealth: '' })
    this.reactPlayer?.setPlaybackRate(1)
    this.currentRate = 1.0
    this.driftHistory = []
    this.consecutiveDriftDir = 0
    this.lastDriftDir = 0
    this.isBuffering = { base: false, react: false }
  }

  forceResync(): void {
    if (!this.basePlayer || !this.reactPlayer) return
    const wasPlaying = this.basePlayer.isPlaying() || this.reactPlayer.isPlaying()
    this.basePlayer.pause()
    this.reactPlayer.pause()
    this.currentRate = 1.0
    this.reactPlayer.setPlaybackRate(1.0)
    const { delay } = get()
    const baseTime = this.basePlayer.getCurrentTime()
    const targetReact = Math.max(0, baseTime + delay)
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
    const delay = clamp(Math.round(value * 100) / 100, -300, 300)
    set({ delay })
    if (!get().synced) {
      set({ synced: true })
      this.startSyncLoop()
    }
    if (shouldSeek && this.basePlayer && this.reactPlayer) {
      const baseTime = this.basePlayer.getCurrentTime()
      const targetReact = Math.max(0, baseTime + delay)
      this.reactPlayer.seek(targetReact)
      this.lastSeekTime = Date.now()
      this.pendingSeekVerify = { target: targetReact, time: Date.now() }
      setTimeout(() => this.verifySeek(), SEEK_VERIFY_DELAY)
    }
  }

  adjustDelay(direction: number, elapsed: number): void {
    const { delay } = get()
    let step = DELAY_STEP
    if (elapsed > 2000) step = 1.0
    else if (elapsed > 1000) step = 0.5
    this.setDelay(delay + direction * step, true)
  }

  syncPlay(sourceIsBase: boolean): void {
    set({ interactionState: 'interacting', lastInteractionTime: Date.now() })
    if (get().synced) {
      this.basePlayer?.play()
      this.reactPlayer?.play()
    } else {
      if (sourceIsBase) this.basePlayer?.play()
      else this.reactPlayer?.play()
    }
    setTimeout(() => set({ interactionState: 'idle' }), SEEK_COOLDOWN)
  }

  syncPause(sourceIsBase: boolean): void {
    set({ interactionState: 'interacting', lastInteractionTime: Date.now() })
    if (get().synced) {
      this.basePlayer?.pause()
      this.reactPlayer?.pause()
    } else {
      if (sourceIsBase) this.basePlayer?.pause()
      else this.reactPlayer?.pause()
    }
    setTimeout(() => set({ interactionState: 'idle' }), SEEK_COOLDOWN)
  }

  syncSeek(sourceIsBase: boolean, time: number): void {
    set({ interactionState: 'seeking', lastInteractionTime: Date.now() })
    const { delay, synced } = get()
    this.lastSeekTime = Date.now()
    if (synced) {
      if (sourceIsBase) {
        this.basePlayer?.seek(time)
        const targetReact = Math.max(0, time + delay)
        setTimeout(() => {
          this.reactPlayer?.seek(targetReact)
          this.pendingSeekVerify = { target: targetReact, time: Date.now() }
          setTimeout(() => this.verifySeek(), SEEK_VERIFY_DELAY)
        }, 100)
      } else {
        this.reactPlayer?.seek(time)
        const targetBase = Math.max(0, time - delay)
        setTimeout(() => this.basePlayer?.seek(targetBase), 100)
      }
    } else {
      if (sourceIsBase) this.basePlayer?.seek(time)
      else this.reactPlayer?.seek(time)
    }
    setTimeout(() => set({ interactionState: 'idle' }), SEEK_COOLDOWN)
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
    set({ baseVolume: v })
  }

  setReactVolume(v: number): void {
    this.reactPlayer?.setVolume(v)
    set({ reactVolume: v })
  }

  getCurrentRate(): number {
    return this.currentRate
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

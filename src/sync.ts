import type { Player, PlayState } from './player.ts'
import { get, set, type SyncHealth } from './state.ts'
import { clamp, normalizePlaybackSpeed, PLAYBACK_SPEED_MAX, PLAYBACK_SPEED_MIN, PLAYBACK_SPEED_STEP } from './utils.ts'

const SYNC_INTERVAL_MS = 100
const TIGHT_THRESHOLD = 0.05
const LOOSE_THRESHOLD = 0.25
const SEEK_THRESHOLD = 0.5
const CORRECTION_RANGE = 0.03
const SEEK_COOLDOWN = 300
const DELAY_STEP = 0.1
const DRIFT_HISTORY_SIZE = 10
const SEEK_VERIFY_DELAY = 150

type PlaybackSpeedUpdate = {
  requested: number
  applied: number
  constrained: boolean
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map(v => Math.round(v * 100) / 100))].sort((a, b) => a - b)
}

function nearestRate(target: number, candidates: number[]): number {
  if (candidates.length === 0) return target
  let best = candidates[0] ?? target
  let bestDistance = Math.abs(target - best)
  for (const candidate of candidates) {
    const distance = Math.abs(target - candidate)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

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
  private playbackBaseRate = normalizePlaybackSpeed(get().playbackSpeed)

  private getRateBounds(baseRate: number): { min: number; max: number } {
    return {
      min: clamp(baseRate * (1 - CORRECTION_RANGE), PLAYBACK_SPEED_MIN, PLAYBACK_SPEED_MAX),
      max: clamp(baseRate * (1 + CORRECTION_RANGE), PLAYBACK_SPEED_MIN, PLAYBACK_SPEED_MAX)
    }
  }

  private getSupportedRates(player: Player | null): number[] | null {
    const rates = player?.getAvailablePlaybackRates?.()
    if (!rates || rates.length === 0) return null
    const normalized = uniqueSorted(rates.map(normalizePlaybackSpeed))
    return normalized.length > 0 ? normalized : null
  }

  private resolveSupportedBaseRate(desiredRate: number): number {
    const desired = normalizePlaybackSpeed(desiredRate)
    const baseRates = this.getSupportedRates(this.basePlayer)
    const reactRates = this.getSupportedRates(this.reactPlayer)
    if (!baseRates && !reactRates) return desired
    if (baseRates && !reactRates) return nearestRate(desired, baseRates)
    if (!baseRates && reactRates) return nearestRate(desired, reactRates)
    const shared = baseRates!.filter(rate => reactRates!.some(v => Math.abs(v - rate) < 0.001))
    if (shared.length > 0) return nearestRate(desired, shared)
    return nearestRate(desired, baseRates!)
  }

  private resetCorrectionState(): void {
    this.currentRate = this.playbackBaseRate
    this.driftHistory = []
    this.consecutiveDriftDir = 0
    this.lastDriftDir = 0
  }

  private applyCurrentRates(): void {
    this.basePlayer?.setPlaybackRate(this.playbackBaseRate)
    const reactRate = get().synced ? this.currentRate : this.playbackBaseRate
    this.reactPlayer?.setPlaybackRate(reactRate)
  }

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

  private calculateRateCorrection(drift: number, threshold: number, baseRate: number): number {
    const bounds = this.getRateBounds(baseRate)
    if (Math.abs(drift) <= threshold * 0.5) {
      const nudge = this.currentRate > baseRate ? -0.002 : 0.002
      if (Math.abs(this.currentRate - baseRate) <= 0.002) return baseRate
      return clamp(this.currentRate + nudge, bounds.min, bounds.max)
    }
    const driftDir = Math.sign(drift)
    const driftMagnitude = Math.abs(drift)
    let targetRate = baseRate
    if (driftMagnitude > threshold) {
      const intensity = clamp((driftMagnitude - threshold) / (SEEK_THRESHOLD - threshold), 0, 1)
      const rateOffset = baseRate * CORRECTION_RANGE * intensity
      targetRate = driftDir > 0 ? baseRate + rateOffset : baseRate - rateOffset
    }
    const smoothing = 0.3
    return clamp(this.currentRate + (targetRate - this.currentRate) * smoothing, bounds.min, bounds.max)
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

  private syncIntervalElapsed(timestamp: number): boolean {
    if (timestamp - this.lastSyncTime < SYNC_INTERVAL_MS) return false
    this.lastSyncTime = timestamp
    return true
  }

  private syncPlayersAvailable(): boolean {
    return this.basePlayer !== null && this.reactPlayer !== null
  }

  private syncBaseRateFromState(): void {
    const desiredBaseRate = normalizePlaybackSpeed(get().playbackSpeed)
    if (Math.abs(desiredBaseRate - this.playbackBaseRate) <= 0.001) return

    this.playbackBaseRate = this.resolveSupportedBaseRate(desiredBaseRate)
    this.resetCorrectionState()
    this.applyCurrentRates()
  }

  private shouldDeferSyncWork(): boolean {
    if (get().interactionState !== 'idle') return true
    if (Date.now() - this.lastSeekTime < SEEK_COOLDOWN) return true
    if (this.isBuffering.base || this.isBuffering.react) {
      set({ syncHealth: 'correcting' })
      return true
    }
    return false
  }

  private updateSyncHealth(absDrift: number, threshold: number): void {
    let health: SyncHealth = 'healthy'
    if (absDrift > SEEK_THRESHOLD) {
      health = 'drifting'
    } else if (absDrift > threshold) {
      health = 'correcting'
    }
    set({ syncHealth: health })
  }

  private syncPlaybackStates(): boolean {
    const basePlaying = this.basePlayer!.isPlaying()
    const reactPlaying = this.reactPlayer!.isPlaying()

    if (basePlaying && !reactPlaying && !this.isBuffering.react) {
      this.reactPlayer!.play()
      return true
    }

    if (!basePlaying && reactPlaying && !this.isBuffering.base) {
      this.basePlayer!.play()
      return true
    }

    if (!basePlaying || !reactPlaying) {
      this.resetReactRateToBase()
      return true
    }

    return false
  }

  private resetReactRateToBase(): void {
    if (Math.abs(this.currentRate - this.playbackBaseRate) <= 0.001) return
    this.currentRate = this.playbackBaseRate
    this.reactPlayer?.setPlaybackRate(this.playbackBaseRate)
  }

  private trackDriftDirection(drift: number): number {
    const driftDir = Math.sign(drift)
    if (driftDir === this.lastDriftDir && driftDir !== 0) {
      this.consecutiveDriftDir++
    } else {
      this.consecutiveDriftDir = 0
    }
    this.lastDriftDir = driftDir
    return driftDir
  }

  private applySeekCorrection(targetReact: number): void {
    this.resetReactRateToBase()
    this.scheduleReactSeekVerification(targetReact)
    this.driftHistory = []
    this.consecutiveDriftDir = 0
  }

  private applyRateCorrection(drift: number, threshold: number, driftDir: number): void {
    const trend = this.getDriftTrend()
    let newRate = this.calculateRateCorrection(drift, threshold, this.playbackBaseRate)
    if (trend !== 0 && Math.sign(trend) === driftDir) {
      const bounds = this.getRateBounds(this.playbackBaseRate)
      newRate = clamp(newRate + trend * 0.005, bounds.min, bounds.max)
    }
    if (Math.abs(newRate - this.currentRate) <= 0.001) return
    this.currentRate = newRate
    this.reactPlayer!.setPlaybackRate(this.currentRate)
  }

  private scheduleReactSeekVerification(targetReact: number): void {
    this.reactPlayer!.seek(targetReact)
    this.lastSeekTime = Date.now()
    this.pendingSeekVerify = { target: targetReact, time: Date.now() }
    setTimeout(() => this.verifySeek(), SEEK_VERIFY_DELAY)
  }

  private seekReactToDelayOffset(delay: number): number {
    const baseTime = this.basePlayer!.getCurrentTime()
    const targetReact = Math.max(0, baseTime + delay)
    this.scheduleReactSeekVerification(targetReact)
    return targetReact
  }

  private syncLoop = (timestamp: number): void => {
    if (!get().synced) {
      this.rafId = null
      return
    }
    this.rafId = requestAnimationFrame(this.syncLoop)
    if (!this.syncIntervalElapsed(timestamp)) return
    if (!this.syncPlayersAvailable()) return

    this.syncBaseRateFromState()
    if (this.shouldDeferSyncWork()) return

    const baseTime = this.basePlayer!.getCurrentTime()
    const reactTime = this.reactPlayer!.getCurrentTime()
    const { delay } = get()
    const targetReact = baseTime + delay
    const drift = targetReact - reactTime
    this.addDriftSample(drift)
    const threshold = this.getAdaptiveThreshold()
    const absDrift = Math.abs(drift)
    this.updateSyncHealth(absDrift, threshold)
    if (this.syncPlaybackStates()) return

    const driftDir = this.trackDriftDirection(drift)
    if (absDrift > SEEK_THRESHOLD) {
      this.applySeekCorrection(targetReact)
      return
    }
    if (absDrift > threshold || this.consecutiveDriftDir > 5) {
      this.applyRateCorrection(drift, threshold, driftDir)
    } else if (absDrift <= threshold * 0.3) {
      this.resetReactRateToBase()
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
    this.playbackBaseRate = this.resolveSupportedBaseRate(get().playbackSpeed)
    set({ playbackSpeed: this.playbackBaseRate })
    this.resetCorrectionState()
    this.applyCurrentRates()
    if (this.basePlayer) {
      this.basePlayer.onStateChange((state: PlayState) => {
        this.isBuffering.base = state === 'buffering'
        // Sync pause/play when user interacts with base video directly
        if (get().synced && get().interactionState === 'idle' && this.reactPlayer) {
          if (state === 'paused' && this.reactPlayer.isPlaying()) {
            this.reactPlayer.pause()
          } else if (state === 'playing' && !this.reactPlayer.isPlaying() && !this.isBuffering.react) {
            this.reactPlayer.play()
          }
        }
      })
    }
    if (this.reactPlayer) {
      this.reactPlayer.onStateChange((state: PlayState) => {
        this.isBuffering.react = state === 'buffering'
        // Sync pause/play when user interacts with react video directly
        if (get().synced && get().interactionState === 'idle' && this.basePlayer) {
          if (state === 'paused' && this.basePlayer.isPlaying()) {
            this.basePlayer.pause()
          } else if (state === 'playing' && !this.basePlayer.isPlaying() && !this.isBuffering.base) {
            this.basePlayer.play()
          }
        }
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
    this.playbackBaseRate = this.resolveSupportedBaseRate(get().playbackSpeed)
    set({ playbackSpeed: this.playbackBaseRate })
    this.resetCorrectionState()
    this.applyCurrentRates()
    set({ delay: clamp(delay, -300, 300), synced: true, syncHealth: 'healthy' })
    this.startSyncLoop()
  }

  disableSync(): void {
    this.stopSyncLoop()
    set({ synced: false, syncHealth: '' })
    this.playbackBaseRate = this.resolveSupportedBaseRate(get().playbackSpeed)
    set({ playbackSpeed: this.playbackBaseRate })
    this.resetCorrectionState()
    this.applyCurrentRates()
    this.isBuffering = { base: false, react: false }
  }

  forceResync(): void {
    if (!this.basePlayer || !this.reactPlayer) return
    const wasPlaying = this.basePlayer.isPlaying() || this.reactPlayer.isPlaying()
    this.basePlayer.pause()
    this.reactPlayer.pause()
    this.currentRate = this.playbackBaseRate
    this.reactPlayer.setPlaybackRate(this.playbackBaseRate)
    this.seekReactToDelayOffset(get().delay)
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
      this.seekReactToDelayOffset(delay)
    }
  }

  adjustDelay(direction: number, elapsed: number): void {
    const { delay } = get()
    let step = DELAY_STEP
    if (elapsed > 2000) step = 1.0
    else if (elapsed > 1000) step = 0.5
    this.setDelay(delay + direction * step, true)
  }

  setPlaybackSpeed(value: number): PlaybackSpeedUpdate {
    const requested = normalizePlaybackSpeed(value)
    const applied = this.resolveSupportedBaseRate(requested)
    this.playbackBaseRate = applied
    set({ playbackSpeed: applied })
    this.resetCorrectionState()
    this.applyCurrentRates()
    return { requested, applied, constrained: Math.abs(requested - applied) > PLAYBACK_SPEED_STEP * 0.5 }
  }

  adjustPlaybackSpeed(direction: number): PlaybackSpeedUpdate {
    return this.setPlaybackSpeed(get().playbackSpeed + direction * PLAYBACK_SPEED_STEP)
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
    const wasPlaying = this.basePlayer?.isPlaying() || this.reactPlayer?.isPlaying()
    set({ interactionState: 'seeking', lastInteractionTime: Date.now() })
    const { delay, synced } = get()
    this.lastSeekTime = Date.now()
    if (synced) {
      const baseTime = sourceIsBase ? time : Math.max(0, time - delay)
      const reactTime = sourceIsBase ? Math.max(0, time + delay) : time
      this.basePlayer?.seek(baseTime)
      this.reactPlayer?.seek(reactTime)
      this.pendingSeekVerify = { target: reactTime, time: Date.now() }
      setTimeout(() => this.verifySeek(), SEEK_VERIFY_DELAY)
      if (wasPlaying) {
        setTimeout(() => {
          if (get().synced && get().interactionState === 'idle') {
            this.basePlayer?.play()
            this.reactPlayer?.play()
          }
        }, SEEK_COOLDOWN + 100)
      }
    } else {
      if (sourceIsBase) this.basePlayer?.seek(time)
      else this.reactPlayer?.seek(time)
    }
    setTimeout(() => set({ interactionState: 'idle' }), SEEK_COOLDOWN)
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
}

const syncEngine = new SyncEngine()

export const setPlayers = syncEngine.setPlayers.bind(syncEngine)
export const getBasePlayer = syncEngine.getBasePlayer.bind(syncEngine)
export const getReactPlayer = syncEngine.getReactPlayer.bind(syncEngine)
export const enableSync = syncEngine.enableSync.bind(syncEngine)
export const disableSync = syncEngine.disableSync.bind(syncEngine)
export const forceResync = syncEngine.forceResync.bind(syncEngine)
export const setDelay = syncEngine.setDelay.bind(syncEngine)
export const adjustDelay = syncEngine.adjustDelay.bind(syncEngine)
export const setPlaybackSpeed = syncEngine.setPlaybackSpeed.bind(syncEngine)
export const adjustPlaybackSpeed = syncEngine.adjustPlaybackSpeed.bind(syncEngine)
export const syncPlay = syncEngine.syncPlay.bind(syncEngine)
export const syncPause = syncEngine.syncPause.bind(syncEngine)
export const syncSeek = syncEngine.syncSeek.bind(syncEngine)
export const getBaseCurrentTime = syncEngine.getBaseCurrentTime.bind(syncEngine)
export const getReactCurrentTime = syncEngine.getReactCurrentTime.bind(syncEngine)
export const getBaseDuration = syncEngine.getBaseDuration.bind(syncEngine)
export const getReactDuration = syncEngine.getReactDuration.bind(syncEngine)
export const isBasePlaying = syncEngine.isBasePlaying.bind(syncEngine)
export const isReactPlaying = syncEngine.isReactPlaying.bind(syncEngine)
export const setBaseVolume = syncEngine.setBaseVolume.bind(syncEngine)
export const setReactVolume = syncEngine.setReactVolume.bind(syncEngine)

export const MIN_PLAYBACK_SPEED = PLAYBACK_SPEED_MIN
export const MAX_PLAYBACK_SPEED = PLAYBACK_SPEED_MAX
export const PLAYBACK_SPEED_INCREMENT = PLAYBACK_SPEED_STEP

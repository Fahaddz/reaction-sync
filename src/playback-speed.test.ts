import { beforeEach, describe, expect, it } from 'vitest'
import type { Player, PlayState } from './player.ts'
import { SyncEngine } from './sync.ts'
import { get, set } from './state.ts'
import { normalizePlaybackSpeed } from './utils.ts'

class MockPlayer implements Player {
  private rate = 1
  private stateCb: ((state: PlayState) => void) | null = null
  private volume = 1

  constructor(private readonly supportedRates: number[] = []) {}

  play(): void {}
  pause(): void {}
  seek(_time: number): void {}
  getCurrentTime(): number { return 0 }
  getDuration(): number { return 120 }
  isPlaying(): boolean { return false }
  getVolume(): number { return this.volume }
  setVolume(v: number): void { this.volume = v }
  setPlaybackRate(rate: number): void { this.rate = rate }
  getPlaybackRate(): number { return this.rate }
  getAvailablePlaybackRates(): number[] { return this.supportedRates }
  onStateChange(cb: (state: PlayState) => void): void { this.stateCb = cb }
  getElement(): HTMLElement | null { return null }
  destroy(): void { this.stateCb = null }
}

describe('playback speed', () => {
  beforeEach(() => {
    set({ playbackSpeed: 1.0, synced: false })
  })

  it('normalizes speed with clamping and step rounding', () => {
    expect(normalizePlaybackSpeed(0.01)).toBe(0.25)
    expect(normalizePlaybackSpeed(2.5)).toBe(2.0)
    expect(normalizePlaybackSpeed(1.23)).toBe(1.25)
  })

  it('applies exact requested speed for unrestricted players', () => {
    const engine = new SyncEngine()
    const base = new MockPlayer()
    const react = new MockPlayer()
    engine.setPlayers(base, react)

    const result = engine.setPlaybackSpeed(1.35)

    expect(result.applied).toBe(1.35)
    expect(result.constrained).toBe(false)
    expect(base.getPlaybackRate()).toBe(1.35)
    expect(react.getPlaybackRate()).toBe(1.35)
    expect(get().playbackSpeed).toBe(1.35)
  })

  it('constrains speed to nearest shared supported value when both are discrete', () => {
    const engine = new SyncEngine()
    const base = new MockPlayer([0.25, 0.5, 1, 1.5, 2])
    const react = new MockPlayer([0.25, 0.5, 1, 1.5, 2])
    engine.setPlayers(base, react)

    const result = engine.setPlaybackSpeed(1.2)

    expect(result.applied).toBe(1)
    expect(result.constrained).toBe(true)
    expect(base.getPlaybackRate()).toBe(1)
    expect(react.getPlaybackRate()).toBe(1)
    expect(get().playbackSpeed).toBe(1)
  })

  it('uses constrained speed when one player has limited rates', () => {
    const engine = new SyncEngine()
    const base = new MockPlayer([0.5, 1, 1.5, 2])
    const react = new MockPlayer()
    engine.setPlayers(base, react)

    const result = engine.setPlaybackSpeed(1.7)

    expect(result.applied).toBe(1.5)
    expect(result.constrained).toBe(true)
    expect(base.getPlaybackRate()).toBe(1.5)
    expect(react.getPlaybackRate()).toBe(1.5)
  })
})

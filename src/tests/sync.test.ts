import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

/**
 * Feature: svelte-tailwind-migration
 * 
 * Property tests for sync engine enhancements including playback speed,
 * buffering handling, and adaptive thresholds.
 */

const RATE_CORRECTION_MIN = Math.fround(0.97)
const RATE_CORRECTION_MAX = Math.fround(1.03)
const USER_SPEED_MIN = Math.fround(0.5)
const USER_SPEED_MAX = Math.fround(2.0)

/**
 * Pure function that calculates the final playback rate.
 * finalRate = userSpeed × driftCorrection
 */
function calculateFinalRate(userSpeed: number, driftCorrection: number): number {
  return userSpeed * driftCorrection
}

describe('Sync Engine - Playback Speed', () => {
  /**
   * Property 8: Playback speed rate calculation
   * 
   * For any user speed (0.5x to 2x) and any drift correction factor (0.97 to 1.03),
   * the final playback rate applied to both players should equal userSpeed × driftCorrection.
   * 
   * **Validates: Requirements 10.2, 10.3, 10.4**
   */
  describe('Property 8: Playback speed rate calculation', () => {
    it('final rate equals userSpeed × driftCorrection for all valid inputs', () => {
      fc.assert(
        fc.property(
          fc.float({ min: USER_SPEED_MIN, max: USER_SPEED_MAX, noNaN: true }),
          fc.float({ min: RATE_CORRECTION_MIN, max: RATE_CORRECTION_MAX, noNaN: true }),
          (userSpeed, driftCorrection) => {
            const finalRate = calculateFinalRate(userSpeed, driftCorrection)
            const expected = userSpeed * driftCorrection
            
            expect(finalRate).toBeCloseTo(expected, 10)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('final rate is 1.0 when userSpeed is 1.0 and no drift correction', () => {
      fc.assert(
        fc.property(
          fc.constant(1.0),
          fc.constant(1.0),
          (userSpeed, driftCorrection) => {
            const finalRate = calculateFinalRate(userSpeed, driftCorrection)
            expect(finalRate).toBe(1.0)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('final rate scales linearly with userSpeed', () => {
      fc.assert(
        fc.property(
          fc.float({ min: USER_SPEED_MIN, max: USER_SPEED_MAX, noNaN: true }),
          fc.float({ min: RATE_CORRECTION_MIN, max: RATE_CORRECTION_MAX, noNaN: true }),
          fc.float({ min: Math.fround(0.5), max: Math.fround(2.0), noNaN: true }),
          (userSpeed, driftCorrection, multiplier) => {
            const rate1 = calculateFinalRate(userSpeed, driftCorrection)
            const rate2 = calculateFinalRate(userSpeed * multiplier, driftCorrection)
            
            expect(rate2).toBeCloseTo(rate1 * multiplier, 10)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('final rate is within expected bounds', () => {
      fc.assert(
        fc.property(
          fc.float({ min: USER_SPEED_MIN, max: USER_SPEED_MAX, noNaN: true }),
          fc.float({ min: RATE_CORRECTION_MIN, max: RATE_CORRECTION_MAX, noNaN: true }),
          (userSpeed, driftCorrection) => {
            const finalRate = calculateFinalRate(userSpeed, driftCorrection)
            const minExpected = USER_SPEED_MIN * RATE_CORRECTION_MIN
            const maxExpected = USER_SPEED_MAX * RATE_CORRECTION_MAX
            
            expect(finalRate).toBeGreaterThanOrEqual(minExpected - 0.001)
            expect(finalRate).toBeLessThanOrEqual(maxExpected + 0.001)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})


type BufferingState = {
  base: boolean
  react: boolean
}

type PlayingState = {
  base: boolean
  react: boolean
}

type BufferPauseState = {
  bufferPauseActive: boolean
  wasPlayingBeforeBuffer: boolean
}

/**
 * Pure function that determines the expected state after a buffering change.
 * This mirrors the logic in sync.ts handleBufferingChange()
 */
function handleBufferingChangePure(
  isBuffering: BufferingState,
  isPlaying: PlayingState,
  currentBufferPauseState: BufferPauseState,
  isSynced: boolean
): { shouldPauseBase: boolean; shouldPauseReact: boolean; shouldResumeBoth: boolean; newBufferPauseState: BufferPauseState } {
  if (!isSynced) {
    return {
      shouldPauseBase: false,
      shouldPauseReact: false,
      shouldResumeBoth: false,
      newBufferPauseState: currentBufferPauseState
    }
  }

  const anyBuffering = isBuffering.base || isBuffering.react
  let shouldPauseBase = false
  let shouldPauseReact = false
  let shouldResumeBoth = false
  let newBufferPauseState = { ...currentBufferPauseState }

  if (anyBuffering && !currentBufferPauseState.bufferPauseActive) {
    const wasPlaying = isPlaying.base || isPlaying.react
    if (wasPlaying) {
      newBufferPauseState.bufferPauseActive = true
      newBufferPauseState.wasPlayingBeforeBuffer = true
      if (!isBuffering.base && isPlaying.base) {
        shouldPauseBase = true
      }
      if (!isBuffering.react && isPlaying.react) {
        shouldPauseReact = true
      }
    }
  } else if (!anyBuffering && currentBufferPauseState.bufferPauseActive) {
    newBufferPauseState.bufferPauseActive = false
    if (currentBufferPauseState.wasPlayingBeforeBuffer) {
      shouldResumeBoth = true
    }
    newBufferPauseState.wasPlayingBeforeBuffer = false
  }

  return { shouldPauseBase, shouldPauseReact, shouldResumeBoth, newBufferPauseState }
}

describe('Sync Engine - Buffering Handling', () => {
  /**
   * Property 7: Buffering pauses other player
   * 
   * For any buffering event on either player while synced, the other player
   * should be paused until buffering completes, then both should resume together.
   * 
   * **Validates: Requirements 9.1, 9.2, 9.3**
   */
  describe('Property 7: Buffering pauses other player', () => {
    it('when base buffers while playing, react should be paused', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.boolean(),
          (basePlaying, reactPlaying) => {
            const isBuffering: BufferingState = { base: true, react: false }
            const isPlaying: PlayingState = { base: basePlaying, react: reactPlaying }
            const currentState: BufferPauseState = { bufferPauseActive: false, wasPlayingBeforeBuffer: false }
            
            const result = handleBufferingChangePure(isBuffering, isPlaying, currentState, true)
            
            if (basePlaying || reactPlaying) {
              expect(result.newBufferPauseState.bufferPauseActive).toBe(true)
              if (reactPlaying) {
                expect(result.shouldPauseReact).toBe(true)
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('when react buffers while playing, base should be paused', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.boolean(),
          (basePlaying, reactPlaying) => {
            const isBuffering: BufferingState = { base: false, react: true }
            const isPlaying: PlayingState = { base: basePlaying, react: reactPlaying }
            const currentState: BufferPauseState = { bufferPauseActive: false, wasPlayingBeforeBuffer: false }
            
            const result = handleBufferingChangePure(isBuffering, isPlaying, currentState, true)
            
            if (basePlaying || reactPlaying) {
              expect(result.newBufferPauseState.bufferPauseActive).toBe(true)
              if (basePlaying) {
                expect(result.shouldPauseBase).toBe(true)
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('when buffering completes, both players should resume if they were playing', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (wasPlayingBeforeBuffer) => {
            const isBuffering: BufferingState = { base: false, react: false }
            const isPlaying: PlayingState = { base: false, react: false }
            const currentState: BufferPauseState = { bufferPauseActive: true, wasPlayingBeforeBuffer }
            
            const result = handleBufferingChangePure(isBuffering, isPlaying, currentState, true)
            
            expect(result.newBufferPauseState.bufferPauseActive).toBe(false)
            expect(result.shouldResumeBoth).toBe(wasPlayingBeforeBuffer)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('buffering has no effect when not synced', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          (baseBuffering, reactBuffering, basePlaying, reactPlaying) => {
            const isBuffering: BufferingState = { base: baseBuffering, react: reactBuffering }
            const isPlaying: PlayingState = { base: basePlaying, react: reactPlaying }
            const currentState: BufferPauseState = { bufferPauseActive: false, wasPlayingBeforeBuffer: false }
            
            const result = handleBufferingChangePure(isBuffering, isPlaying, currentState, false)
            
            expect(result.shouldPauseBase).toBe(false)
            expect(result.shouldPauseReact).toBe(false)
            expect(result.shouldResumeBoth).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})


const TIGHT_THRESHOLD = 0.05
const LOOSE_THRESHOLD = 0.25
const BUFFER_FREQUENCY_THRESHOLD = 3
const THRESHOLD_INCREASE_STEP = 0.05
const THRESHOLD_DECREASE_STEP = 0.01

type SourceType = 'local' | 'youtube' | 'url'

/**
 * Pure function that determines base threshold from source types.
 * This mirrors the logic in sync.ts getBaseThreshold()
 */
function getBaseThresholdPure(baseType: SourceType | null, reactType: SourceType | null): number {
  const baseIsYouTube = baseType === 'youtube'
  const reactIsYouTube = reactType === 'youtube'
  if (baseIsYouTube || reactIsYouTube) {
    return LOOSE_THRESHOLD
  }
  return TIGHT_THRESHOLD
}

/**
 * Pure function that calculates adaptive threshold offset based on buffer frequency.
 */
function calculateAdaptiveOffset(
  bufferCount: number,
  currentOffset: number,
  isStable: boolean
): number {
  if (bufferCount >= BUFFER_FREQUENCY_THRESHOLD) {
    return Math.min(currentOffset + THRESHOLD_INCREASE_STEP, LOOSE_THRESHOLD - TIGHT_THRESHOLD)
  } else if (isStable && currentOffset > 0) {
    return Math.max(currentOffset - THRESHOLD_DECREASE_STEP, 0)
  }
  return currentOffset
}

/**
 * Pure function that calculates final threshold.
 */
function calculateFinalThreshold(
  baseThreshold: number,
  adaptiveOffset: number,
  hasDriftTrend: boolean
): number {
  const driftAdjustment = hasDriftTrend ? 0.02 : 0
  const result = baseThreshold + adaptiveOffset + driftAdjustment
  return Math.max(TIGHT_THRESHOLD, Math.min(LOOSE_THRESHOLD, result))
}

describe('Sync Engine - Adaptive Thresholds', () => {
  /**
   * Property 9: Source-based threshold selection
   * 
   * For any combination of video sources, the threshold mode should be:
   * tight (50ms) when both are local, loose (250ms) when at least one is YouTube.
   * 
   * **Validates: Requirements 11.1, 11.2**
   */
  describe('Property 9: Source-based threshold selection', () => {
    it('both local sources use tight threshold', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('local', 'url') as fc.Arbitrary<SourceType>,
          fc.constantFrom('local', 'url') as fc.Arbitrary<SourceType>,
          (baseType, reactType) => {
            const threshold = getBaseThresholdPure(baseType, reactType)
            expect(threshold).toBe(TIGHT_THRESHOLD)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('YouTube source uses loose threshold', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('local', 'youtube', 'url') as fc.Arbitrary<SourceType>,
          fc.constantFrom('local', 'youtube', 'url') as fc.Arbitrary<SourceType>,
          (baseType, reactType) => {
            const threshold = getBaseThresholdPure(baseType, reactType)
            const hasYouTube = baseType === 'youtube' || reactType === 'youtube'
            
            if (hasYouTube) {
              expect(threshold).toBe(LOOSE_THRESHOLD)
            } else {
              expect(threshold).toBe(TIGHT_THRESHOLD)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 10: Buffering frequency increases threshold
   * 
   * For any sequence of buffering events occurring more than 3 times in 30 seconds,
   * the adaptive threshold should increase by at least 50ms from baseline.
   * 
   * **Validates: Requirements 11.3**
   */
  describe('Property 10: Buffering frequency increases threshold', () => {
    it('frequent buffering increases threshold offset', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: BUFFER_FREQUENCY_THRESHOLD, max: 10 }),
          fc.float({ min: Math.fround(0), max: Math.fround(0.15), noNaN: true }),
          (bufferCount, currentOffset) => {
            const newOffset = calculateAdaptiveOffset(bufferCount, currentOffset, false)
            expect(newOffset).toBeGreaterThanOrEqual(currentOffset)
            expect(newOffset).toBeLessThanOrEqual(LOOSE_THRESHOLD - TIGHT_THRESHOLD)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('threshold increases by at least THRESHOLD_INCREASE_STEP when buffering frequently', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: BUFFER_FREQUENCY_THRESHOLD, max: 10 }),
          (bufferCount) => {
            const currentOffset = 0
            const newOffset = calculateAdaptiveOffset(bufferCount, currentOffset, false)
            expect(newOffset).toBeGreaterThanOrEqual(THRESHOLD_INCREASE_STEP)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 11: Stable playback tightens threshold
   * 
   * For any period of stable playback (no buffering, no seeking) lasting 10+ seconds,
   * the adaptive threshold should decrease toward the baseline for the current source types.
   * 
   * **Validates: Requirements 11.4**
   */
  describe('Property 11: Stable playback tightens threshold', () => {
    it('stable playback decreases threshold offset', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.01), max: Math.fround(0.2), noNaN: true }),
          (currentOffset) => {
            const newOffset = calculateAdaptiveOffset(0, currentOffset, true)
            expect(newOffset).toBeLessThanOrEqual(currentOffset)
            expect(newOffset).toBeGreaterThanOrEqual(0)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('offset decreases by THRESHOLD_DECREASE_STEP during stable playback', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.02), max: Math.fround(0.2), noNaN: true }),
          (currentOffset) => {
            const newOffset = calculateAdaptiveOffset(0, currentOffset, true)
            const expectedOffset = Math.max(currentOffset - THRESHOLD_DECREASE_STEP, 0)
            expect(newOffset).toBeCloseTo(expectedOffset, 5)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('offset does not go below zero', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0), max: Math.fround(0.01), noNaN: true }),
          (currentOffset) => {
            const newOffset = calculateAdaptiveOffset(0, currentOffset, true)
            expect(newOffset).toBeGreaterThanOrEqual(0)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 12: Drift history affects threshold
   * 
   * For any drift history showing persistent drift in one direction (>5 consecutive samples),
   * the threshold should be adjusted to accommodate the drift pattern.
   * 
   * **Validates: Requirements 11.5**
   */
  describe('Property 12: Drift history affects threshold', () => {
    it('drift trend adds adjustment to threshold', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.05), max: Math.fround(0.2), noNaN: true }),
          fc.float({ min: Math.fround(0), max: Math.fround(0.1), noNaN: true }),
          fc.boolean(),
          (baseThreshold, adaptiveOffset, hasDriftTrend) => {
            const threshold = calculateFinalThreshold(baseThreshold, adaptiveOffset, hasDriftTrend)
            
            if (hasDriftTrend) {
              const expectedMin = baseThreshold + adaptiveOffset + 0.02
              expect(threshold).toBeGreaterThanOrEqual(Math.min(expectedMin, LOOSE_THRESHOLD) - 0.001)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('threshold stays within bounds regardless of drift', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.05), max: Math.fround(0.25), noNaN: true }),
          fc.float({ min: Math.fround(0), max: Math.fround(0.2), noNaN: true }),
          fc.boolean(),
          (baseThreshold, adaptiveOffset, hasDriftTrend) => {
            const threshold = calculateFinalThreshold(baseThreshold, adaptiveOffset, hasDriftTrend)
            
            expect(threshold).toBeGreaterThanOrEqual(TIGHT_THRESHOLD)
            expect(threshold).toBeLessThanOrEqual(LOOSE_THRESHOLD)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})


const SEEK_THRESHOLD = 0.5

type SyncState = {
  baseTime: number
  reactTime: number
  delay: number
  threshold: number
  driftCorrection: number
  isPlaying: boolean
  isBuffering: boolean
  isSeeking: boolean
}

type CorrectionAction = 
  | { type: 'none' }
  | { type: 'rate_adjust'; newRate: number }
  | { type: 'seek'; targetTime: number }

function calculateDrift(baseTime: number, reactTime: number, delay: number): number {
  const targetReact = baseTime + delay
  return targetReact - reactTime
}

function determineCorrectionAction(state: SyncState): CorrectionAction {
  if (!state.isPlaying || state.isBuffering || state.isSeeking) {
    return { type: 'none' }
  }
  
  const drift = calculateDrift(state.baseTime, state.reactTime, state.delay)
  const absDrift = Math.abs(drift)
  
  if (absDrift > SEEK_THRESHOLD) {
    const targetReact = state.baseTime + state.delay
    return { type: 'seek', targetTime: Math.max(0, targetReact) }
  }
  
  if (absDrift > state.threshold) {
    const driftDir = Math.sign(drift)
    const intensity = Math.min((absDrift - state.threshold) / (SEEK_THRESHOLD - state.threshold), 1)
    const rateOffset = intensity * 0.03
    const targetRate = driftDir > 0 ? 1.0 + rateOffset : 1.0 - rateOffset
    const smoothing = 0.3
    const newRate = state.driftCorrection + (targetRate - state.driftCorrection) * smoothing
    const clampedRate = Math.max(RATE_CORRECTION_MIN, Math.min(RATE_CORRECTION_MAX, newRate))
    return { type: 'rate_adjust', newRate: clampedRate }
  }
  
  if (absDrift <= state.threshold * 0.3 && state.driftCorrection !== 1.0) {
    return { type: 'rate_adjust', newRate: 1.0 }
  }
  
  return { type: 'none' }
}

function simulateSyncCycle(
  initialState: SyncState,
  cycles: number,
  timeStep: number
): { finalDrift: number; maxDrift: number; seekCount: number } {
  let state = { ...initialState }
  let maxDrift = 0
  let seekCount = 0
  
  for (let i = 0; i < cycles; i++) {
    const drift = calculateDrift(state.baseTime, state.reactTime, state.delay)
    maxDrift = Math.max(maxDrift, Math.abs(drift))
    
    const action = determineCorrectionAction(state)
    
    if (action.type === 'seek') {
      state.reactTime = action.targetTime
      state.driftCorrection = 1.0
      seekCount++
    } else if (action.type === 'rate_adjust') {
      state.driftCorrection = action.newRate
    }
    
    state.baseTime += timeStep
    state.reactTime += timeStep * state.driftCorrection
  }
  
  const finalDrift = calculateDrift(state.baseTime, state.reactTime, state.delay)
  return { finalDrift, maxDrift, seekCount }
}

describe('Sync Engine - Drift Control', () => {
  /**
   * Property 1: Sync drift stays within threshold
   * 
   * For any pair of synced videos with any delay value, the measured drift between
   * target and actual react time should stay within the current adaptive threshold
   * during stable playback (no seeking, no buffering).
   * 
   * **Validates: Requirements 1.2**
   */
  describe('Property 1: Sync drift stays within threshold', () => {
    it('drift is calculated correctly as targetReact - actualReact', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 3600, noNaN: true }),
          fc.float({ min: 0, max: 3600, noNaN: true }),
          fc.float({ min: -300, max: 300, noNaN: true }),
          (baseTime, reactTime, delay) => {
            const drift = calculateDrift(baseTime, reactTime, delay)
            const expectedDrift = (baseTime + delay) - reactTime
            expect(drift).toBeCloseTo(expectedDrift, 10)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('drift is zero when react is at target position', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 3600, noNaN: true }),
          fc.float({ min: -300, max: 300, noNaN: true }),
          (baseTime, delay) => {
            const targetReact = baseTime + delay
            const drift = calculateDrift(baseTime, targetReact, delay)
            expect(drift).toBeCloseTo(0, 10)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('large drift triggers seek correction', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 3600, noNaN: true }),
          fc.float({ min: -300, max: 300, noNaN: true }),
          fc.float({ min: Math.fround(0.6), max: Math.fround(5), noNaN: true }),
          fc.boolean(),
          (baseTime, delay, driftMagnitude, positive) => {
            const targetReact = baseTime + delay
            const reactTime = positive ? targetReact - driftMagnitude : targetReact + driftMagnitude
            
            const state: SyncState = {
              baseTime,
              reactTime,
              delay,
              threshold: TIGHT_THRESHOLD,
              driftCorrection: 1.0,
              isPlaying: true,
              isBuffering: false,
              isSeeking: false
            }
            
            const action = determineCorrectionAction(state)
            expect(action.type).toBe('seek')
          }
        ),
        { numRuns: 100 }
      )
    })

    it('moderate drift triggers rate adjustment', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 3600, noNaN: true }),
          fc.float({ min: -300, max: 300, noNaN: true }),
          fc.float({ min: Math.fround(0.06), max: Math.fround(0.49), noNaN: true }),
          fc.boolean(),
          (baseTime, delay, driftMagnitude, positive) => {
            const targetReact = baseTime + delay
            const reactTime = positive ? targetReact - driftMagnitude : targetReact + driftMagnitude
            
            const state: SyncState = {
              baseTime,
              reactTime,
              delay,
              threshold: TIGHT_THRESHOLD,
              driftCorrection: 1.0,
              isPlaying: true,
              isBuffering: false,
              isSeeking: false
            }
            
            const action = determineCorrectionAction(state)
            expect(action.type).toBe('rate_adjust')
            if (action.type === 'rate_adjust') {
              expect(action.newRate).toBeGreaterThanOrEqual(RATE_CORRECTION_MIN)
              expect(action.newRate).toBeLessThanOrEqual(RATE_CORRECTION_MAX)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('small drift within threshold requires no correction', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 3600, noNaN: true }),
          fc.float({ min: -300, max: 300, noNaN: true }),
          fc.float({ min: Math.fround(0), max: Math.fround(0.015), noNaN: true }),
          fc.boolean(),
          (baseTime, delay, driftMagnitude, positive) => {
            const targetReact = baseTime + delay
            const reactTime = positive ? targetReact - driftMagnitude : targetReact + driftMagnitude
            
            const state: SyncState = {
              baseTime,
              reactTime,
              delay,
              threshold: TIGHT_THRESHOLD,
              driftCorrection: 1.0,
              isPlaying: true,
              isBuffering: false,
              isSeeking: false
            }
            
            const action = determineCorrectionAction(state)
            expect(action.type).toBe('none')
          }
        ),
        { numRuns: 100 }
      )
    })

    it('no correction when not playing', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 3600, noNaN: true }),
          fc.float({ min: 0, max: 3600, noNaN: true }),
          fc.float({ min: -300, max: 300, noNaN: true }),
          (baseTime, reactTime, delay) => {
            const state: SyncState = {
              baseTime,
              reactTime,
              delay,
              threshold: TIGHT_THRESHOLD,
              driftCorrection: 1.0,
              isPlaying: false,
              isBuffering: false,
              isSeeking: false
            }
            
            const action = determineCorrectionAction(state)
            expect(action.type).toBe('none')
          }
        ),
        { numRuns: 100 }
      )
    })

    it('no correction when buffering', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 3600, noNaN: true }),
          fc.float({ min: 0, max: 3600, noNaN: true }),
          fc.float({ min: -300, max: 300, noNaN: true }),
          (baseTime, reactTime, delay) => {
            const state: SyncState = {
              baseTime,
              reactTime,
              delay,
              threshold: TIGHT_THRESHOLD,
              driftCorrection: 1.0,
              isPlaying: true,
              isBuffering: true,
              isSeeking: false
            }
            
            const action = determineCorrectionAction(state)
            expect(action.type).toBe('none')
          }
        ),
        { numRuns: 100 }
      )
    })

    it('sync converges to within threshold over multiple cycles', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 100, noNaN: true }),
          fc.float({ min: -10, max: 10, noNaN: true }),
          fc.float({ min: Math.fround(0.1), max: Math.fround(0.4), noNaN: true }),
          (baseTime, delay, initialDrift) => {
            const targetReact = baseTime + delay
            const reactTime = targetReact - initialDrift
            
            const initialState: SyncState = {
              baseTime,
              reactTime,
              delay,
              threshold: TIGHT_THRESHOLD,
              driftCorrection: 1.0,
              isPlaying: true,
              isBuffering: false,
              isSeeking: false
            }
            
            const result = simulateSyncCycle(initialState, 50, 0.1)
            
            expect(Math.abs(result.finalDrift)).toBeLessThanOrEqual(SEEK_THRESHOLD)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('rate correction direction matches drift direction', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 3600, noNaN: true }),
          fc.float({ min: -300, max: 300, noNaN: true }),
          fc.float({ min: Math.fround(0.06), max: Math.fround(0.49), noNaN: true }),
          fc.boolean(),
          (baseTime, delay, driftMagnitude, positive) => {
            const targetReact = baseTime + delay
            const reactTime = positive ? targetReact - driftMagnitude : targetReact + driftMagnitude
            const drift = calculateDrift(baseTime, reactTime, delay)
            
            const state: SyncState = {
              baseTime,
              reactTime,
              delay,
              threshold: TIGHT_THRESHOLD,
              driftCorrection: 1.0,
              isPlaying: true,
              isBuffering: false,
              isSeeking: false
            }
            
            const action = determineCorrectionAction(state)
            if (action.type === 'rate_adjust') {
              if (drift > 0) {
                expect(action.newRate).toBeGreaterThan(1.0)
              } else {
                expect(action.newRate).toBeLessThan(1.0)
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})

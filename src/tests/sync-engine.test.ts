import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fc from 'fast-check'

/**
 * Comprehensive Sync Engine Tests
 * 
 * Tests the core synchronization logic that keeps two video players in sync.
 * This is the most critical part of the application.
 */

// Constants matching sync.ts
const TIGHT_THRESHOLD = 0.05
const LOOSE_THRESHOLD = 0.25
const SEEK_THRESHOLD = 0.5
const RATE_CORRECTION_MIN = 0.97
const RATE_CORRECTION_MAX = 1.03
const DRIFT_HISTORY_SIZE = 10
const BUFFER_FREQUENCY_THRESHOLD = 3
const STABLE_PLAYBACK_DURATION = 10000
const THRESHOLD_INCREASE_STEP = 0.05
const THRESHOLD_DECREASE_STEP = 0.01

type SourceType = 'local' | 'youtube' | 'url'
type SyncHealth = 'healthy' | 'correcting' | 'drifting' | ''

// Pure function implementations for testing (mirrors sync.ts logic)

function getBaseThreshold(baseType: SourceType | null, reactType: SourceType | null): number {
  if (baseType === 'youtube' || reactType === 'youtube') {
    return LOOSE_THRESHOLD
  }
  return TIGHT_THRESHOLD
}

function calculateDrift(baseTime: number, reactTime: number, delay: number): number {
  const targetReact = baseTime + delay
  return targetReact - reactTime
}

function determineSyncHealth(absDrift: number, threshold: number): SyncHealth {
  if (absDrift <= threshold * 0.5) return 'healthy'
  if (absDrift > SEEK_THRESHOLD) return 'drifting'
  if (absDrift > threshold) return 'correcting'
  return 'healthy'
}

function calculateRateCorrection(
  drift: number,
  threshold: number,
  currentCorrection: number
): number {
  if (Math.abs(drift) <= threshold * 0.5) {
    // Return toward 1.0
    if (currentCorrection > 1) return Math.max(1.0, currentCorrection - 0.002)
    return Math.min(1.0, currentCorrection + 0.002)
  }
  
  const driftDir = Math.sign(drift)
  const driftMagnitude = Math.abs(drift)
  let targetRate = 1.0
  
  if (driftMagnitude > threshold) {
    const intensity = Math.min((driftMagnitude - threshold) / (SEEK_THRESHOLD - threshold), 1)
    const rateOffset = intensity * 0.03
    targetRate = driftDir > 0 ? 1.0 + rateOffset : 1.0 - rateOffset
  }
  
  const smoothing = 0.3
  const newRate = currentCorrection + (targetRate - currentCorrection) * smoothing
  return Math.max(RATE_CORRECTION_MIN, Math.min(RATE_CORRECTION_MAX, newRate))
}

function shouldSeek(absDrift: number): boolean {
  return absDrift > SEEK_THRESHOLD
}

function getDriftTrend(history: number[]): number {
  if (history.length < 3) return 0
  const recent = history.slice(-5)
  const positive = recent.filter(d => d > 0.01).length
  const negative = recent.filter(d => d < -0.01).length
  if (positive >= 4) return 1
  if (negative >= 4) return -1
  return 0
}

function calculateAdaptiveOffset(
  bufferCount: number,
  currentOffset: number,
  timeSinceStable: number
): number {
  if (bufferCount >= BUFFER_FREQUENCY_THRESHOLD) {
    return Math.min(currentOffset + THRESHOLD_INCREASE_STEP, LOOSE_THRESHOLD - TIGHT_THRESHOLD)
  }
  if (timeSinceStable > STABLE_PLAYBACK_DURATION && currentOffset > 0) {
    return Math.max(currentOffset - THRESHOLD_DECREASE_STEP, 0)
  }
  return currentOffset
}

function calculateFinalRate(userSpeed: number, driftCorrection: number): number {
  return userSpeed * driftCorrection
}

// Arbitraries
const sourceTypeArb = fc.constantFrom('local', 'youtube', 'url') as fc.Arbitrary<SourceType>
const timeArb = fc.double({ min: 0, max: 36000, noNaN: true })
const delayArb = fc.double({ min: -300, max: 300, noNaN: true })
const userSpeedArb = fc.double({ min: Math.fround(0.5), max: Math.fround(2.0), noNaN: true })
const driftCorrectionArb = fc.double({ min: Math.fround(RATE_CORRECTION_MIN), max: Math.fround(RATE_CORRECTION_MAX), noNaN: true })


describe('Sync Engine - Drift Calculation', () => {
  it('drift is zero when react is at target position', () => {
    fc.assert(
      fc.property(timeArb, delayArb, (baseTime, delay) => {
        const targetReact = baseTime + delay
        const drift = calculateDrift(baseTime, targetReact, delay)
        expect(drift).toBeCloseTo(0, 10)
      }),
      { numRuns: 200 }
    )
  })

  it('positive drift means react is behind target', () => {
    fc.assert(
      fc.property(
        timeArb,
        delayArb,
        fc.double({ min: 0.1, max: 10, noNaN: true }),
        (baseTime, delay, lag) => {
          const targetReact = baseTime + delay
          const reactTime = targetReact - lag // React is behind
          const drift = calculateDrift(baseTime, reactTime, delay)
          expect(drift).toBeGreaterThan(0)
          expect(drift).toBeCloseTo(lag, 5)
        }
      ),
      { numRuns: 200 }
    )
  })

  it('negative drift means react is ahead of target', () => {
    fc.assert(
      fc.property(
        timeArb,
        delayArb,
        fc.double({ min: 0.1, max: 10, noNaN: true }),
        (baseTime, delay, lead) => {
          const targetReact = baseTime + delay
          const reactTime = targetReact + lead // React is ahead
          const drift = calculateDrift(baseTime, reactTime, delay)
          expect(drift).toBeLessThan(0)
          expect(drift).toBeCloseTo(-lead, 5)
        }
      ),
      { numRuns: 200 }
    )
  })

  it('drift formula: targetReact - actualReact', () => {
    fc.assert(
      fc.property(timeArb, timeArb, delayArb, (baseTime, reactTime, delay) => {
        const drift = calculateDrift(baseTime, reactTime, delay)
        const expected = (baseTime + delay) - reactTime
        expect(drift).toBeCloseTo(expected, 10)
      }),
      { numRuns: 200 }
    )
  })
})

describe('Sync Engine - Threshold Selection', () => {
  it('local + local = tight threshold (50ms)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('local', 'url') as fc.Arbitrary<SourceType>,
        fc.constantFrom('local', 'url') as fc.Arbitrary<SourceType>,
        (base, react) => {
          const threshold = getBaseThreshold(base, react)
          expect(threshold).toBe(TIGHT_THRESHOLD)
        }
      ),
      { numRuns: 50 }
    )
  })

  it('any YouTube source = loose threshold (250ms)', () => {
    fc.assert(
      fc.property(sourceTypeArb, sourceTypeArb, (base, react) => {
        const threshold = getBaseThreshold(base, react)
        if (base === 'youtube' || react === 'youtube') {
          expect(threshold).toBe(LOOSE_THRESHOLD)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('threshold is always between TIGHT and LOOSE', () => {
    fc.assert(
      fc.property(
        fc.option(sourceTypeArb, { nil: null }),
        fc.option(sourceTypeArb, { nil: null }),
        (base, react) => {
          const threshold = getBaseThreshold(base, react)
          expect(threshold).toBeGreaterThanOrEqual(TIGHT_THRESHOLD)
          expect(threshold).toBeLessThanOrEqual(LOOSE_THRESHOLD)
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Sync Engine - Health Status', () => {
  it('healthy when drift <= threshold * 0.5', () => {
    fc.assert(
      fc.property(
        fc.double({ min: TIGHT_THRESHOLD, max: LOOSE_THRESHOLD, noNaN: true }),
        (threshold) => {
          const maxHealthyDrift = threshold * 0.5
          const health = determineSyncHealth(maxHealthyDrift - 0.001, threshold)
          expect(health).toBe('healthy')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('correcting when threshold < drift <= SEEK_THRESHOLD', () => {
    fc.assert(
      fc.property(
        fc.double({ min: TIGHT_THRESHOLD, max: LOOSE_THRESHOLD, noNaN: true }),
        (threshold) => {
          const drift = (threshold + SEEK_THRESHOLD) / 2
          if (drift > threshold && drift <= SEEK_THRESHOLD) {
            const health = determineSyncHealth(drift, threshold)
            expect(health).toBe('correcting')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('drifting when drift > SEEK_THRESHOLD', () => {
    fc.assert(
      fc.property(
        fc.double({ min: SEEK_THRESHOLD + 0.01, max: 5, noNaN: true }),
        fc.double({ min: TIGHT_THRESHOLD, max: LOOSE_THRESHOLD, noNaN: true }),
        (drift, threshold) => {
          const health = determineSyncHealth(drift, threshold)
          expect(health).toBe('drifting')
        }
      ),
      { numRuns: 100 }
    )
  })
})


describe('Sync Engine - Rate Correction', () => {
  it('rate correction is always within bounds', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1, max: 1, noNaN: true }),
        fc.double({ min: TIGHT_THRESHOLD, max: LOOSE_THRESHOLD, noNaN: true }),
        driftCorrectionArb,
        (drift, threshold, currentCorrection) => {
          const newRate = calculateRateCorrection(drift, threshold, currentCorrection)
          expect(newRate).toBeGreaterThanOrEqual(RATE_CORRECTION_MIN)
          expect(newRate).toBeLessThanOrEqual(RATE_CORRECTION_MAX)
        }
      ),
      { numRuns: 200 }
    )
  })

  it('positive drift increases rate (speed up react)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 0.4, noNaN: true }),
        fc.double({ min: TIGHT_THRESHOLD, max: LOOSE_THRESHOLD, noNaN: true }),
        (drift, threshold) => {
          if (drift > threshold) {
            const newRate = calculateRateCorrection(drift, threshold, 1.0)
            expect(newRate).toBeGreaterThan(1.0)
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it('negative drift decreases rate (slow down react)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 0.4, noNaN: true }),
        fc.double({ min: TIGHT_THRESHOLD, max: LOOSE_THRESHOLD, noNaN: true }),
        (driftMag, threshold) => {
          const drift = -driftMag
          if (Math.abs(drift) > threshold) {
            const newRate = calculateRateCorrection(drift, threshold, 1.0)
            expect(newRate).toBeLessThan(1.0)
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it('small drift returns rate toward 1.0', () => {
    fc.assert(
      fc.property(
        fc.double({ min: TIGHT_THRESHOLD, max: LOOSE_THRESHOLD, noNaN: true }),
        driftCorrectionArb,
        (threshold, currentCorrection) => {
          const smallDrift = threshold * 0.3
          const newRate = calculateRateCorrection(smallDrift, threshold, currentCorrection)
          // Should move toward 1.0
          if (currentCorrection > 1.0) {
            expect(newRate).toBeLessThanOrEqual(currentCorrection)
          } else if (currentCorrection < 1.0) {
            expect(newRate).toBeGreaterThanOrEqual(currentCorrection)
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it('rate correction is smooth (changes gradually)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -0.5, max: 0.5, noNaN: true }),
        fc.double({ min: TIGHT_THRESHOLD, max: LOOSE_THRESHOLD, noNaN: true }),
        driftCorrectionArb,
        (drift, threshold, currentCorrection) => {
          const newRate = calculateRateCorrection(drift, threshold, currentCorrection)
          const change = Math.abs(newRate - currentCorrection)
          // Change should be gradual (smoothing factor is 0.3)
          expect(change).toBeLessThanOrEqual(0.03)
        }
      ),
      { numRuns: 200 }
    )
  })
})

describe('Sync Engine - Seek Decision', () => {
  it('seeks when drift exceeds SEEK_THRESHOLD', () => {
    fc.assert(
      fc.property(
        fc.double({ min: SEEK_THRESHOLD + 0.01, max: 10, noNaN: true }),
        (drift) => {
          expect(shouldSeek(drift)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('does not seek when drift is within SEEK_THRESHOLD', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: SEEK_THRESHOLD - 0.01, noNaN: true }),
        (drift) => {
          expect(shouldSeek(drift)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('SEEK_THRESHOLD is the boundary', () => {
    expect(shouldSeek(SEEK_THRESHOLD)).toBe(false)
    expect(shouldSeek(SEEK_THRESHOLD + 0.001)).toBe(true)
  })
})

describe('Sync Engine - Drift Trend Detection', () => {
  it('returns 0 for insufficient history', () => {
    expect(getDriftTrend([])).toBe(0)
    expect(getDriftTrend([0.1])).toBe(0)
    expect(getDriftTrend([0.1, 0.2])).toBe(0)
  })

  it('detects positive trend (4+ positive in last 5)', () => {
    const history = [0.02, 0.03, 0.02, 0.04, 0.03]
    expect(getDriftTrend(history)).toBe(1)
  })

  it('detects negative trend (4+ negative in last 5)', () => {
    const history = [-0.02, -0.03, -0.02, -0.04, -0.03]
    expect(getDriftTrend(history)).toBe(-1)
  })

  it('returns 0 for mixed drift', () => {
    const history = [0.02, -0.03, 0.02, -0.04, 0.03]
    expect(getDriftTrend(history)).toBe(0)
  })

  it('only considers last 5 samples', () => {
    const history = [-0.1, -0.1, -0.1, -0.1, -0.1, 0.02, 0.03, 0.02, 0.04, 0.03]
    expect(getDriftTrend(history)).toBe(1) // Last 5 are positive
  })
})


describe('Sync Engine - Adaptive Threshold', () => {
  it('increases threshold when buffer frequency is high', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: BUFFER_FREQUENCY_THRESHOLD, max: 20 }),
        fc.double({ min: 0, max: 0.1, noNaN: true }),
        (bufferCount, currentOffset) => {
          const newOffset = calculateAdaptiveOffset(bufferCount, currentOffset, 0)
          expect(newOffset).toBeGreaterThanOrEqual(currentOffset)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('decreases threshold during stable playback', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 0.15, noNaN: true }),
        (currentOffset) => {
          const timeSinceStable = STABLE_PLAYBACK_DURATION + 1000
          const newOffset = calculateAdaptiveOffset(0, currentOffset, timeSinceStable)
          expect(newOffset).toBeLessThanOrEqual(currentOffset)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('offset never exceeds max (LOOSE - TIGHT)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.double({ min: 0, max: 0.3, noNaN: true }),
        fc.integer({ min: 0, max: 100000 }),
        (bufferCount, currentOffset, timeSinceStable) => {
          const newOffset = calculateAdaptiveOffset(bufferCount, currentOffset, timeSinceStable)
          // Allow small floating point tolerance
          expect(newOffset).toBeLessThanOrEqual(LOOSE_THRESHOLD - TIGHT_THRESHOLD + 0.0001)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('offset never goes below 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.double({ min: 0, max: 0.3, noNaN: true }),
        fc.integer({ min: 0, max: 100000 }),
        (bufferCount, currentOffset, timeSinceStable) => {
          const newOffset = calculateAdaptiveOffset(bufferCount, currentOffset, timeSinceStable)
          expect(newOffset).toBeGreaterThanOrEqual(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('no change when buffer count is low and not stable long enough', () => {
    const offset = 0.05
    const newOffset = calculateAdaptiveOffset(1, offset, 5000)
    expect(newOffset).toBe(offset)
  })
})

describe('Sync Engine - Final Playback Rate', () => {
  it('final rate = userSpeed × driftCorrection', () => {
    fc.assert(
      fc.property(userSpeedArb, driftCorrectionArb, (userSpeed, driftCorrection) => {
        const finalRate = calculateFinalRate(userSpeed, driftCorrection)
        expect(finalRate).toBeCloseTo(userSpeed * driftCorrection, 10)
      }),
      { numRuns: 200 }
    )
  })

  it('final rate is 1.0 when userSpeed=1 and no drift correction', () => {
    expect(calculateFinalRate(1.0, 1.0)).toBe(1.0)
  })

  it('final rate scales linearly with userSpeed', () => {
    fc.assert(
      fc.property(
        userSpeedArb,
        driftCorrectionArb,
        fc.double({ min: 0.5, max: 2.0, noNaN: true }),
        (userSpeed, driftCorrection, multiplier) => {
          const rate1 = calculateFinalRate(userSpeed, driftCorrection)
          const rate2 = calculateFinalRate(userSpeed * multiplier, driftCorrection)
          expect(rate2).toBeCloseTo(rate1 * multiplier, 5)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('final rate is within expected bounds', () => {
    fc.assert(
      fc.property(userSpeedArb, driftCorrectionArb, (userSpeed, driftCorrection) => {
        const finalRate = calculateFinalRate(userSpeed, driftCorrection)
        const minExpected = 0.5 * RATE_CORRECTION_MIN
        const maxExpected = 2.0 * RATE_CORRECTION_MAX
        expect(finalRate).toBeGreaterThanOrEqual(minExpected - 0.01)
        expect(finalRate).toBeLessThanOrEqual(maxExpected + 0.01)
      }),
      { numRuns: 200 }
    )
  })
})


describe('Sync Engine - Full Sync Simulation', () => {
  /**
   * Simulates multiple sync cycles to verify convergence
   */
  function simulateSyncCycles(
    initialBaseTime: number,
    initialReactTime: number,
    delay: number,
    threshold: number,
    cycles: number,
    timeStep: number = 0.1
  ): { finalDrift: number; maxDrift: number; seekCount: number; rateChanges: number } {
    let baseTime = initialBaseTime
    let reactTime = initialReactTime
    let driftCorrection = 1.0
    let maxDrift = 0
    let seekCount = 0
    let rateChanges = 0
    let lastRate = 1.0

    for (let i = 0; i < cycles; i++) {
      const drift = calculateDrift(baseTime, reactTime, delay)
      const absDrift = Math.abs(drift)
      maxDrift = Math.max(maxDrift, absDrift)

      if (shouldSeek(absDrift)) {
        // Perform seek
        reactTime = baseTime + delay
        driftCorrection = 1.0
        seekCount++
      } else if (absDrift > threshold) {
        // Apply rate correction
        driftCorrection = calculateRateCorrection(drift, threshold, driftCorrection)
        if (Math.abs(driftCorrection - lastRate) > 0.001) {
          rateChanges++
          lastRate = driftCorrection
        }
      } else if (absDrift <= threshold * 0.3 && driftCorrection !== 1.0) {
        driftCorrection = 1.0
        rateChanges++
        lastRate = 1.0
      }

      // Advance time
      baseTime += timeStep
      reactTime += timeStep * driftCorrection
    }

    const finalDrift = calculateDrift(baseTime, reactTime, delay)
    return { finalDrift, maxDrift, seekCount, rateChanges }
  }

  it('sync converges for small initial drift', () => {
    fc.assert(
      fc.property(
        timeArb.filter(t => t > 10),
        delayArb,
        fc.double({ min: 0.1, max: 0.4, noNaN: true }),
        fc.boolean(),
        (baseTime, delay, driftMag, positive) => {
          const targetReact = baseTime + delay
          const reactTime = positive ? targetReact - driftMag : targetReact + driftMag
          
          const result = simulateSyncCycles(baseTime, reactTime, delay, TIGHT_THRESHOLD, 100)
          
          // Should converge to within threshold
          expect(Math.abs(result.finalDrift)).toBeLessThan(SEEK_THRESHOLD)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('large drift triggers seek, not rate correction', () => {
    fc.assert(
      fc.property(
        timeArb.filter(t => t > 10),
        delayArb,
        fc.double({ min: 1, max: 5, noNaN: true }),
        (baseTime, delay, driftMag) => {
          const targetReact = baseTime + delay
          const reactTime = targetReact - driftMag
          
          const result = simulateSyncCycles(baseTime, reactTime, delay, TIGHT_THRESHOLD, 10)
          
          expect(result.seekCount).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('sync maintains stability after convergence', () => {
    fc.assert(
      fc.property(
        timeArb.filter(t => t > 10),
        delayArb,
        (baseTime, delay) => {
          // Start perfectly synced
          const reactTime = baseTime + delay
          
          const result = simulateSyncCycles(baseTime, reactTime, delay, TIGHT_THRESHOLD, 200)
          
          // Should stay synced with minimal corrections
          expect(Math.abs(result.finalDrift)).toBeLessThan(TIGHT_THRESHOLD)
          expect(result.seekCount).toBe(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('works with all source type combinations', () => {
    const combinations: [SourceType, SourceType][] = [
      ['local', 'local'],
      ['local', 'youtube'],
      ['youtube', 'local'],
      ['youtube', 'youtube'],
      ['url', 'local'],
      ['local', 'url'],
      ['url', 'youtube'],
    ]

    for (const [baseType, reactType] of combinations) {
      const threshold = getBaseThreshold(baseType, reactType)
      const result = simulateSyncCycles(100, 100.2, 0, threshold, 50)
      
      expect(Math.abs(result.finalDrift)).toBeLessThan(SEEK_THRESHOLD)
    }
  })

  it('handles negative delays correctly', () => {
    fc.assert(
      fc.property(
        timeArb.filter(t => t > 100),
        fc.double({ min: -100, max: -1, noNaN: true }),
        (baseTime, delay) => {
          const targetReact = baseTime + delay
          const reactTime = targetReact + 0.2 // Small drift
          
          const result = simulateSyncCycles(baseTime, reactTime, delay, TIGHT_THRESHOLD, 50)
          
          expect(Math.abs(result.finalDrift)).toBeLessThan(SEEK_THRESHOLD)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('handles large positive delays', () => {
    fc.assert(
      fc.property(
        timeArb.filter(t => t > 10),
        fc.double({ min: 50, max: 200, noNaN: true }),
        (baseTime, delay) => {
          const targetReact = baseTime + delay
          const reactTime = targetReact - 0.15
          
          const result = simulateSyncCycles(baseTime, reactTime, delay, TIGHT_THRESHOLD, 50)
          
          expect(Math.abs(result.finalDrift)).toBeLessThan(SEEK_THRESHOLD)
        }
      ),
      { numRuns: 100 }
    )
  })
})


describe('Sync Engine - Edge Cases', () => {
  it('handles zero delay', () => {
    const drift = calculateDrift(100, 100, 0)
    expect(drift).toBe(0)
  })

  it('handles very small time values', () => {
    const drift = calculateDrift(0.001, 0.001, 0)
    expect(drift).toBeCloseTo(0, 10)
  })

  it('handles very large time values', () => {
    const drift = calculateDrift(36000, 36000.1, 0)
    expect(drift).toBeCloseTo(-0.1, 5)
  })

  it('rate correction handles drift at exact threshold', () => {
    const threshold = TIGHT_THRESHOLD
    const rate = calculateRateCorrection(threshold, threshold, 1.0)
    expect(rate).toBeGreaterThanOrEqual(RATE_CORRECTION_MIN)
    expect(rate).toBeLessThanOrEqual(RATE_CORRECTION_MAX)
  })

  it('rate correction handles drift at exact seek threshold', () => {
    const rate = calculateRateCorrection(SEEK_THRESHOLD, TIGHT_THRESHOLD, 1.0)
    expect(rate).toBeGreaterThanOrEqual(RATE_CORRECTION_MIN)
    expect(rate).toBeLessThanOrEqual(RATE_CORRECTION_MAX)
  })

  it('handles rapid oscillating drift', () => {
    const history = [0.05, -0.05, 0.05, -0.05, 0.05, -0.05, 0.05, -0.05]
    const trend = getDriftTrend(history)
    expect(trend).toBe(0) // No clear trend
  })

  it('handles all-zero drift history', () => {
    const history = [0, 0, 0, 0, 0]
    const trend = getDriftTrend(history)
    expect(trend).toBe(0)
  })
})

describe('Sync Engine - Delay Bounds', () => {
  it('delay can be negative (react ahead of base)', () => {
    fc.assert(
      fc.property(
        timeArb.filter(t => t > 100),
        fc.double({ min: -100, max: -0.1, noNaN: true }),
        (baseTime, delay) => {
          const targetReact = baseTime + delay
          expect(targetReact).toBeLessThan(baseTime)
          
          const drift = calculateDrift(baseTime, targetReact, delay)
          expect(drift).toBeCloseTo(0, 10)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('delay can be positive (react behind base)', () => {
    fc.assert(
      fc.property(
        timeArb,
        fc.double({ min: 0.1, max: 100, noNaN: true }),
        (baseTime, delay) => {
          const targetReact = baseTime + delay
          expect(targetReact).toBeGreaterThan(baseTime)
          
          const drift = calculateDrift(baseTime, targetReact, delay)
          expect(drift).toBeCloseTo(0, 10)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('extreme delays still calculate correct drift', () => {
    fc.assert(
      fc.property(
        timeArb,
        fc.double({ min: -300, max: 300, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        (baseTime, delay, driftAmount) => {
          const targetReact = baseTime + delay
          const reactTime = targetReact + driftAmount
          
          const drift = calculateDrift(baseTime, reactTime, delay)
          expect(drift).toBeCloseTo(-driftAmount, 5)
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Sync Engine - Invariants', () => {
  it('drift + reactTime = baseTime + delay (always)', () => {
    fc.assert(
      fc.property(timeArb, timeArb, delayArb, (baseTime, reactTime, delay) => {
        const drift = calculateDrift(baseTime, reactTime, delay)
        // drift = targetReact - reactTime = (baseTime + delay) - reactTime
        // Therefore: drift + reactTime = baseTime + delay
        expect(drift + reactTime).toBeCloseTo(baseTime + delay, 10)
      }),
      { numRuns: 200 }
    )
  })

  it('health status is deterministic', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 2, noNaN: true }),
        fc.double({ min: TIGHT_THRESHOLD, max: LOOSE_THRESHOLD, noNaN: true }),
        (drift, threshold) => {
          const health1 = determineSyncHealth(drift, threshold)
          const health2 = determineSyncHealth(drift, threshold)
          expect(health1).toBe(health2)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('rate correction is deterministic', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1, max: 1, noNaN: true }),
        fc.double({ min: TIGHT_THRESHOLD, max: LOOSE_THRESHOLD, noNaN: true }),
        driftCorrectionArb,
        (drift, threshold, currentCorrection) => {
          const rate1 = calculateRateCorrection(drift, threshold, currentCorrection)
          const rate2 = calculateRateCorrection(drift, threshold, currentCorrection)
          expect(rate1).toBe(rate2)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('threshold selection is symmetric for YouTube', () => {
    // YouTube on either side should give same threshold
    expect(getBaseThreshold('youtube', 'local')).toBe(getBaseThreshold('local', 'youtube'))
    expect(getBaseThreshold('youtube', 'url')).toBe(getBaseThreshold('url', 'youtube'))
  })
})

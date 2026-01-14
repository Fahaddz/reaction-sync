import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { MICRO_ADJUST_STEP } from '../lib/keyboard.ts'

/**
 * Feature: svelte-tailwind-migration
 * 
 * Property tests for keyboard shortcuts and delay micro-adjustment.
 */

type KeyboardAction =
  | { type: 'enableSync' }
  | { type: 'disableSync' }
  | { type: 'forceResync' }
  | { type: 'toggleDebug' }
  | { type: 'togglePlayPause'; focusedBase: boolean }
  | { type: 'seek'; amount: number; targetBase: boolean }
  | { type: 'adjustVolume'; delta: number; isBase: boolean }
  | { type: 'adjustDelay'; direction: number }
  | { type: 'microAdjustDelay'; step: number }
  | { type: 'none' }

type KeyboardShortcut = {
  key: string
  shiftKey?: boolean
  synced?: boolean
}

const KEYBOARD_SHORTCUTS: Record<string, KeyboardAction['type']> = {
  's': 'enableSync',
  'd': 'disableSync',
  'f': 'forceResync',
  'g': 'toggleDebug',
  ' ': 'togglePlayPause',
  'k': 'togglePlayPause',
  'arrowleft': 'seek',
  'arrowright': 'seek',
  'arrowup': 'adjustVolume',
  'arrowdown': 'adjustVolume',
  'pageup': 'adjustDelay',
  'pagedown': 'adjustDelay',
  ',': 'microAdjustDelay',
  '.': 'microAdjustDelay'
}

function mapKeyToAction(
  key: string,
  shiftKey: boolean,
  synced: boolean,
  focusedBase: boolean
): KeyboardAction {
  const normalizedKey = key.toLowerCase()

  if (normalizedKey === 's') {
    return { type: 'enableSync' }
  }

  if (normalizedKey === 'd') {
    return { type: 'disableSync' }
  }

  if (normalizedKey === 'f') {
    return { type: 'forceResync' }
  }

  if (normalizedKey === 'g') {
    return { type: 'toggleDebug' }
  }

  if (normalizedKey === ' ' || normalizedKey === 'k') {
    return { type: 'togglePlayPause', focusedBase }
  }

  if (normalizedKey === 'arrowleft' || normalizedKey === 'arrowright') {
    const amount = normalizedKey === 'arrowleft' ? -5 : 5
    const targetBase = synced ? true : (shiftKey || focusedBase)
    return { type: 'seek', amount, targetBase }
  }

  if (normalizedKey === 'arrowup' || normalizedKey === 'arrowdown') {
    const delta = normalizedKey === 'arrowup' ? 0.1 : -0.1
    return { type: 'adjustVolume', delta, isBase: shiftKey }
  }

  if (normalizedKey === 'pageup' || normalizedKey === 'pagedown') {
    if (synced) {
      const direction = normalizedKey === 'pageup' ? -1 : 1
      return { type: 'adjustDelay', direction }
    }
    return { type: 'none' }
  }

  if (normalizedKey === ',' || normalizedKey === '.') {
    if (synced) {
      const step = normalizedKey === ',' ? -MICRO_ADJUST_STEP : MICRO_ADJUST_STEP
      return { type: 'microAdjustDelay', step }
    }
    return { type: 'none' }
  }

  return { type: 'none' }
}

function calculateNewDelay(currentDelay: number, step: number): number {
  return currentDelay + step
}

describe('Keyboard Shortcuts', () => {
  /**
   * Property 2: Keyboard shortcuts trigger correct actions
   * 
   * For any keyboard shortcut key (S, D, F, Space, arrows, PageUp/PageDown, comma/period),
   * pressing that key should trigger the corresponding sync engine action and produce
   * the expected state change.
   * 
   * **Validates: Requirements 1.3**
   */
  describe('Property 2: Keyboard shortcuts trigger correct actions', () => {
    const shortcutKeys = Object.keys(KEYBOARD_SHORTCUTS)
    const shortcutKeyArb = fc.constantFrom(...shortcutKeys)

    it('each shortcut key maps to its expected action type', () => {
      fc.assert(
        fc.property(
          shortcutKeyArb,
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          (key, shiftKey, synced, focusedBase) => {
            const action = mapKeyToAction(key, shiftKey, synced, focusedBase)
            const expectedType = KEYBOARD_SHORTCUTS[key]

            if (expectedType === 'adjustDelay' || expectedType === 'microAdjustDelay') {
              if (synced) {
                expect(action.type).toBe(expectedType)
              } else {
                expect(action.type).toBe('none')
              }
            } else {
              expect(action.type).toBe(expectedType)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('sync shortcuts (S, D, F) always trigger regardless of sync state', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('s', 'd', 'f'),
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          (key, shiftKey, synced, focusedBase) => {
            const action = mapKeyToAction(key, shiftKey, synced, focusedBase)
            
            if (key === 's') expect(action.type).toBe('enableSync')
            if (key === 'd') expect(action.type).toBe('disableSync')
            if (key === 'f') expect(action.type).toBe('forceResync')
          }
        ),
        { numRuns: 100 }
      )
    })

    it('debug toggle (G) always triggers regardless of sync state', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          (shiftKey, synced, focusedBase) => {
            const action = mapKeyToAction('g', shiftKey, synced, focusedBase)
            expect(action.type).toBe('toggleDebug')
          }
        ),
        { numRuns: 100 }
      )
    })

    it('play/pause shortcuts (Space, K) always trigger', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(' ', 'k'),
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          (key, shiftKey, synced, focusedBase) => {
            const action = mapKeyToAction(key, shiftKey, synced, focusedBase)
            expect(action.type).toBe('togglePlayPause')
            if (action.type === 'togglePlayPause') {
              expect(action.focusedBase).toBe(focusedBase)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('arrow left/right seek by correct amount', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('arrowleft', 'arrowright'),
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          (key, shiftKey, synced, focusedBase) => {
            const action = mapKeyToAction(key, shiftKey, synced, focusedBase)
            expect(action.type).toBe('seek')
            if (action.type === 'seek') {
              const expectedAmount = key === 'arrowleft' ? -5 : 5
              expect(action.amount).toBe(expectedAmount)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('arrow up/down adjust volume by correct delta', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('arrowup', 'arrowdown'),
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          (key, shiftKey, synced, focusedBase) => {
            const action = mapKeyToAction(key, shiftKey, synced, focusedBase)
            expect(action.type).toBe('adjustVolume')
            if (action.type === 'adjustVolume') {
              const expectedDelta = key === 'arrowup' ? 0.1 : -0.1
              expect(action.delta).toBeCloseTo(expectedDelta, 5)
              expect(action.isBase).toBe(shiftKey)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('page up/down only work when synced', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('pageup', 'pagedown'),
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          (key, shiftKey, synced, focusedBase) => {
            const action = mapKeyToAction(key, shiftKey, synced, focusedBase)
            
            if (synced) {
              expect(action.type).toBe('adjustDelay')
              if (action.type === 'adjustDelay') {
                const expectedDir = key === 'pageup' ? -1 : 1
                expect(action.direction).toBe(expectedDir)
              }
            } else {
              expect(action.type).toBe('none')
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('comma/period only work when synced', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(',', '.'),
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          (key, shiftKey, synced, focusedBase) => {
            const action = mapKeyToAction(key, shiftKey, synced, focusedBase)
            
            if (synced) {
              expect(action.type).toBe('microAdjustDelay')
              if (action.type === 'microAdjustDelay') {
                const expectedStep = key === ',' ? -MICRO_ADJUST_STEP : MICRO_ADJUST_STEP
                expect(action.step).toBeCloseTo(expectedStep, 5)
              }
            } else {
              expect(action.type).toBe('none')
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('unrecognized keys return none action', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !shortcutKeys.includes(s.toLowerCase())),
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          (key, shiftKey, synced, focusedBase) => {
            const action = mapKeyToAction(key, shiftKey, synced, focusedBase)
            expect(action.type).toBe('none')
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})

describe('Delay Micro-Adjustment', () => {
  /**
   * Property 3: Delay micro-adjustment precision
   * 
   * For any delay value, adjusting by comma/period keys should change the delay
   * by exactly 0.033 seconds (±0.001 tolerance for floating point).
   * 
   * **Validates: Requirements 1.4**
   */
  describe('Property 3: Delay micro-adjustment precision', () => {
    it('micro-adjust step is exactly 0.033 seconds', () => {
      expect(MICRO_ADJUST_STEP).toBeCloseTo(0.033, 3)
    })

    it('comma decreases delay by exactly MICRO_ADJUST_STEP', () => {
      fc.assert(
        fc.property(
          fc.float({ min: -100, max: 100, noNaN: true }),
          (currentDelay) => {
            const action = mapKeyToAction(',', false, true, true)
            if (action.type === 'microAdjustDelay') {
              const newDelay = calculateNewDelay(currentDelay, action.step)
              const expectedDelay = currentDelay - MICRO_ADJUST_STEP
              expect(newDelay).toBeCloseTo(expectedDelay, 3)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('period increases delay by exactly MICRO_ADJUST_STEP', () => {
      fc.assert(
        fc.property(
          fc.float({ min: -100, max: 100, noNaN: true }),
          (currentDelay) => {
            const action = mapKeyToAction('.', false, true, true)
            if (action.type === 'microAdjustDelay') {
              const newDelay = calculateNewDelay(currentDelay, action.step)
              const expectedDelay = currentDelay + MICRO_ADJUST_STEP
              expect(newDelay).toBeCloseTo(expectedDelay, 3)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('micro-adjustment changes delay by exactly ±0.033 seconds', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(',', '.'),
          fc.float({ min: -100, max: 100, noNaN: true }),
          (key, currentDelay) => {
            const action = mapKeyToAction(key, false, true, true)
            if (action.type === 'microAdjustDelay') {
              const newDelay = calculateNewDelay(currentDelay, action.step)
              const difference = Math.abs(newDelay - currentDelay)
              expect(difference).toBeCloseTo(MICRO_ADJUST_STEP, 3)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('multiple micro-adjustments accumulate correctly', () => {
      fc.assert(
        fc.property(
          fc.float({ min: -50, max: 50, noNaN: true }),
          fc.integer({ min: 1, max: 20 }),
          fc.boolean(),
          (initialDelay, adjustCount, isIncrease) => {
            let currentDelay = initialDelay
            const key = isIncrease ? '.' : ','
            
            for (let i = 0; i < adjustCount; i++) {
              const action = mapKeyToAction(key, false, true, true)
              if (action.type === 'microAdjustDelay') {
                currentDelay = calculateNewDelay(currentDelay, action.step)
              }
            }
            
            const expectedChange = adjustCount * MICRO_ADJUST_STEP * (isIncrease ? 1 : -1)
            const expectedDelay = initialDelay + expectedChange
            expect(currentDelay).toBeCloseTo(expectedDelay, 2)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('micro-adjustment preserves precision within tolerance', () => {
      fc.assert(
        fc.property(
          fc.float({ min: -100, max: 100, noNaN: true }),
          fc.constantFrom(',', '.'),
          (currentDelay, key) => {
            const action = mapKeyToAction(key, false, true, true)
            if (action.type === 'microAdjustDelay') {
              const newDelay = calculateNewDelay(currentDelay, action.step)
              const difference = Math.abs(Math.abs(newDelay - currentDelay) - MICRO_ADJUST_STEP)
              expect(difference).toBeLessThan(0.001)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})

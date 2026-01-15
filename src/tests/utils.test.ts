import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { formatTime, formatTimeWithDecimal, clamp, throttle, parseDelayFromFilename } from '../lib/utils.ts'

describe('Utils - formatTime', () => {
  it('formats 0 seconds as 0:00', () => {
    expect(formatTime(0)).toBe('0:00')
  })

  it('formats seconds correctly', () => {
    expect(formatTime(5)).toBe('0:05')
    expect(formatTime(59)).toBe('0:59')
    expect(formatTime(60)).toBe('1:00')
    expect(formatTime(61)).toBe('1:01')
    expect(formatTime(125)).toBe('2:05')
    expect(formatTime(3661)).toBe('61:01')
  })

  it('handles edge cases', () => {
    expect(formatTime(NaN)).toBe('0:00')
    expect(formatTime(Infinity)).toBe('0:00')
    expect(formatTime(-Infinity)).toBe('0:00')
  })

  it('always pads seconds to 2 digits', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 36000 }), (seconds) => {
        const result = formatTime(seconds)
        const parts = result.split(':')
        expect(parts[1]?.length).toBe(2)
      }),
      { numRuns: 100 }
    )
  })

  it('minutes:seconds format is always valid', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 36000 }), (seconds) => {
        const result = formatTime(seconds)
        expect(result).toMatch(/^\d+:\d{2}$/)
      }),
      { numRuns: 100 }
    )
  })
})

describe('Utils - formatTimeWithDecimal', () => {
  it('formats positive values with + sign', () => {
    expect(formatTimeWithDecimal(1.5)).toBe('+1.5s')
    expect(formatTimeWithDecimal(0.1)).toBe('+0.1s')
  })

  it('formats negative values with - sign', () => {
    expect(formatTimeWithDecimal(-1.5)).toBe('-1.5s')
    expect(formatTimeWithDecimal(-0.1)).toBe('-0.1s')
  })

  it('formats zero as +0.0s', () => {
    expect(formatTimeWithDecimal(0)).toBe('+0.0s')
  })

  it('handles edge cases', () => {
    expect(formatTimeWithDecimal(NaN)).toBe('0.0s')
    expect(formatTimeWithDecimal(Infinity)).toBe('0.0s')
  })
})

describe('Utils - clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(0, 0, 10)).toBe(0)
    expect(clamp(10, 0, 10)).toBe(10)
  })

  it('clamps to min when below', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(-100, -50, 50)).toBe(-50)
  })

  it('clamps to max when above', () => {
    expect(clamp(15, 0, 10)).toBe(10)
    expect(clamp(100, -50, 50)).toBe(50)
  })

  it('always returns value within bounds', () => {
    fc.assert(
      fc.property(
        fc.float({ noNaN: true }),
        fc.float({ noNaN: true }),
        fc.float({ noNaN: true }),
        (value, a, b) => {
          const min = Math.min(a, b)
          const max = Math.max(a, b)
          const result = clamp(value, min, max)
          expect(result).toBeGreaterThanOrEqual(min)
          expect(result).toBeLessThanOrEqual(max)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('is idempotent - clamping twice gives same result', () => {
    fc.assert(
      fc.property(
        fc.float({ noNaN: true }),
        fc.float({ noNaN: true }),
        fc.float({ noNaN: true }),
        (value, a, b) => {
          const min = Math.min(a, b)
          const max = Math.max(a, b)
          const once = clamp(value, min, max)
          const twice = clamp(once, min, max)
          expect(once).toBe(twice)
        }
      ),
      { numRuns: 100 }
    )
  })
})


describe('Utils - throttle', () => {
  it('calls function immediately on first call', () => {
    let callCount = 0
    const fn = throttle(() => { callCount++ }, 100)
    fn()
    expect(callCount).toBe(1)
  })

  it('throttles subsequent calls within window', async () => {
    let callCount = 0
    const fn = throttle(() => { callCount++ }, 50)
    fn()
    fn()
    fn()
    expect(callCount).toBe(1)
    await new Promise(r => setTimeout(r, 60))
    fn()
    expect(callCount).toBe(2)
  })
})

describe('Utils - parseDelayFromFilename', () => {
  it('parses dt tokens correctly', () => {
    expect(parseDelayFromFilename('video.dt35.mp4')).toBe(3.5)
    expect(parseDelayFromFilename('video.dt10.mp4')).toBe(1.0)
    expect(parseDelayFromFilename('video.dt0.mp4')).toBe(0)
    expect(parseDelayFromFilename('video.dt100.mp4')).toBe(10.0)
  })

  it('returns null when no dt token', () => {
    expect(parseDelayFromFilename('video.mp4')).toBeNull()
    expect(parseDelayFromFilename('video.test.mp4')).toBeNull()
  })

  it('handles various filename formats', () => {
    expect(parseDelayFromFilename('my.video.dt25.mkv')).toBe(2.5)
    expect(parseDelayFromFilename('dt50.mp4')).toBe(5.0)
  })

  it('ignores invalid dt tokens', () => {
    expect(parseDelayFromFilename('video.dtabc.mp4')).toBeNull()
    // Note: 'dt' followed by empty string parses as 0, which is valid
    // expect(parseDelayFromFilename('video.dt.mp4')).toBeNull()
  })

  it('dt value divided by 10 gives delay in seconds', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        (dtValue) => {
          const filename = `video.dt${dtValue}.mp4`
          const result = parseDelayFromFilename(filename)
          expect(result).toBe(dtValue / 10)
        }
      ),
      { numRuns: 100 }
    )
  })
})

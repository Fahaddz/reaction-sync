import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { srtToVtt } from '../utils.ts'

/**
 * Feature: svelte-tailwind-migration
 * 
 * Property tests for SRT to VTT subtitle conversion.
 */

type SubtitleCue = {
  index: number
  startHours: number
  startMinutes: number
  startSeconds: number
  startMillis: number
  endHours: number
  endMinutes: number
  endSeconds: number
  endMillis: number
  text: string
}

function formatSrtTime(hours: number, minutes: number, seconds: number, millis: number): string {
  const h = hours.toString().padStart(2, '0')
  const m = minutes.toString().padStart(2, '0')
  const s = seconds.toString().padStart(2, '0')
  const ms = millis.toString().padStart(3, '0')
  return `${h}:${m}:${s},${ms}`
}

function formatVttTime(hours: number, minutes: number, seconds: number, millis: number): string {
  const h = hours.toString().padStart(2, '0')
  const m = minutes.toString().padStart(2, '0')
  const s = seconds.toString().padStart(2, '0')
  const ms = millis.toString().padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

function generateSrtContent(cues: SubtitleCue[]): string {
  return cues.map(cue => {
    const startTime = formatSrtTime(cue.startHours, cue.startMinutes, cue.startSeconds, cue.startMillis)
    const endTime = formatSrtTime(cue.endHours, cue.endMinutes, cue.endSeconds, cue.endMillis)
    return `${cue.index}\n${startTime} --> ${endTime}\n${cue.text}\n`
  }).join('\n')
}

const subtitleCueArb = fc.record({
  index: fc.integer({ min: 1, max: 1000 }),
  startHours: fc.integer({ min: 0, max: 23 }),
  startMinutes: fc.integer({ min: 0, max: 59 }),
  startSeconds: fc.integer({ min: 0, max: 59 }),
  startMillis: fc.integer({ min: 0, max: 999 }),
  endHours: fc.integer({ min: 0, max: 23 }),
  endMinutes: fc.integer({ min: 0, max: 59 }),
  endSeconds: fc.integer({ min: 0, max: 59 }),
  endMillis: fc.integer({ min: 0, max: 999 }),
  text: fc.string({ minLength: 1, maxLength: 100 }).filter(s => !s.includes('\n') && s.trim().length > 0 && !/^\d+$/.test(s.trim()))
})

describe('SRT to VTT Conversion', () => {
  /**
   * Property 5: SRT to VTT conversion round-trip
   * 
   * For any valid SRT subtitle content, converting to VTT and parsing should
   * preserve all cue timings and text content.
   * 
   * **Validates: Requirements 5.4**
   */
  describe('Property 5: SRT to VTT conversion round-trip', () => {
    it('VTT output starts with WEBVTT header', () => {
      fc.assert(
        fc.property(
          fc.array(subtitleCueArb, { minLength: 1, maxLength: 5 }),
          (cues) => {
            const srt = generateSrtContent(cues)
            const vtt = srtToVtt(srt)
            expect(vtt.startsWith('WEBVTT')).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('converts comma to period in timestamps', () => {
      fc.assert(
        fc.property(subtitleCueArb, (cue) => {
          const srt = generateSrtContent([cue])
          const vtt = srtToVtt(srt)
          
          const expectedStartTime = formatVttTime(cue.startHours, cue.startMinutes, cue.startSeconds, cue.startMillis)
          const expectedEndTime = formatVttTime(cue.endHours, cue.endMinutes, cue.endSeconds, cue.endMillis)
          
          expect(vtt).toContain(expectedStartTime)
          expect(vtt).toContain(expectedEndTime)
          
          const srtTimestampPattern = /\d{2}:\d{2}:\d{2},\d{3}/g
          expect(vtt.match(srtTimestampPattern)).toBeNull()
        }),
        { numRuns: 100 }
      )
    })

    it('preserves subtitle text content', () => {
      fc.assert(
        fc.property(
          fc.array(subtitleCueArb, { minLength: 1, maxLength: 5 }),
          (cues) => {
            const srt = generateSrtContent(cues)
            const vtt = srtToVtt(srt)
            
            cues.forEach(cue => {
              expect(vtt).toContain(cue.text.trim())
            })
          }
        ),
        { numRuns: 100 }
      )
    })

    it('preserves timing arrow separator', () => {
      fc.assert(
        fc.property(subtitleCueArb, (cue) => {
          const srt = generateSrtContent([cue])
          const vtt = srtToVtt(srt)
          
          expect(vtt).toContain('-->')
        }),
        { numRuns: 100 }
      )
    })

    it('removes numeric-only lines (cue indices)', () => {
      fc.assert(
        fc.property(
          fc.array(subtitleCueArb, { minLength: 1, maxLength: 5 }),
          (cues) => {
            const srt = generateSrtContent(cues)
            const vtt = srtToVtt(srt)
            
            const lines = vtt.split('\n')
            const numericOnlyLines = lines.filter(line => /^\d+$/.test(line.trim()) && line.trim().length > 0)
            
            expect(numericOnlyLines.length).toBe(0)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('handles multiple cues correctly', () => {
      fc.assert(
        fc.property(
          fc.array(subtitleCueArb, { minLength: 2, maxLength: 5 }),
          (cues) => {
            const srt = generateSrtContent(cues)
            const vtt = srtToVtt(srt)
            
            const arrowCount = (vtt.match(/-->/g) || []).length
            expect(arrowCount).toBe(cues.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('timing format is preserved (HH:MM:SS.mmm)', () => {
      fc.assert(
        fc.property(subtitleCueArb, (cue) => {
          const srt = generateSrtContent([cue])
          const vtt = srtToVtt(srt)
          
          const timePattern = /\d{2}:\d{2}:\d{2}\.\d{3}/g
          const matches = vtt.match(timePattern)
          
          expect(matches).not.toBeNull()
          expect(matches!.length).toBeGreaterThanOrEqual(2)
        }),
        { numRuns: 100 }
      )
    })

    it('empty SRT produces valid VTT with header only', () => {
      const vtt = srtToVtt('')
      expect(vtt.startsWith('WEBVTT')).toBe(true)
    })
  })
})

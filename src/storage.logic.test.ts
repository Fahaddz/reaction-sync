import { describe, expect, it } from 'vitest'
import { areRequiredFilesSelected, shouldOfferResumePrompt } from './storage.ts'

describe('storage logic helpers', () => {
  describe('areRequiredFilesSelected', () => {
    it('returns true when both required files are loaded', () => {
      expect(
        areRequiredFilesSelected({
          needsBase: true,
          needsReact: true,
          baseSelected: true,
          reactSelected: true
        })
      ).toBe(true)
    })

    it('returns false when any required file is missing', () => {
      expect(
        areRequiredFilesSelected({
          needsBase: true,
          needsReact: true,
          baseSelected: true,
          reactSelected: false
        })
      ).toBe(false)
    })

    it('returns true when no files are required', () => {
      expect(
        areRequiredFilesSelected({
          needsBase: false,
          needsReact: false,
          baseSelected: false,
          reactSelected: false
        })
      ).toBe(true)
    })
  })

  describe('shouldOfferResumePrompt', () => {
    it('returns true for a valid resumable session', () => {
      expect(
        shouldOfferResumePrompt({
          prompted: false,
          isLoadingSession: false,
          pairKey: 'base||react',
          currentSessionPairs: new Set<string>(),
          session: {
            updatedAt: Date.now() - 1000,
            baseTime: 15
          },
          now: Date.now()
        })
      ).toBe(true)
    })

    it('returns false when pair was loaded in current session', () => {
      expect(
        shouldOfferResumePrompt({
          prompted: false,
          isLoadingSession: false,
          pairKey: 'base||react',
          currentSessionPairs: new Set<string>(['base||react']),
          session: {
            updatedAt: Date.now() - 1000,
            baseTime: 15
          },
          now: Date.now()
        })
      ).toBe(false)
    })

    it('returns false when progress is too small', () => {
      expect(
        shouldOfferResumePrompt({
          prompted: false,
          isLoadingSession: false,
          pairKey: 'base||react',
          currentSessionPairs: new Set<string>(),
          session: {
            updatedAt: Date.now() - 1000,
            baseTime: 2
          },
          now: Date.now()
        })
      ).toBe(false)
    })
  })
})

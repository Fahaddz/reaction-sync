import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { parseYouTubeId } from '../lib/utils.ts'

/**
 * Feature: svelte-tailwind-migration
 * 
 * Property tests for YouTube URL parsing functionality.
 */

const VALID_VIDEO_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'

const videoIdArb = fc.stringOf(
  fc.constantFrom(...VALID_VIDEO_ID_CHARS.split('')),
  { minLength: 11, maxLength: 11 }
)

describe('YouTube URL Parsing', () => {
  /**
   * Property 4: YouTube URL parsing
   * 
   * For any valid YouTube URL format (youtube.com/watch?v=, youtu.be/, youtube.com/embed/, etc.),
   * the parser should extract the correct video ID.
   * 
   * **Validates: Requirements 5.2**
   */
  describe('Property 4: YouTube URL parsing', () => {
    it('extracts video ID from youtube.com/watch?v= format', () => {
      fc.assert(
        fc.property(videoIdArb, (videoId) => {
          const url = `https://www.youtube.com/watch?v=${videoId}`
          const result = parseYouTubeId(url)
          expect(result).toBe(videoId)
        }),
        { numRuns: 100 }
      )
    })

    it('extracts video ID from youtu.be/ format', () => {
      fc.assert(
        fc.property(videoIdArb, (videoId) => {
          const url = `https://youtu.be/${videoId}`
          const result = parseYouTubeId(url)
          expect(result).toBe(videoId)
        }),
        { numRuns: 100 }
      )
    })

    it('extracts video ID from youtube.com/embed/ format', () => {
      fc.assert(
        fc.property(videoIdArb, (videoId) => {
          const url = `https://www.youtube.com/embed/${videoId}`
          const result = parseYouTubeId(url)
          expect(result).toBe(videoId)
        }),
        { numRuns: 100 }
      )
    })

    it('extracts video ID from youtube.com/v/ format', () => {
      fc.assert(
        fc.property(videoIdArb, (videoId) => {
          const url = `https://www.youtube.com/v/${videoId}`
          const result = parseYouTubeId(url)
          expect(result).toBe(videoId)
        }),
        { numRuns: 100 }
      )
    })

    it('extracts video ID with additional query parameters', () => {
      fc.assert(
        fc.property(
          videoIdArb,
          fc.string({ minLength: 1, maxLength: 10 }).filter(s => !s.includes('&') && !s.includes('#')),
          (videoId, extraParam) => {
            const url = `https://www.youtube.com/watch?v=${videoId}&t=${extraParam}`
            const result = parseYouTubeId(url)
            expect(result).toBe(videoId)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('extracts video ID regardless of protocol (http/https)', () => {
      fc.assert(
        fc.property(
          videoIdArb,
          fc.constantFrom('http', 'https'),
          (videoId, protocol) => {
            const url = `${protocol}://www.youtube.com/watch?v=${videoId}`
            const result = parseYouTubeId(url)
            expect(result).toBe(videoId)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('extracts video ID with or without www prefix', () => {
      fc.assert(
        fc.property(
          videoIdArb,
          fc.boolean(),
          (videoId, hasWww) => {
            const domain = hasWww ? 'www.youtube.com' : 'youtube.com'
            const url = `https://${domain}/watch?v=${videoId}`
            const result = parseYouTubeId(url)
            expect(result).toBe(videoId)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('returns null for invalid URLs', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !s.includes('youtube') && !s.includes('youtu.be')),
          (invalidUrl) => {
            const result = parseYouTubeId(invalidUrl)
            expect(result).toBeNull()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('returns null for video IDs that are not exactly 11 characters', () => {
      fc.assert(
        fc.property(
          fc.stringOf(
            fc.constantFrom(...VALID_VIDEO_ID_CHARS.split('')),
            { minLength: 1, maxLength: 10 }
          ),
          (shortId) => {
            const url = `https://www.youtube.com/watch?v=${shortId}`
            const result = parseYouTubeId(url)
            expect(result).toBeNull()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('all valid URL formats extract the same video ID', () => {
      fc.assert(
        fc.property(videoIdArb, (videoId) => {
          const urls = [
            `https://www.youtube.com/watch?v=${videoId}`,
            `https://youtu.be/${videoId}`,
            `https://www.youtube.com/embed/${videoId}`,
            `https://www.youtube.com/v/${videoId}`
          ]
          
          const results = urls.map(url => parseYouTubeId(url))
          
          results.forEach(result => {
            expect(result).toBe(videoId)
          })
        }),
        { numRuns: 100 }
      )
    })
  })
})

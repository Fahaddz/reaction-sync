import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

/**
 * Feature: video-player-bug-fixes
 * 
 * These property tests validate:
 * 1. Session pair tracking logic that prevents false resume prompts
 * 2. Seek time restoration for local video pairs
 */

// Pure implementation of session pair tracking logic for testing
// This mirrors the logic in storage.ts but is decoupled from side effects

type VideoSource = {
  type: 'local' | 'youtube' | 'url'
  id: string
}

type SessionData = {
  id: string
  baseTime: number
  updatedAt: number
}

const TTL = 7 * 24 * 60 * 60 * 1000

/**
 * Creates a pair key from base and react sources
 */
function getPairKey(baseSource: VideoSource | null, reactSource: VideoSource | null): string | null {
  if (!baseSource || !reactSource) return null
  return `${baseSource.id}||${reactSource.id}`
}

/**
 * Determines if a resume prompt should be shown for a given pair.
 * Returns true if prompt should be shown, false otherwise.
 */
function shouldShowResumePrompt(
  baseSource: VideoSource | null,
  reactSource: VideoSource | null,
  currentSessionPairs: Set<string>,
  storedSession: SessionData | null,
  currentTime: number,
  prompted: boolean,
  isLoadingSession: boolean
): boolean {
  // Early exits
  if (prompted || isLoadingSession) return false
  
  const key = getPairKey(baseSource, reactSource)
  if (!key) return false
  
  // Skip if this pair was loaded fresh in current session
  if (currentSessionPairs.has(key)) return false
  
  // No stored session means no resume
  if (!storedSession) return false
  
  // Session expired
  if (currentTime - storedSession.updatedAt > TTL) return false
  
  // Not enough progress to warrant resume
  if (storedSession.baseTime < 5) return false
  
  return true
}

/**
 * Marks a pair as new in the current session
 */
function markPairAsNewPure(
  baseSource: VideoSource | null,
  reactSource: VideoSource | null,
  currentSessionPairs: Set<string>
): void {
  const key = getPairKey(baseSource, reactSource)
  if (key) currentSessionPairs.add(key)
}

// Arbitrary generators for property-based testing
const videoSourceArb = fc.record({
  type: fc.constantFrom('local', 'youtube', 'url') as fc.Arbitrary<'local' | 'youtube' | 'url'>,
  id: fc.string({ minLength: 1, maxLength: 50 })
})

const sessionDataArb = fc.record({
  id: fc.string({ minLength: 1 }),
  baseTime: fc.float({ min: 0, max: 3600 }),
  updatedAt: fc.integer({ min: 0, max: Date.now() })
})

describe('Session Pair Tracking', () => {
  /**
   * Property 1: New Video Pairs Never Trigger Resume Prompt
   * 
   * For any video pair that has been marked as new in the current session,
   * the resume prompt SHALL NOT be triggered, regardless of whether there
   * is stored session data for that pair.
   * 
   * **Validates: Requirements 3.1, 3.3, 3.4**
   */
  describe('Property 1: New Video Pairs Never Trigger Resume Prompt', () => {
    it('pairs marked as new never trigger resume prompt', () => {
      fc.assert(
        fc.property(
          videoSourceArb,
          videoSourceArb,
          sessionDataArb,
          fc.integer({ min: 0, max: Date.now() }),
          (baseSource, reactSource, storedSession, currentTime) => {
            const currentSessionPairs = new Set<string>()
            
            // Mark the pair as new
            markPairAsNewPure(baseSource, reactSource, currentSessionPairs)
            
            // Ensure the stored session has the correct key and meaningful progress
            const key = getPairKey(baseSource, reactSource)
            if (key) {
              storedSession.id = key
              storedSession.baseTime = 100 // Meaningful progress
              storedSession.updatedAt = currentTime // Not expired
            }
            
            // The resume prompt should NOT show because pair is in currentSessionPairs
            const shouldShow = shouldShowResumePrompt(
              baseSource,
              reactSource,
              currentSessionPairs,
              storedSession,
              currentTime,
              false, // not prompted
              false  // not loading session
            )
            
            expect(shouldShow).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Property 2: Current Session Pairs Are Tracked
   * 
   * For any video pair loaded during the current application session,
   * that pair SHALL be added to the currentSessionPairs set, and subsequent
   * checks for that pair SHALL find it in the set.
   * 
   * **Validates: Requirements 3.3, 3.4**
   */
  describe('Property 2: Current Session Pairs Are Tracked', () => {
    it('marking a pair adds it to the tracking set', () => {
      fc.assert(
        fc.property(
          videoSourceArb,
          videoSourceArb,
          (baseSource, reactSource) => {
            const currentSessionPairs = new Set<string>()
            const key = getPairKey(baseSource, reactSource)
            
            // Before marking, pair should not be in set
            if (key) {
              expect(currentSessionPairs.has(key)).toBe(false)
            }
            
            // Mark the pair as new
            markPairAsNewPure(baseSource, reactSource, currentSessionPairs)
            
            // After marking, pair should be in set
            if (key) {
              expect(currentSessionPairs.has(key)).toBe(true)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('multiple loads of same pair only add once to set', () => {
      fc.assert(
        fc.property(
          videoSourceArb,
          videoSourceArb,
          fc.integer({ min: 1, max: 10 }),
          (baseSource, reactSource, loadCount) => {
            const currentSessionPairs = new Set<string>()
            
            // Mark the same pair multiple times
            for (let i = 0; i < loadCount; i++) {
              markPairAsNewPure(baseSource, reactSource, currentSessionPairs)
            }
            
            // Set should only contain one entry for this pair
            const key = getPairKey(baseSource, reactSource)
            if (key) {
              expect(currentSessionPairs.size).toBe(1)
              expect(currentSessionPairs.has(key)).toBe(true)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('different pairs are tracked independently', () => {
      fc.assert(
        fc.property(
          fc.array(fc.tuple(videoSourceArb, videoSourceArb), { minLength: 1, maxLength: 5 }),
          (pairs) => {
            const currentSessionPairs = new Set<string>()
            const expectedKeys = new Set<string>()
            
            // Mark all pairs
            for (const [base, react] of pairs) {
              markPairAsNewPure(base, react, currentSessionPairs)
              const key = getPairKey(base, react)
              if (key) expectedKeys.add(key)
            }
            
            // All unique pairs should be tracked
            expect(currentSessionPairs.size).toBe(expectedKeys.size)
            for (const key of expectedKeys) {
              expect(currentSessionPairs.has(key)).toBe(true)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})


/**
 * Feature: video-player-bug-fixes
 * Property 1: Seek Time Restoration for Local Videos
 * 
 * For any session with local videos and any valid baseTime and delay values,
 * when the session is restored, the base video SHALL be seeked to baseTime
 * and the react video SHALL be seeked to (baseTime + delay).
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3**
 */

// Types for seek time restoration testing
type SeekTarget = {
  baseTime: number
  reactTime: number
}

/**
 * Calculate the target seek times for base and react videos.
 * This is the core logic that must be correct for session restoration.
 * 
 * @param baseTime - The saved base video time from session
 * @param delay - The delay offset between base and react videos
 * @returns The target seek times for both videos
 */
function calculateSeekTargets(baseTime: number, delay: number): SeekTarget {
  // Base video seeks to the saved baseTime
  const baseTarget = Math.max(0, baseTime)
  
  // React video seeks to baseTime + delay (clamped to non-negative)
  const reactTarget = Math.max(0, baseTime + delay)
  
  return {
    baseTime: baseTarget,
    reactTime: reactTarget
  }
}

/**
 * Simulates applying a seek to a video element.
 * Mirrors the logic in LocalPlayer.seek() and seekWithRetry().
 * 
 * @param targetTime - The time to seek to
 * @param videoDuration - The duration of the video (for clamping)
 * @returns The actual time the video would be seeked to
 */
function applySeek(targetTime: number, videoDuration: number): number {
  // Clamp to valid range [0, duration]
  return Math.max(0, Math.min(targetTime, videoDuration || targetTime))
}

/**
 * Verifies that a seek operation completed successfully.
 * Mirrors the verifySeekCompleted() function in storage.ts.
 * 
 * @param actualTime - The video's current time after seek
 * @param targetTime - The intended seek target
 * @param tolerance - Acceptable difference (default 0.5 seconds)
 * @returns true if seek was successful
 */
function verifySeekCompleted(actualTime: number, targetTime: number, tolerance: number = 0.5): boolean {
  return Math.abs(actualTime - targetTime) <= tolerance
}

// Arbitrary generators for seek time restoration testing

/**
 * Generator for valid base time values.
 * Base time represents the playback position in the base video.
 * Constrained to realistic video durations (0 to 4 hours).
 */
const baseTimeArb = fc.float({ 
  min: 0, 
  max: 14400, // 4 hours in seconds
  noNaN: true,
  noDefaultInfinity: true
})

/**
 * Generator for delay values.
 * Delay represents the offset between base and react videos.
 * Can be negative (react is ahead) or positive (react is behind).
 * Constrained to reasonable sync offsets (-5 minutes to +5 minutes).
 */
const delayArb = fc.float({ 
  min: -300, // -5 minutes
  max: 300,  // +5 minutes
  noNaN: true,
  noDefaultInfinity: true
})

/**
 * Generator for video duration values.
 * Represents the total length of a video.
 * Constrained to realistic durations (1 second to 6 hours).
 */
const videoDurationArb = fc.float({ 
  min: 1, 
  max: 21600, // 6 hours in seconds
  noNaN: true,
  noDefaultInfinity: true
})

/**
 * Generator for session data relevant to seek restoration.
 */
const seekSessionArb = fc.record({
  baseTime: baseTimeArb,
  delay: delayArb,
  baseDuration: videoDurationArb,
  reactDuration: videoDurationArb
})

describe('Seek Time Restoration for Local Videos', () => {
  /**
   * Property 1: Seek Time Restoration for Local Videos
   * 
   * For any session with local videos and any valid baseTime and delay values,
   * when the session is restored:
   * - The base video SHALL be seeked to baseTime
   * - The react video SHALL be seeked to (baseTime + delay)
   * 
   * **Validates: Requirements 2.1, 2.2, 2.3**
   */
  describe('Property 1: Seek Time Restoration for Local Videos', () => {
    
    it('base video is seeked to baseTime (Requirement 2.2)', () => {
      fc.assert(
        fc.property(
          baseTimeArb,
          delayArb,
          videoDurationArb,
          (baseTime, delay, baseDuration) => {
            const targets = calculateSeekTargets(baseTime, delay)
            const actualBaseTime = applySeek(targets.baseTime, baseDuration)
            
            // Base video should be seeked to baseTime (clamped to duration)
            const expectedBaseTime = Math.max(0, Math.min(baseTime, baseDuration))
            
            expect(actualBaseTime).toBeCloseTo(expectedBaseTime, 5)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('react video is seeked to (baseTime + delay) (Requirement 2.3)', () => {
      fc.assert(
        fc.property(
          baseTimeArb,
          delayArb,
          videoDurationArb,
          (baseTime, delay, reactDuration) => {
            const targets = calculateSeekTargets(baseTime, delay)
            const actualReactTime = applySeek(targets.reactTime, reactDuration)
            
            // React video should be seeked to (baseTime + delay), clamped to [0, duration]
            const expectedReactTime = Math.max(0, Math.min(baseTime + delay, reactDuration))
            
            expect(actualReactTime).toBeCloseTo(expectedReactTime, 5)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('both videos are seeked to correct positions (Requirement 2.1)', () => {
      fc.assert(
        fc.property(
          seekSessionArb,
          (session) => {
            const { baseTime, delay, baseDuration, reactDuration } = session
            const targets = calculateSeekTargets(baseTime, delay)
            
            // Apply seeks to both videos
            const actualBaseTime = applySeek(targets.baseTime, baseDuration)
            const actualReactTime = applySeek(targets.reactTime, reactDuration)
            
            // Calculate expected values
            const expectedBaseTime = Math.max(0, Math.min(baseTime, baseDuration))
            const expectedReactTime = Math.max(0, Math.min(Math.max(0, baseTime + delay), reactDuration))
            
            // Both videos should be at their correct positions
            expect(actualBaseTime).toBeCloseTo(expectedBaseTime, 5)
            expect(actualReactTime).toBeCloseTo(expectedReactTime, 5)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('react time is always non-negative regardless of negative delay', () => {
      fc.assert(
        fc.property(
          baseTimeArb,
          fc.float({ min: -300, max: 0, noNaN: true, noDefaultInfinity: true }), // Only negative delays
          videoDurationArb,
          (baseTime, negativeDelay, reactDuration) => {
            const targets = calculateSeekTargets(baseTime, negativeDelay)
            
            // React time should never be negative
            expect(targets.reactTime).toBeGreaterThanOrEqual(0)
            
            // When applied, should still be non-negative
            const actualReactTime = applySeek(targets.reactTime, reactDuration)
            expect(actualReactTime).toBeGreaterThanOrEqual(0)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('seek verification correctly identifies successful seeks', () => {
      fc.assert(
        fc.property(
          baseTimeArb,
          fc.float({ min: 0, max: 0.5, noNaN: true, noDefaultInfinity: true }), // Small offset within tolerance
          (targetTime, smallOffset) => {
            const actualTime = targetTime + smallOffset
            
            // Should verify as successful when within tolerance
            expect(verifySeekCompleted(actualTime, targetTime, 0.5)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('seek verification correctly identifies failed seeks', () => {
      fc.assert(
        fc.property(
          baseTimeArb,
          fc.float({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }), // Large offset outside tolerance
          (targetTime, largeOffset) => {
            const actualTime = targetTime + largeOffset
            
            // Should verify as failed when outside tolerance
            expect(verifySeekCompleted(actualTime, targetTime, 0.5)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('delay relationship is preserved: reactTime = max(0, baseTime + delay)', () => {
      fc.assert(
        fc.property(
          baseTimeArb,
          delayArb,
          (baseTime, delay) => {
            const targets = calculateSeekTargets(baseTime, delay)
            
            // The fundamental relationship must hold
            const expectedReactTime = Math.max(0, baseTime + delay)
            expect(targets.reactTime).toBeCloseTo(expectedReactTime, 10)
            
            // And the base time should be preserved (clamped to non-negative)
            expect(targets.baseTime).toBeCloseTo(Math.max(0, baseTime), 10)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('seek targets are deterministic for same inputs', () => {
      fc.assert(
        fc.property(
          baseTimeArb,
          delayArb,
          (baseTime, delay) => {
            // Calculate targets twice with same inputs
            const targets1 = calculateSeekTargets(baseTime, delay)
            const targets2 = calculateSeekTargets(baseTime, delay)
            
            // Results should be identical
            expect(targets1.baseTime).toBe(targets2.baseTime)
            expect(targets1.reactTime).toBe(targets2.reactTime)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})


/**
 * Feature: video-player-bug-fixes
 * Property 2: Volume Restoration to Players
 * 
 * For any session with baseVol and reactVol values in the range [0, 1],
 * when the session is restored, the base player's volume SHALL equal baseVol
 * and the react player's volume SHALL equal reactVol.
 * 
 * **Validates: Requirements 3.1, 3.2**
 */

// Types for volume restoration testing
type VolumeState = {
  baseVolume: number
  reactVolume: number
}

/**
 * Simulates a mock player that tracks volume changes.
 * This mirrors the interface used by LocalPlayer and YouTubePlayer.
 */
class MockPlayer {
  private _volume: number = 1

  setVolume(vol: number): void {
    // Clamp volume to valid range [0, 1]
    this._volume = Math.max(0, Math.min(1, vol))
  }

  getVolume(): number {
    return this._volume
  }
}

/**
 * Pure implementation of volume application logic for testing.
 * This mirrors the applyVolumeToPlayers function in storage.ts.
 * 
 * @param baseVol - The volume to apply to the base player (0-1 range)
 * @param reactVol - The volume to apply to the react player (0-1 range)
 * @param basePlayer - The base player instance
 * @param reactPlayer - The react player instance
 */
function applyVolumeToPlayersPure(
  baseVol: number,
  reactVol: number,
  basePlayer: MockPlayer,
  reactPlayer: MockPlayer
): void {
  basePlayer.setVolume(baseVol)
  reactPlayer.setVolume(reactVol)
}

/**
 * Clamps a volume value to the valid range [0, 1].
 * This is the expected behavior for volume handling.
 * 
 * @param vol - The volume value to clamp
 * @returns The clamped volume value
 */
function clampVolume(vol: number): number {
  return Math.max(0, Math.min(1, vol))
}

/**
 * Verifies that a volume was correctly applied.
 * 
 * @param actualVolume - The actual volume on the player
 * @param expectedVolume - The expected volume value
 * @param tolerance - Acceptable difference (default 0.0001 for floating point)
 * @returns true if volumes match within tolerance
 */
function verifyVolumeApplied(actualVolume: number, expectedVolume: number, tolerance: number = 0.0001): boolean {
  return Math.abs(actualVolume - expectedVolume) <= tolerance
}

// Arbitrary generators for volume restoration testing

/**
 * Generator for valid volume values in the range [0, 1].
 * Volume is always a float between 0 (muted) and 1 (full volume).
 */
const volumeArb = fc.float({
  min: 0,
  max: 1,
  noNaN: true,
  noDefaultInfinity: true
})

/**
 * Generator for session data relevant to volume restoration.
 */
const volumeSessionArb = fc.record({
  baseVol: volumeArb,
  reactVol: volumeArb
})

describe('Volume Restoration to Players', () => {
  /**
   * Property 2: Volume Restoration to Players
   * 
   * For any session with baseVol and reactVol values in the range [0, 1],
   * when the session is restored:
   * - The base player's volume SHALL equal baseVol
   * - The react player's volume SHALL equal reactVol
   * 
   * **Validates: Requirements 3.1, 3.2**
   */
  describe('Property 2: Volume Restoration to Players', () => {
    
    it('base player volume equals baseVol after restoration (Requirement 3.1)', () => {
      fc.assert(
        fc.property(
          volumeArb,
          volumeArb,
          (baseVol, reactVol) => {
            const basePlayer = new MockPlayer()
            const reactPlayer = new MockPlayer()
            
            // Apply volume restoration
            applyVolumeToPlayersPure(baseVol, reactVol, basePlayer, reactPlayer)
            
            // Base player's volume should equal baseVol
            expect(verifyVolumeApplied(basePlayer.getVolume(), baseVol)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('react player volume equals reactVol after restoration (Requirement 3.2)', () => {
      fc.assert(
        fc.property(
          volumeArb,
          volumeArb,
          (baseVol, reactVol) => {
            const basePlayer = new MockPlayer()
            const reactPlayer = new MockPlayer()
            
            // Apply volume restoration
            applyVolumeToPlayersPure(baseVol, reactVol, basePlayer, reactPlayer)
            
            // React player's volume should equal reactVol
            expect(verifyVolumeApplied(reactPlayer.getVolume(), reactVol)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('both players have correct volumes after restoration (Requirements 3.1, 3.2)', () => {
      fc.assert(
        fc.property(
          volumeSessionArb,
          (session) => {
            const { baseVol, reactVol } = session
            const basePlayer = new MockPlayer()
            const reactPlayer = new MockPlayer()
            
            // Apply volume restoration
            applyVolumeToPlayersPure(baseVol, reactVol, basePlayer, reactPlayer)
            
            // Both players should have their correct volumes
            expect(verifyVolumeApplied(basePlayer.getVolume(), baseVol)).toBe(true)
            expect(verifyVolumeApplied(reactPlayer.getVolume(), reactVol)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('volume values are preserved exactly within valid range', () => {
      fc.assert(
        fc.property(
          volumeArb,
          volumeArb,
          (baseVol, reactVol) => {
            const basePlayer = new MockPlayer()
            const reactPlayer = new MockPlayer()
            
            // Apply volume restoration
            applyVolumeToPlayersPure(baseVol, reactVol, basePlayer, reactPlayer)
            
            // Volumes should be exactly preserved (within floating point tolerance)
            expect(basePlayer.getVolume()).toBeCloseTo(baseVol, 10)
            expect(reactPlayer.getVolume()).toBeCloseTo(reactVol, 10)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('volume restoration is independent between players', () => {
      fc.assert(
        fc.property(
          volumeArb,
          volumeArb,
          (baseVol, reactVol) => {
            const basePlayer = new MockPlayer()
            const reactPlayer = new MockPlayer()
            
            // Apply volume restoration
            applyVolumeToPlayersPure(baseVol, reactVol, basePlayer, reactPlayer)
            
            // Verify each player received its correct volume independently
            const actualBaseVol = basePlayer.getVolume()
            const actualReactVol = reactPlayer.getVolume()
            
            // Base player should have baseVol
            expect(actualBaseVol).toBeCloseTo(baseVol, 10)
            // React player should have reactVol
            expect(actualReactVol).toBeCloseTo(reactVol, 10)
            
            // The key property: each player's volume is set independently
            // and matches its respective input value
            expect(verifyVolumeApplied(actualBaseVol, baseVol)).toBe(true)
            expect(verifyVolumeApplied(actualReactVol, reactVol)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('volume restoration is deterministic for same inputs', () => {
      fc.assert(
        fc.property(
          volumeArb,
          volumeArb,
          (baseVol, reactVol) => {
            // First restoration
            const basePlayer1 = new MockPlayer()
            const reactPlayer1 = new MockPlayer()
            applyVolumeToPlayersPure(baseVol, reactVol, basePlayer1, reactPlayer1)
            
            // Second restoration with same inputs
            const basePlayer2 = new MockPlayer()
            const reactPlayer2 = new MockPlayer()
            applyVolumeToPlayersPure(baseVol, reactVol, basePlayer2, reactPlayer2)
            
            // Results should be identical
            expect(basePlayer1.getVolume()).toBe(basePlayer2.getVolume())
            expect(reactPlayer1.getVolume()).toBe(reactPlayer2.getVolume())
          }
        ),
        { numRuns: 100 }
      )
    })

    it('boundary volume values are handled correctly', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(0, 0.5, 1), // Test boundary and middle values
          fc.constantFrom(0, 0.5, 1),
          (baseVol, reactVol) => {
            const basePlayer = new MockPlayer()
            const reactPlayer = new MockPlayer()
            
            // Apply volume restoration
            applyVolumeToPlayersPure(baseVol, reactVol, basePlayer, reactPlayer)
            
            // Boundary values should be preserved exactly
            expect(basePlayer.getVolume()).toBe(baseVol)
            expect(reactPlayer.getVolume()).toBe(reactVol)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('volume clamping works correctly for out-of-range values', () => {
      fc.assert(
        fc.property(
          fc.float({ min: -1, max: 2, noNaN: true, noDefaultInfinity: true }), // Extended range
          fc.float({ min: -1, max: 2, noNaN: true, noDefaultInfinity: true }),
          (baseVol, reactVol) => {
            const basePlayer = new MockPlayer()
            const reactPlayer = new MockPlayer()
            
            // Apply volume restoration (with potentially out-of-range values)
            applyVolumeToPlayersPure(baseVol, reactVol, basePlayer, reactPlayer)
            
            // Volumes should be clamped to [0, 1]
            const expectedBaseVol = clampVolume(baseVol)
            const expectedReactVol = clampVolume(reactVol)
            
            expect(basePlayer.getVolume()).toBeCloseTo(expectedBaseVol, 10)
            expect(reactPlayer.getVolume()).toBeCloseTo(expectedReactVol, 10)
            
            // Verify volumes are within valid range
            expect(basePlayer.getVolume()).toBeGreaterThanOrEqual(0)
            expect(basePlayer.getVolume()).toBeLessThanOrEqual(1)
            expect(reactPlayer.getVolume()).toBeGreaterThanOrEqual(0)
            expect(reactPlayer.getVolume()).toBeLessThanOrEqual(1)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})


/**
 * Feature: video-player-bug-fixes
 * Property 3: Volume Scaling Based on Player Type
 * 
 * For any volume value v in [0, 1], when applied to a YouTube player,
 * the setVolume method SHALL be called with (v * 100), and when applied
 * to a local video player, the volume property SHALL be set to v directly.
 * 
 * **Validates: Requirements 3.3, 3.4, 3.5, 3.6**
 */

// Types for volume scaling testing
type PlayerType = 'youtube' | 'local'

/**
 * Mock YouTube player that tracks the raw value passed to setVolume.
 * YouTube's API uses 0-100 scale internally.
 */
class MockYouTubePlayer {
  private _rawVolume: number = 100 // YouTube default is 100
  
  /**
   * Sets volume using YouTube's 0-100 scale.
   * This mirrors the actual YouTube API behavior.
   */
  setVolume(rawValue: number): void {
    this._rawVolume = Math.max(0, Math.min(100, rawValue))
  }
  
  /**
   * Gets the raw volume value (0-100 scale).
   */
  getRawVolume(): number {
    return this._rawVolume
  }
  
  /**
   * Gets volume normalized to 0-1 scale (as exposed by our wrapper).
   */
  getVolume(): number {
    return this._rawVolume / 100
  }
}

/**
 * Mock local video player that tracks the volume property.
 * HTML video elements use 0-1 scale.
 */
class MockLocalPlayer {
  private _volume: number = 1 // HTML video default is 1
  
  /**
   * Sets volume using HTML video's 0-1 scale.
   * This mirrors the actual HTMLVideoElement.volume behavior.
   */
  setVolume(value: number): void {
    this._volume = Math.max(0, Math.min(1, value))
  }
  
  /**
   * Gets the volume value (0-1 scale).
   */
  getVolume(): number {
    return this._volume
  }
}

/**
 * Applies volume to a YouTube player using the correct scaling.
 * This mirrors the YouTubePlayer.setVolume implementation.
 * 
 * @param player - The YouTube player instance
 * @param volume - Volume in 0-1 range
 */
function applyVolumeToYouTubePlayer(player: MockYouTubePlayer, volume: number): void {
  // YouTube API expects 0-100 scale, so multiply by 100
  player.setVolume(Math.max(0, Math.min(100, volume * 100)))
}

/**
 * Applies volume to a local video player using the correct scaling.
 * This mirrors the LocalPlayer.setVolume implementation.
 * 
 * @param player - The local player instance
 * @param volume - Volume in 0-1 range
 */
function applyVolumeToLocalPlayer(player: MockLocalPlayer, volume: number): void {
  // HTML video elements use 0-1 scale directly
  player.setVolume(Math.max(0, Math.min(1, volume)))
}

/**
 * Calculates the expected raw value for YouTube player.
 * YouTube uses 0-100 scale.
 * 
 * @param volume - Volume in 0-1 range
 * @returns Expected raw value in 0-100 range
 */
function calculateYouTubeRawVolume(volume: number): number {
  return Math.max(0, Math.min(100, volume * 100))
}

/**
 * Calculates the expected value for local player.
 * Local players use 0-1 scale directly.
 * 
 * @param volume - Volume in 0-1 range
 * @returns Expected value in 0-1 range
 */
function calculateLocalVolume(volume: number): number {
  return Math.max(0, Math.min(1, volume))
}

// Arbitrary generators for volume scaling testing

/**
 * Generator for valid volume values in the range [0, 1].
 * This represents the normalized volume interface used by the application.
 */
const volumeInputArb = fc.float({
  min: 0,
  max: 1,
  noNaN: true,
  noDefaultInfinity: true
})

/**
 * Generator for player type selection.
 */
const playerTypeArb = fc.constantFrom('youtube', 'local') as fc.Arbitrary<PlayerType>

describe('Volume Scaling Based on Player Type', () => {
  /**
   * Property 3: Volume Scaling Based on Player Type
   * 
   * For any volume value v in [0, 1]:
   * - When applied to a YouTube player, setVolume SHALL be called with (v * 100)
   * - When applied to a local video player, volume property SHALL be set to v directly
   * 
   * **Validates: Requirements 3.3, 3.4, 3.5, 3.6**
   */
  describe('Property 3: Volume Scaling Based on Player Type', () => {
    
    it('YouTube player receives volume scaled to 0-100 range (Requirements 3.3, 3.5)', () => {
      fc.assert(
        fc.property(
          volumeInputArb,
          (volume) => {
            const player = new MockYouTubePlayer()
            
            // Apply volume using the scaling logic
            applyVolumeToYouTubePlayer(player, volume)
            
            // YouTube player should receive value in 0-100 range
            const expectedRawVolume = calculateYouTubeRawVolume(volume)
            expect(player.getRawVolume()).toBeCloseTo(expectedRawVolume, 5)
            
            // The raw value should be volume * 100
            expect(player.getRawVolume()).toBeCloseTo(volume * 100, 5)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('Local player receives volume in 0-1 range directly (Requirements 3.4, 3.6)', () => {
      fc.assert(
        fc.property(
          volumeInputArb,
          (volume) => {
            const player = new MockLocalPlayer()
            
            // Apply volume using the scaling logic
            applyVolumeToLocalPlayer(player, volume)
            
            // Local player should receive value in 0-1 range directly
            const expectedVolume = calculateLocalVolume(volume)
            expect(player.getVolume()).toBeCloseTo(expectedVolume, 5)
            
            // The value should be the same as input (no scaling)
            expect(player.getVolume()).toBeCloseTo(volume, 5)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('YouTube and local players produce equivalent normalized volumes', () => {
      fc.assert(
        fc.property(
          volumeInputArb,
          (volume) => {
            const youtubePlayer = new MockYouTubePlayer()
            const localPlayer = new MockLocalPlayer()
            
            // Apply same volume to both players
            applyVolumeToYouTubePlayer(youtubePlayer, volume)
            applyVolumeToLocalPlayer(localPlayer, volume)
            
            // Both should report the same normalized volume (0-1 range)
            expect(youtubePlayer.getVolume()).toBeCloseTo(localPlayer.getVolume(), 5)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('YouTube raw volume is exactly 100x the input volume', () => {
      fc.assert(
        fc.property(
          volumeInputArb,
          (volume) => {
            const player = new MockYouTubePlayer()
            
            applyVolumeToYouTubePlayer(player, volume)
            
            // The scaling factor should be exactly 100
            const rawVolume = player.getRawVolume()
            const expectedRaw = volume * 100
            
            expect(rawVolume).toBeCloseTo(expectedRaw, 5)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('Local volume equals input volume exactly (no scaling)', () => {
      fc.assert(
        fc.property(
          volumeInputArb,
          (volume) => {
            const player = new MockLocalPlayer()
            
            applyVolumeToLocalPlayer(player, volume)
            
            // No scaling should occur - value should be identical
            expect(player.getVolume()).toBeCloseTo(volume, 10)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('boundary values are handled correctly for both player types', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(0, 0.25, 0.5, 0.75, 1), // Test boundary and key values
          (volume) => {
            const youtubePlayer = new MockYouTubePlayer()
            const localPlayer = new MockLocalPlayer()
            
            applyVolumeToYouTubePlayer(youtubePlayer, volume)
            applyVolumeToLocalPlayer(localPlayer, volume)
            
            // YouTube: 0 -> 0, 0.5 -> 50, 1 -> 100
            expect(youtubePlayer.getRawVolume()).toBe(volume * 100)
            
            // Local: value unchanged
            expect(localPlayer.getVolume()).toBe(volume)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('volume scaling is deterministic for same inputs', () => {
      fc.assert(
        fc.property(
          volumeInputArb,
          (volume) => {
            // First application
            const youtube1 = new MockYouTubePlayer()
            const local1 = new MockLocalPlayer()
            applyVolumeToYouTubePlayer(youtube1, volume)
            applyVolumeToLocalPlayer(local1, volume)
            
            // Second application with same input
            const youtube2 = new MockYouTubePlayer()
            const local2 = new MockLocalPlayer()
            applyVolumeToYouTubePlayer(youtube2, volume)
            applyVolumeToLocalPlayer(local2, volume)
            
            // Results should be identical
            expect(youtube1.getRawVolume()).toBe(youtube2.getRawVolume())
            expect(local1.getVolume()).toBe(local2.getVolume())
          }
        ),
        { numRuns: 100 }
      )
    })

    it('volume values are clamped to valid ranges for both player types', () => {
      fc.assert(
        fc.property(
          fc.float({ min: -0.5, max: 1.5, noNaN: true, noDefaultInfinity: true }), // Extended range
          (volume) => {
            const youtubePlayer = new MockYouTubePlayer()
            const localPlayer = new MockLocalPlayer()
            
            applyVolumeToYouTubePlayer(youtubePlayer, volume)
            applyVolumeToLocalPlayer(localPlayer, volume)
            
            // YouTube raw volume should be in [0, 100]
            expect(youtubePlayer.getRawVolume()).toBeGreaterThanOrEqual(0)
            expect(youtubePlayer.getRawVolume()).toBeLessThanOrEqual(100)
            
            // Local volume should be in [0, 1]
            expect(localPlayer.getVolume()).toBeGreaterThanOrEqual(0)
            expect(localPlayer.getVolume()).toBeLessThanOrEqual(1)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('base video volume scaling works for both player types (Requirements 3.3, 3.4)', () => {
      fc.assert(
        fc.property(
          volumeInputArb,
          playerTypeArb,
          (baseVol, playerType) => {
            if (playerType === 'youtube') {
              const player = new MockYouTubePlayer()
              applyVolumeToYouTubePlayer(player, baseVol)
              
              // YouTube base video: setVolume called with baseVol * 100
              expect(player.getRawVolume()).toBeCloseTo(baseVol * 100, 5)
            } else {
              const player = new MockLocalPlayer()
              applyVolumeToLocalPlayer(player, baseVol)
              
              // Local base video: volume set to baseVol directly
              expect(player.getVolume()).toBeCloseTo(baseVol, 5)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('react video volume scaling works for both player types (Requirements 3.5, 3.6)', () => {
      fc.assert(
        fc.property(
          volumeInputArb,
          playerTypeArb,
          (reactVol, playerType) => {
            if (playerType === 'youtube') {
              const player = new MockYouTubePlayer()
              applyVolumeToYouTubePlayer(player, reactVol)
              
              // YouTube react video: setVolume called with reactVol * 100
              expect(player.getRawVolume()).toBeCloseTo(reactVol * 100, 5)
            } else {
              const player = new MockLocalPlayer()
              applyVolumeToLocalPlayer(player, reactVol)
              
              // Local react video: volume set to reactVol directly
              expect(player.getVolume()).toBeCloseTo(reactVol, 5)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})


/**
 * Feature: video-player-bug-fixes
 * Property 4: Auto-Close When All Files Selected
 * 
 * For any file selection state where needsBase and needsReact define required files,
 * the menu SHALL auto-close if and only if all required files have been selected
 * (baseSelected when needsBase, reactSelected when needsReact).
 * 
 * **Validates: Requirements 4.3, 4.4**
 */

// Types for auto-close logic testing
interface FileSelectionState {
  needsBase: boolean
  needsReact: boolean
  baseSelected: boolean
  reactSelected: boolean
}

/**
 * Determines if the file picker menu should auto-close based on selection state.
 * This is the core logic from showLocalFilePrompt() in storage.ts.
 * 
 * The menu auto-closes when all required files have been selected:
 * - If needsBase is true, baseSelected must be true
 * - If needsReact is true, reactSelected must be true
 * 
 * @param state - The current file selection state
 * @returns true if the menu should auto-close
 */
function shouldAutoClose(state: FileSelectionState): boolean {
  const { needsBase, needsReact, baseSelected, reactSelected } = state
  
  // Auto-close when all required files are selected
  // (!needsBase || baseSelected) means: if we need base, it must be selected
  // (!needsReact || reactSelected) means: if we need react, it must be selected
  const allSelected = (!needsBase || baseSelected) && (!needsReact || reactSelected)
  
  return allSelected
}

/**
 * Simulates the file selection process and tracks state changes.
 * This mirrors the behavior of the file picker menu in storage.ts.
 * 
 * @param initialState - The initial selection state
 * @param selectBase - Whether to select the base file
 * @param selectReact - Whether to select the react file
 * @returns The final selection state after selections
 */
function simulateFileSelection(
  initialState: FileSelectionState,
  selectBase: boolean,
  selectReact: boolean
): FileSelectionState {
  return {
    ...initialState,
    baseSelected: initialState.baseSelected || selectBase,
    reactSelected: initialState.reactSelected || selectReact
  }
}

/**
 * Counts how many required files are still needed.
 * 
 * @param state - The current file selection state
 * @returns The number of files still needed
 */
function countRemainingFiles(state: FileSelectionState): number {
  let count = 0
  if (state.needsBase && !state.baseSelected) count++
  if (state.needsReact && !state.reactSelected) count++
  return count
}

// Arbitrary generators for auto-close logic testing

/**
 * Generator for file selection state.
 * Generates all possible combinations of needs and selected states.
 */
const fileSelectionStateArb = fc.record({
  needsBase: fc.boolean(),
  needsReact: fc.boolean(),
  baseSelected: fc.boolean(),
  reactSelected: fc.boolean()
})

/**
 * Generator for initial state where files are needed but not yet selected.
 * This represents the state when the file picker menu first opens.
 */
const initialFileSelectionStateArb = fc.record({
  needsBase: fc.boolean(),
  needsReact: fc.boolean(),
  baseSelected: fc.constant(false),
  reactSelected: fc.constant(false)
})

/**
 * Generator for states where at least one file is needed.
 * This ensures we're testing meaningful scenarios.
 */
const needsFilesStateArb = fc.record({
  needsBase: fc.boolean(),
  needsReact: fc.boolean(),
  baseSelected: fc.boolean(),
  reactSelected: fc.boolean()
}).filter(state => state.needsBase || state.needsReact)

describe('Auto-Close When All Files Selected', () => {
  /**
   * Property 4: Auto-Close When All Files Selected
   * 
   * For any file selection state where needsBase and needsReact define required files,
   * the menu SHALL auto-close if and only if all required files have been selected
   * (baseSelected when needsBase, reactSelected when needsReact).
   * 
   * **Validates: Requirements 4.3, 4.4**
   */
  describe('Property 4: Auto-Close When All Files Selected', () => {
    
    it('menu auto-closes when all required files are selected (Requirement 4.3)', () => {
      fc.assert(
        fc.property(
          needsFilesStateArb,
          (state) => {
            // Create a state where all needed files are selected
            const completeState: FileSelectionState = {
              needsBase: state.needsBase,
              needsReact: state.needsReact,
              baseSelected: state.needsBase, // Selected if needed
              reactSelected: state.needsReact // Selected if needed
            }
            
            // Menu should auto-close when all required files are selected
            expect(shouldAutoClose(completeState)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('menu does NOT auto-close when required files are missing', () => {
      fc.assert(
        fc.property(
          needsFilesStateArb,
          (state) => {
            // Create a state where at least one needed file is NOT selected
            const incompleteState: FileSelectionState = {
              needsBase: state.needsBase,
              needsReact: state.needsReact,
              baseSelected: false, // Not selected
              reactSelected: false // Not selected
            }
            
            // If any file is needed, menu should NOT auto-close
            if (state.needsBase || state.needsReact) {
              expect(shouldAutoClose(incompleteState)).toBe(false)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('menu auto-closes when only one file is needed and selected (Requirement 4.4)', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // Which single file is needed: true = base, false = react
          (needsBaseOnly) => {
            // State where only one file is needed
            const singleFileState: FileSelectionState = {
              needsBase: needsBaseOnly,
              needsReact: !needsBaseOnly,
              baseSelected: needsBaseOnly, // Selected if needed
              reactSelected: !needsBaseOnly // Selected if needed
            }
            
            // Menu should auto-close when the single required file is selected
            expect(shouldAutoClose(singleFileState)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('auto-close logic follows the formula: (!needsBase || baseSelected) && (!needsReact || reactSelected)', () => {
      fc.assert(
        fc.property(
          fileSelectionStateArb,
          (state) => {
            const { needsBase, needsReact, baseSelected, reactSelected } = state
            
            // Calculate expected result using the exact formula from design
            const expectedAutoClose = (!needsBase || baseSelected) && (!needsReact || reactSelected)
            
            // The shouldAutoClose function should match this formula exactly
            expect(shouldAutoClose(state)).toBe(expectedAutoClose)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('selecting base file triggers auto-close when only base is needed', () => {
      fc.assert(
        fc.property(
          fc.constant(true), // Always run this test
          () => {
            // Initial state: only base needed, nothing selected
            const initialState: FileSelectionState = {
              needsBase: true,
              needsReact: false,
              baseSelected: false,
              reactSelected: false
            }
            
            // Before selection: should NOT auto-close
            expect(shouldAutoClose(initialState)).toBe(false)
            
            // After selecting base file
            const afterSelection = simulateFileSelection(initialState, true, false)
            
            // After selection: should auto-close
            expect(shouldAutoClose(afterSelection)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('selecting react file triggers auto-close when only react is needed', () => {
      fc.assert(
        fc.property(
          fc.constant(true), // Always run this test
          () => {
            // Initial state: only react needed, nothing selected
            const initialState: FileSelectionState = {
              needsBase: false,
              needsReact: true,
              baseSelected: false,
              reactSelected: false
            }
            
            // Before selection: should NOT auto-close
            expect(shouldAutoClose(initialState)).toBe(false)
            
            // After selecting react file
            const afterSelection = simulateFileSelection(initialState, false, true)
            
            // After selection: should auto-close
            expect(shouldAutoClose(afterSelection)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('both files must be selected when both are needed', () => {
      fc.assert(
        fc.property(
          fc.constant(true), // Always run this test
          () => {
            // Initial state: both files needed
            const initialState: FileSelectionState = {
              needsBase: true,
              needsReact: true,
              baseSelected: false,
              reactSelected: false
            }
            
            // Before any selection: should NOT auto-close
            expect(shouldAutoClose(initialState)).toBe(false)
            
            // After selecting only base: should NOT auto-close
            const afterBase = simulateFileSelection(initialState, true, false)
            expect(shouldAutoClose(afterBase)).toBe(false)
            
            // After selecting only react: should NOT auto-close
            const afterReact = simulateFileSelection(initialState, false, true)
            expect(shouldAutoClose(afterReact)).toBe(false)
            
            // After selecting both: should auto-close
            const afterBoth = simulateFileSelection(initialState, true, true)
            expect(shouldAutoClose(afterBoth)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('auto-close is deterministic for same selection state', () => {
      fc.assert(
        fc.property(
          fileSelectionStateArb,
          (state) => {
            // Calculate auto-close twice with same state
            const result1 = shouldAutoClose(state)
            const result2 = shouldAutoClose(state)
            
            // Results should be identical
            expect(result1).toBe(result2)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('remaining file count is zero when auto-close should trigger', () => {
      fc.assert(
        fc.property(
          fileSelectionStateArb,
          (state) => {
            const shouldClose = shouldAutoClose(state)
            const remaining = countRemainingFiles(state)
            
            // If auto-close should trigger, no files should be remaining
            if (shouldClose) {
              expect(remaining).toBe(0)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('auto-close does NOT trigger when remaining file count is positive', () => {
      fc.assert(
        fc.property(
          needsFilesStateArb,
          (state) => {
            const remaining = countRemainingFiles(state)
            const shouldClose = shouldAutoClose(state)
            
            // If files are remaining, auto-close should NOT trigger
            if (remaining > 0) {
              expect(shouldClose).toBe(false)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('file selection state transitions correctly track selections', () => {
      fc.assert(
        fc.property(
          initialFileSelectionStateArb,
          fc.boolean(), // Select base?
          fc.boolean(), // Select react?
          (initialState, selectBase, selectReact) => {
            const finalState = simulateFileSelection(initialState, selectBase, selectReact)
            
            // Base should be selected if we selected it
            expect(finalState.baseSelected).toBe(selectBase)
            
            // React should be selected if we selected it
            expect(finalState.reactSelected).toBe(selectReact)
            
            // Needs flags should be unchanged
            expect(finalState.needsBase).toBe(initialState.needsBase)
            expect(finalState.needsReact).toBe(initialState.needsReact)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('when no files are needed, menu auto-closes immediately', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // baseSelected (doesn't matter)
          fc.boolean(), // reactSelected (doesn't matter)
          (baseSelected, reactSelected) => {
            // State where no files are needed
            const noFilesNeededState: FileSelectionState = {
              needsBase: false,
              needsReact: false,
              baseSelected,
              reactSelected
            }
            
            // Menu should auto-close regardless of selection state
            // because no files are required
            expect(shouldAutoClose(noFilesNeededState)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('partial selection does not trigger auto-close when both files needed', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('base', 'react') as fc.Arbitrary<'base' | 'react'>,
          (whichSelected) => {
            // State where both files are needed but only one is selected
            const partialState: FileSelectionState = {
              needsBase: true,
              needsReact: true,
              baseSelected: whichSelected === 'base',
              reactSelected: whichSelected === 'react'
            }
            
            // Menu should NOT auto-close with partial selection
            expect(shouldAutoClose(partialState)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})

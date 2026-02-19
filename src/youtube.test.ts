import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { YouTubePlayer } from './youtube.ts'

declare namespace YT {
  interface Player {}
}

type MockPlayerEvents = {
  onReady?: (event: { target: YT.Player }) => void
  onStateChange?: (event: { target: YT.Player; data: number }) => void
  onError?: (event: { target: YT.Player; data: number }) => void
}

type MockPlayerOptions = {
  videoId: string
  events?: MockPlayerEvents
}

type MockPlayerInstance = {
  options: MockPlayerOptions
  pauseVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  getCurrentTime: () => number
  getDuration: () => number
  getPlayerState: () => number
  setVolume: (volume: number) => void
  getVolume: () => number
  setPlaybackRate: (rate: number) => void
  getAvailableQualityLevels: () => string[]
  getPlaybackQuality: () => string
  setPlaybackQuality: (quality: string) => void
  getIframe: () => HTMLIFrameElement
  destroy: () => void
  getVideoData: () => { video_id: string }
}

describe('YouTubePlayer lifecycle guards', () => {
  const originalWindow = (globalThis as Record<string, unknown>).window
  const originalDocument = (globalThis as Record<string, unknown>).document

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    ;(globalThis as Record<string, unknown>).window = originalWindow
    ;(globalThis as Record<string, unknown>).document = originalDocument
  })

  function setupEnvironment(
    onCreate: (instance: MockPlayerInstance) => void
  ): { instances: MockPlayerInstance[]; replaceChildrenSpy: ReturnType<typeof vi.fn> } {
    const instances: MockPlayerInstance[] = []
    const replaceChildrenSpy = vi.fn()

    class MockPlayer {
      public options: MockPlayerOptions

      constructor(_: string, options: MockPlayerOptions) {
        this.options = options
        instances.push(this as unknown as MockPlayerInstance)
        onCreate(this as unknown as MockPlayerInstance)
      }

      pauseVideo = vi.fn()
      seekTo = vi.fn()
      getCurrentTime = vi.fn(() => 0)
      getDuration = vi.fn(() => 120)
      getPlayerState = vi.fn(() => 2)
      setVolume = vi.fn()
      getVolume = vi.fn(() => 100)
      setPlaybackRate = vi.fn()
      getAvailableQualityLevels = vi.fn(() => [])
      getPlaybackQuality = vi.fn(() => 'auto')
      setPlaybackQuality = vi.fn()
      getIframe = vi.fn(() => ({ style: {} } as unknown as HTMLIFrameElement))
      destroy = vi.fn()
      getVideoData = vi.fn(() => ({ video_id: this.options.videoId }))
    }

    ;(globalThis as Record<string, unknown>).window = {
      location: { origin: 'https://example.test' },
      YT: {
        Player: MockPlayer,
        PlayerState: {
          UNSTARTED: -1,
          ENDED: 0,
          PLAYING: 1,
          PAUSED: 2,
          BUFFERING: 3,
          CUED: 5
        }
      }
    }

    ;(globalThis as Record<string, unknown>).document = {
      getElementById: vi.fn(() => ({ replaceChildren: replaceChildrenSpy })),
      querySelectorAll: vi.fn(() => [])
    }

    return { instances, replaceChildrenSpy }
  }

  it('cancels pending retry timers when destroyed after an error', async () => {
    const { instances } = setupEnvironment((instance) => {
      setTimeout(() => {
        instance.options.events?.onError?.({ target: instance as unknown as YT.Player, data: 5 })
      }, 0)
    })

    const player = new YouTubePlayer('videoBaseYoutube')
    const initPromise = player.initialize('dQw4w9WgXcQ')

    await Promise.resolve()
    vi.advanceTimersByTime(0)
    player.destroy()

    await expect(initPromise).rejects.toThrow('Player destroyed during initialization')
    vi.advanceTimersByTime(10000)

    expect(instances).toHaveLength(1)
  })

  it('ignores stale callbacks from older initialize calls', async () => {
    const { instances, replaceChildrenSpy } = setupEnvironment(() => {})
    const player = new YouTubePlayer('videoBaseYoutube')

    const firstInit = player.initialize('aaaaaaaaaaa')
    const firstInitHandled = firstInit.catch(err => err as Error)
    const secondInit = player.initialize('bbbbbbbbbbb')
    await Promise.resolve()
    await Promise.resolve()

    expect(instances).toHaveLength(2)

    const first = instances[0]!
    const second = instances[1]!
    first.options.events?.onReady?.({ target: first as unknown as YT.Player })
    await Promise.resolve()

    let resolved = false
    secondInit.then(() => { resolved = true })
    await Promise.resolve()
    expect(resolved).toBe(false)

    second.options.events?.onReady?.({ target: second as unknown as YT.Player })

    await expect(firstInitHandled).resolves.toBeInstanceOf(Error)
    await expect(secondInit).resolves.toBeUndefined()
    expect(replaceChildrenSpy).toHaveBeenCalled()
  })
})

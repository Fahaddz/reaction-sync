import type Hls from 'hls.js'

export type PlayState = 'playing' | 'paused' | 'buffering' | 'ended'

export interface Player {
  play(): void
  pause(): void
  seek(time: number): void
  getCurrentTime(): number
  getDuration(): number
  isPlaying(): boolean
  getVolume(): number
  setVolume(v: number): void
  setPlaybackRate(rate: number): void
  getPlaybackRate(): number
  getAvailablePlaybackRates?(): number[]
  onStateChange(cb: (state: PlayState) => void): void
  getElement(): HTMLElement | null
  destroy(): void
}

export class LocalPlayer implements Player {
  private video: HTMLVideoElement
  private hls: Hls | null = null
  private stateCallback: ((state: PlayState) => void) | null = null
  private handlePlay: () => void
  private handlePause: () => void
  private handleWaiting: () => void
  private handleEnded: () => void

  constructor(video: HTMLVideoElement) {
    this.video = video
    this.handlePlay = () => this.stateCallback?.('playing')
    this.handlePause = () => this.stateCallback?.('paused')
    this.handleWaiting = () => this.stateCallback?.('buffering')
    this.handleEnded = () => this.stateCallback?.('ended')
    this.video.addEventListener('play', this.handlePlay)
    this.video.addEventListener('pause', this.handlePause)
    this.video.addEventListener('waiting', this.handleWaiting)
    this.video.addEventListener('ended', this.handleEnded)
  }

  play(): void {
    this.video.play().catch(() => {})
  }

  pause(): void {
    this.video.pause()
  }

  seek(time: number): void {
    this.video.currentTime = Math.max(0, Math.min(time, this.getDuration() || time))
  }

  getCurrentTime(): number {
    return this.video.currentTime || 0
  }

  getDuration(): number {
    const d = this.video.duration
    return isFinite(d) ? d : 0
  }

  isPlaying(): boolean {
    return !this.video.paused && !this.video.ended
  }

  getVolume(): number {
    return this.video.volume
  }

  setVolume(v: number): void {
    this.video.volume = Math.max(0, Math.min(1, v))
  }

  setPlaybackRate(rate: number): void {
    this.video.playbackRate = rate
  }

  getPlaybackRate(): number {
    return this.video.playbackRate
  }

  onStateChange(cb: (state: PlayState) => void): void {
    this.stateCallback = cb
  }

  getElement(): HTMLVideoElement {
    return this.video
  }

  destroy(): void {
    this.video.removeEventListener('play', this.handlePlay)
    this.video.removeEventListener('pause', this.handlePause)
    this.video.removeEventListener('waiting', this.handleWaiting)
    this.video.removeEventListener('ended', this.handleEnded)
    this.destroySource()
    this.video.removeAttribute('src')
    this.video.load()
    this.stateCallback = null
  }

  private destroySource(): void {
    if (this.hls) {
      this.hls.destroy()
      this.hls = null
    }
    this.video.src = ''
  }

  loadFile(file: File): void {
    this.destroySource()
    this.video.src = URL.createObjectURL(file)
    this.video.load()
  }

  async loadUrl(url: string): Promise<void> {
    this.destroySource()
    if (isHlsUrl(url)) {
      if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
        this.video.src = url
        this.video.load()
        return
      }

      const HlsCtor = await getHlsConstructor()
      if (HlsCtor?.isSupported()) {
        const hls = new HlsCtor()
        hls.loadSource(url)
        hls.attachMedia(this.video)
        hls.on(HlsCtor.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            hls.destroy()
            this.hls = null
          }
        })
        this.hls = hls
        return
      }
    }

    this.video.src = url
    this.video.load()
  }

  attachSubtitles(vttContent: string): void {
    const existing = this.video.querySelector('track')
    if (existing) existing.remove()
    const track = document.createElement('track')
    track.kind = 'captions'
    track.srclang = 'en'
    track.label = 'English'
    track.default = true
    track.src = `data:text/vtt;base64,${btoa(unescape(encodeURIComponent(vttContent)))}`
    this.video.appendChild(track)
  }
}

export function createLocalPlayer(video: HTMLVideoElement): LocalPlayer {
  return new LocalPlayer(video)
}

function isHlsUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.href)
    return parsed.pathname.endsWith('.m3u8')
  } catch {
    return url.includes('.m3u8')
  }
}

type HlsConstructor = typeof import('hls.js').default

let hlsConstructorPromise: Promise<HlsConstructor | null> | null = null

async function getHlsConstructor(): Promise<HlsConstructor | null> {
  if (!hlsConstructorPromise) {
    hlsConstructorPromise = import('hls.js')
      .then((module) => module.default)
      .catch(() => null)
  }
  return hlsConstructorPromise
}

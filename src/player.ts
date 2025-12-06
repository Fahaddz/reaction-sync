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
  onStateChange(cb: (state: PlayState) => void): void
  getElement(): HTMLElement | null
  destroy(): void
}

export class LocalPlayer implements Player {
  private video: HTMLVideoElement
  private stateCallback: ((state: PlayState) => void) | null = null

  constructor(video: HTMLVideoElement) {
    this.video = video
    this.video.addEventListener('play', () => this.stateCallback?.('playing'))
    this.video.addEventListener('pause', () => this.stateCallback?.('paused'))
    this.video.addEventListener('waiting', () => this.stateCallback?.('buffering'))
    this.video.addEventListener('ended', () => this.stateCallback?.('ended'))
  }

  play(): void {
    this.video.play().catch(() => {})
  }

  pause(): void {
    this.video.pause()
  }

  seek(time: number): void {
    const t = Math.max(0, Math.min(time, this.getDuration() || time))
    if (typeof this.video.fastSeek === 'function') {
      this.video.fastSeek(t)
    } else {
      this.video.currentTime = t
    }
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

  onStateChange(cb: (state: PlayState) => void): void {
    this.stateCallback = cb
  }

  getElement(): HTMLVideoElement {
    return this.video
  }

  destroy(): void {
    this.video.src = ''
    this.video.load()
    this.stateCallback = null
  }

  loadFile(file: File): void {
    this.video.src = URL.createObjectURL(file)
    this.video.load()
  }

  loadUrl(url: string): void {
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


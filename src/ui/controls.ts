import { get } from '../state.ts'
import { formatPlaybackSpeed, formatTime, formatTimeWithDecimal, throttle } from '../utils.ts'
import {
  syncSeek, syncPlay, syncPause, enableSync, disableSync, forceResync,
  isBasePlaying, isReactPlaying, getBaseCurrentTime, getBaseDuration,
  getReactCurrentTime, getReactDuration, setBaseVolume, setReactVolume,
  setPlaybackSpeed, MIN_PLAYBACK_SPEED, MAX_PLAYBACK_SPEED, PLAYBACK_SPEED_INCREMENT
} from '../sync.ts'
import { showToast } from './toast.ts'

const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null

export function initControlBindings(): void {
  $('basePlayPause')?.addEventListener('click', () => {
    isBasePlaying() ? syncPause(true) : syncPlay(true)
  })
  $('reactPlayPause')?.addEventListener('click', () => {
    isReactPlaying() ? syncPause(false) : syncPlay(false)
  })
  // Local video click handlers
  $('videoBaseLocal')?.addEventListener('click', () => {
    isBasePlaying() ? syncPause(true) : syncPlay(true)
  })
  $('videoReact')?.addEventListener('click', () => {
    isReactPlaying() ? syncPause(false) : syncPlay(false)
  })
}

export function initSyncButtons(): void {
  $('syncButton')?.addEventListener('click', () => {
    enableSync()
    showToast('Videos synced', 'info', 2000)
  })
  $('desyncButton')?.addEventListener('click', () => {
    disableSync()
    showToast('Sync disabled', 'info', 2000)
  })
  $('forceResyncButton')?.addEventListener('click', () => {
    forceResync()
    showToast('Force re-synced', 'info', 2000)
  })
  $('saveNowButton')?.addEventListener('click', () => {
    const event = new CustomEvent('saveNow')
    document.dispatchEvent(event)
    showToast('Progress saved', 'info', 2000)
  })
}

export function initVolumeSliders(): void {
  const baseVol = $<HTMLInputElement>('baseVolumeSlider')
  const reactVol = $<HTMLInputElement>('reactVolumeSlider')
  baseVol?.addEventListener('input', () => setBaseVolume(parseFloat(baseVol.value)))
  reactVol?.addEventListener('input', () => setReactVolume(parseFloat(reactVol.value)))
}

export function initPlaybackSpeedControl(): void {
  const speedSlider = $<HTMLInputElement>('playbackSpeedSlider')
  if (!speedSlider) return
  speedSlider.min = String(MIN_PLAYBACK_SPEED)
  speedSlider.max = String(MAX_PLAYBACK_SPEED)
  speedSlider.step = String(PLAYBACK_SPEED_INCREMENT)
  speedSlider.value = String(get().playbackSpeed)

  const applySpeed = (showFeedback: boolean) => {
    const requested = parseFloat(speedSlider.value)
    const result = setPlaybackSpeed(requested)
    speedSlider.value = String(result.applied)
    if (showFeedback && result.constrained) {
      showToast(`Speed adjusted to supported value: ${formatPlaybackSpeed(result.applied)}`, 'warning', 2500)
    }
  }

  speedSlider.addEventListener('input', throttle(() => applySpeed(false), 50))
  speedSlider.addEventListener('change', () => applySpeed(true))
}

export function initSeekBars(): void {
  const baseSeek = $<HTMLInputElement>('baseSeekBar')
  const reactSeek = $<HTMLInputElement>('reactSeekBar')

  if (baseSeek) {
    const onBaseSeek = throttle(() => {
      const pct = parseFloat(baseSeek.value)
      const dur = getBaseDuration()
      if (dur > 0) syncSeek(true, (pct / 100) * dur)
    }, 50)
    baseSeek.addEventListener('input', onBaseSeek)
  }

  if (reactSeek) {
    const onReactSeek = throttle(() => {
      const pct = parseFloat(reactSeek.value)
      const dur = getReactDuration()
      if (dur > 0) syncSeek(false, (pct / 100) * dur)
    }, 50)
    reactSeek.addEventListener('input', onReactSeek)
  }
}

export function updateTimeDisplays(): void {
  const baseTime = $('baseTimeDisplay')
  const reactTime = $('reactTimeDisplay')
  const baseSeek = $<HTMLInputElement>('baseSeekBar')
  const reactSeek = $<HTMLInputElement>('reactSeekBar')

  const bc = getBaseCurrentTime()
  const bd = getBaseDuration()
  const rc = getReactCurrentTime()
  const rd = getReactDuration()

  if (baseTime) baseTime.textContent = `${formatTime(bc)} / ${formatTime(bd)}`
  if (reactTime) reactTime.textContent = `${formatTime(rc)} / ${formatTime(rd)}`
  if (baseSeek && bd > 0) baseSeek.value = String((bc / bd) * 100)
  if (reactSeek && rd > 0) reactSeek.value = String((rc / rd) * 100)

  const basePP = $('basePlayPause')
  const reactPP = $('reactPlayPause')
  if (basePP) basePP.textContent = isBasePlaying() ? '⏸' : '▶'
  if (reactPP) reactPP.textContent = isReactPlaying() ? '⏸' : '⏵'
}

export function updateUIFromState(): void {
  const { delay, synced, syncHealth } = get()

  const delayEl = $('delayDisplay')
  if (delayEl) {
    delayEl.textContent = formatTimeWithDecimal(delay)
    delayEl.classList.toggle('synced', synced)
  }

  const syncBtn = $('syncButton')
  syncBtn?.classList.toggle('synced', synced)

  const reactContainer = $('videoReactContainer')
  reactContainer?.classList.toggle('synced', synced)

  const healthDot = $('syncHealthDot')
  if (healthDot) {
    healthDot.className = syncHealth || ''
  }

  const baseVol = $<HTMLInputElement>('baseVolumeSlider')
  const reactVol = $<HTMLInputElement>('reactVolumeSlider')
  const speedSlider = $<HTMLInputElement>('playbackSpeedSlider')
  const speedDisplay = $('playbackSpeedDisplay')
  if (baseVol) baseVol.value = String(get().baseVolume)
  if (reactVol) reactVol.value = String(get().reactVolume)
  if (speedSlider) speedSlider.value = String(get().playbackSpeed)
  if (speedDisplay) speedDisplay.textContent = formatPlaybackSpeed(get().playbackSpeed)
}

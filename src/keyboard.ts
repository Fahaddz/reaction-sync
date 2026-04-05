import { get } from './state.ts'
import {
  enableSync, disableSync, forceResync, syncPlay, syncPause, syncSeek, adjustDelay, setDelay,
  getBaseCurrentTime, getReactCurrentTime, setBaseVolume, setReactVolume,
  isBasePlaying, isReactPlaying, adjustPlaybackSpeed, setPlaybackSpeed
} from './sync.ts'
import { clamp, formatPlaybackSpeed } from './utils.ts'
import { showToast } from './ui/toast.ts'

const MICRO_ADJUST_STEP = 0.033

let delayHoldStart = 0
let delayHoldDir = 0
let delayHoldFrame: number | null = null

export function initKeyboardShortcuts(): void {
  document.addEventListener('keydown', handleKeyDown, true)
}

function handleKeyDown(e: KeyboardEvent): void {
  if (isTypingIntoInput()) return

  const key = e.key.toLowerCase()
  if (handleSyncModeShortcut(key, e)) return
  if (handlePlayPauseShortcut(key, e)) return
  if (handleSeekShortcut(key, e)) return
  if (handleVolumeShortcut(key, e)) return
  if (handleDelayShortcut(key, e)) return
  handlePlaybackSpeedShortcut(key, e)
}

function isTypingIntoInput(): boolean {
  const active = document.activeElement
  return active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.tagName === 'SELECT'
}

function handleSyncModeShortcut(key: string, e: KeyboardEvent): boolean {
  if (key === 's') {
    e.preventDefault()
    enableSync()
    return true
  }

  if (key === 'd') {
    e.preventDefault()
    disableSync()
    return true
  }

  if (key === 'f') {
    e.preventDefault()
    forceResync()
    return true
  }

  return false
}

function handlePlayPauseShortcut(key: string, e: KeyboardEvent): boolean {
  if (key !== ' ' && key !== 'k') return false

  e.preventDefault()
  const focusedBase = isFocusedOnBase()
  const { synced } = get()
  const targetBase = focusedBase

  if (synced) {
    isBasePlaying() ? syncPause(targetBase) : syncPlay(targetBase)
    return true
  }

  const playing = targetBase ? isBasePlaying() : isReactPlaying()
  playing ? syncPause(targetBase) : syncPlay(targetBase)
  return true
}

function handleSeekShortcut(key: string, e: KeyboardEvent): boolean {
  if (key !== 'arrowleft' && key !== 'arrowright') return false

  e.preventDefault()
  const amount = key === 'arrowleft' ? -5 : 5
  const { synced } = get()
  const targetBase = synced || e.shiftKey || isFocusedOnBase()
  const currentTime = targetBase ? getBaseCurrentTime() : getReactCurrentTime()
  syncSeek(targetBase, currentTime + amount)
  return true
}

function handleVolumeShortcut(key: string, e: KeyboardEvent): boolean {
  if (key !== 'arrowup' && key !== 'arrowdown') return false

  e.preventDefault()
  const delta = key === 'arrowup' ? 0.1 : -0.1
  const { baseVolume, reactVolume } = get()

  if (e.shiftKey) {
    setBaseVolume(clamp(baseVolume + delta, 0, 1))
  } else {
    setReactVolume(clamp(reactVolume + delta, 0, 1))
  }

  return true
}

function handleDelayShortcut(key: string, e: KeyboardEvent): boolean {
  const { synced, delay } = get()

  if (key === 'pageup' || key === 'pagedown') {
    e.preventDefault()
    if (synced) {
      adjustDelay(key === 'pageup' ? -1 : 1, 0)
    }
    return true
  }

  if (key !== ',' && key !== '.') return false

  e.preventDefault()
  if (synced) {
    const step = key === ',' ? -MICRO_ADJUST_STEP : MICRO_ADJUST_STEP
    setDelay(delay + step, true)
  }
  return true
}

function handlePlaybackSpeedShortcut(key: string, e: KeyboardEvent): boolean {
  if (key === '[' || key === ']') {
    e.preventDefault()
    const result = adjustPlaybackSpeed(key === '[' ? -1 : 1)
    showToast(`Speed ${formatPlaybackSpeed(result.applied)}`, 'info', 1200)
    return true
  }

  if (key !== '\\') return false

  e.preventDefault()
  const result = setPlaybackSpeed(1.0)
  showToast(`Speed ${formatPlaybackSpeed(result.applied)}`, 'info', 1200)
  return true
}

function isFocusedOnBase(): boolean {
  const baseContainer = document.getElementById('videoBaseContainer')
  const reactContainer = document.getElementById('videoReactContainer')
  if (!baseContainer || !reactContainer) return true
  const baseLast = parseInt(baseContainer.dataset.lastInteracted || '0', 10)
  const reactLast = parseInt(reactContainer.dataset.lastInteracted || '0', 10)
  return baseLast >= reactLast
}

export function trackContainerFocus(): void {
  const base = document.getElementById('videoBaseContainer')
  const react = document.getElementById('videoReactContainer')
  base?.addEventListener('pointerenter', () => {
    base.dataset.lastInteracted = String(Date.now())
  })
  react?.addEventListener('pointerenter', () => {
    react.dataset.lastInteracted = String(Date.now())
  })
}

export function initDelayHold(
  decreaseBtn: HTMLElement,
  increaseBtn: HTMLElement
): void {
  function startHold(dir: number) {
    if (delayHoldDir === dir) return
    stopHold()
    delayHoldDir = dir
    delayHoldStart = performance.now()
    adjustDelay(dir, 0)
    tick()
  }

  function tick() {
    if (!delayHoldDir) return
    const elapsed = performance.now() - delayHoldStart
    if (elapsed >= 80) {
      adjustDelay(delayHoldDir, elapsed)
    }
    delayHoldFrame = requestAnimationFrame(tick)
  }

  function stopHold() {
    delayHoldDir = 0
    if (delayHoldFrame) {
      cancelAnimationFrame(delayHoldFrame)
      delayHoldFrame = null
    }
  }

  decreaseBtn.addEventListener('pointerdown', () => startHold(-1))
  decreaseBtn.addEventListener('pointerup', stopHold)
  decreaseBtn.addEventListener('pointerleave', stopHold)

  increaseBtn.addEventListener('pointerdown', () => startHold(1))
  increaseBtn.addEventListener('pointerup', stopHold)
  increaseBtn.addEventListener('pointerleave', stopHold)

  document.addEventListener('pointerup', stopHold)
}

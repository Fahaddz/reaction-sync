import { get } from './state.ts'
import {
  enableSync, disableSync, forceResync, syncPlay, syncPause, syncSeek, adjustDelay,
  getBaseCurrentTime, getReactCurrentTime, setBaseVolume, setReactVolume,
  isBasePlaying, isReactPlaying
} from './sync.ts'
import { clamp } from './utils.ts'

let delayHoldStart = 0
let delayHoldDir = 0
let delayHoldFrame: number | null = null

export function initKeyboardShortcuts(): void {
  document.addEventListener('keydown', handleKeyDown, true)
}

function handleKeyDown(e: KeyboardEvent): void {
  const active = document.activeElement
  const isInput = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA'
  if (isInput) return

  const key = e.key.toLowerCase()
  const { synced } = get()

  if (key === 's') {
    e.preventDefault()
    enableSync()
    return
  }

  if (key === 'd') {
    e.preventDefault()
    disableSync()
    return
  }

  if (key === 'f') {
    e.preventDefault()
    forceResync()
    return
  }

  if (key === ' ' || key === 'k') {
    e.preventDefault()
    const focusedBase = isFocusedOnBase()
    if (synced) {
      isBasePlaying() ? syncPause(focusedBase) : syncPlay(focusedBase)
    } else {
      if (focusedBase) {
        isBasePlaying() ? syncPause(true) : syncPlay(true)
      } else {
        isReactPlaying() ? syncPause(false) : syncPlay(false)
      }
    }
    return
  }

  if (key === 'arrowleft' || key === 'arrowright') {
    e.preventDefault()
    const amount = key === 'arrowleft' ? -5 : 5
    const focusedBase = isFocusedOnBase()
    const targetBase = e.shiftKey || focusedBase
    if (synced) {
      if (targetBase) {
        syncSeek(true, getBaseCurrentTime() + amount)
      } else {
        syncSeek(false, getReactCurrentTime() + amount)
      }
    } else {
      if (targetBase) {
        syncSeek(true, getBaseCurrentTime() + amount)
      } else {
        syncSeek(false, getReactCurrentTime() + amount)
      }
    }
    return
  }

  if (key === 'arrowup' || key === 'arrowdown') {
    e.preventDefault()
    const delta = key === 'arrowup' ? 0.1 : -0.1
    const targetBase = e.shiftKey
    const { baseVolume, reactVolume } = get()
    if (targetBase) {
      setBaseVolume(clamp(baseVolume + delta, 0, 1))
    } else {
      setReactVolume(clamp(reactVolume + delta, 0, 1))
    }
    return
  }

  if (key === 'pageup' || key === 'pagedown') {
    e.preventDefault()
    if (synced) {
      adjustDelay(key === 'pageup' ? -1 : 1, 0)
    }
    return
  }
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

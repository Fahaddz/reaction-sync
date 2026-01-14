import { get } from 'svelte/store'
import { synced, delay, baseVolume, reactVolume, debugVisible } from './stores.ts'
import {
  enableSync, disableSync, forceResync, syncPlay, syncPause, syncSeek, adjustDelay, setDelay,
  getBaseCurrentTime, getReactCurrentTime, setBaseVolume, setReactVolume,
  isBasePlaying, isReactPlaying
} from './sync.ts'
import { clamp } from './utils.ts'

const MICRO_ADJUST_STEP = 0.033

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
  const isSynced = get(synced)
  const currentDelay = get(delay)

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

  if (key === 'g') {
    e.preventDefault()
    debugVisible.update(v => !v)
    return
  }

  if (key === ' ' || key === 'k') {
    e.preventDefault()
    const focusedBase = isFocusedOnBase()
    if (isSynced) {
      isBasePlaying() ? syncPause(focusedBase) : syncPlay(focusedBase)
    } else {
      const targetBase = focusedBase
      const playing = targetBase ? isBasePlaying() : isReactPlaying()
      playing ? syncPause(targetBase) : syncPlay(targetBase)
    }
    return
  }

  if (key === 'arrowleft' || key === 'arrowright') {
    e.preventDefault()
    const amount = key === 'arrowleft' ? -5 : 5
    const targetBase = isSynced ? true : (e.shiftKey || isFocusedOnBase())
    const currentTime = targetBase ? getBaseCurrentTime() : getReactCurrentTime()
    syncSeek(targetBase, currentTime + amount)
    return
  }

  if (key === 'arrowup' || key === 'arrowdown') {
    e.preventDefault()
    const delta = key === 'arrowup' ? 0.1 : -0.1
    const currentBaseVolume = get(baseVolume)
    const currentReactVolume = get(reactVolume)
    if (e.shiftKey) {
      setBaseVolume(clamp(currentBaseVolume + delta, 0, 1))
    } else {
      setReactVolume(clamp(currentReactVolume + delta, 0, 1))
    }
    return
  }

  if (key === 'pageup' || key === 'pagedown') {
    e.preventDefault()
    if (isSynced) {
      adjustDelay(key === 'pageup' ? -1 : 1, 0)
    }
    return
  }

  if (key === ',' || key === '.') {
    e.preventDefault()
    if (isSynced) {
      const step = key === ',' ? -MICRO_ADJUST_STEP : MICRO_ADJUST_STEP
      setDelay(currentDelay + step, true)
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

export { MICRO_ADJUST_STEP }

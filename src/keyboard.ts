import { get, set } from './state.ts'
import { 
  syncToggle, syncSeek, adjustBaseVolume, adjustReactVolume,
  enableSync, disableSync, forceResync, getReactPlayer, getBaseCurrentTime
} from './sync.ts'

let holdStartTime = 0
let holdInterval: ReturnType<typeof setInterval> | null = null

function getDelayStep(): number {
  const held = Date.now() - holdStartTime
  if (held < 500) return 0.1
  if (held < 1500) return 0.5
  return 1.0
}

function adjustDelay(direction: 1 | -1): void {
  const step = getDelayStep() * direction
  set({ delay: +(get().delay + step).toFixed(1), lastInteractionTime: Date.now() })
}

function startDelayHold(direction: 1 | -1): void {
  if (holdInterval) return
  holdStartTime = Date.now()
  adjustDelay(direction)
  holdInterval = setInterval(() => adjustDelay(direction), 100)
}

function stopDelayHold(): void {
  if (holdInterval) {
    clearInterval(holdInterval)
    holdInterval = null
  }
}

export function initKeyboard(): void {
  const decBtn = document.getElementById('decreaseDelayBtn')
  const incBtn = document.getElementById('increaseDelayBtn')

  decBtn?.addEventListener('mousedown', () => startDelayHold(-1))
  decBtn?.addEventListener('mouseup', stopDelayHold)
  decBtn?.addEventListener('mouseleave', stopDelayHold)
  incBtn?.addEventListener('mousedown', () => startDelayHold(1))
  incBtn?.addEventListener('mouseup', stopDelayHold)
  incBtn?.addEventListener('mouseleave', stopDelayHold)

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return

    switch (e.code) {
      case 'Space':
        e.preventDefault()
        syncToggle()
        break
      case 'ArrowLeft':
        e.preventDefault()
        if (e.shiftKey) {
          syncSeek(true, getBaseCurrentTime() - 5)
        } else {
          const rp = getReactPlayer()
          if (rp) syncSeek(false, rp.getCurrentTime() - 5)
        }
        break
      case 'ArrowRight':
        e.preventDefault()
        if (e.shiftKey) {
          syncSeek(true, getBaseCurrentTime() + 5)
        } else {
          const rp = getReactPlayer()
          if (rp) syncSeek(false, rp.getCurrentTime() + 5)
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        if (e.shiftKey) {
          adjustBaseVolume(0.1)
        } else {
          adjustReactVolume(0.1)
        }
        break
      case 'ArrowDown':
        e.preventDefault()
        if (e.shiftKey) {
          adjustBaseVolume(-0.1)
        } else {
          adjustReactVolume(-0.1)
        }
        break
      case 'KeyS':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault()
          enableSync()
        }
        break
      case 'KeyD':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault()
          disableSync()
        }
        break
      case 'KeyF':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault()
          forceResync()
        }
        break
      case 'PageUp':
        e.preventDefault()
        adjustDelay(1)
        break
      case 'PageDown':
        e.preventDefault()
        adjustDelay(-1)
        break
    }
  })
}


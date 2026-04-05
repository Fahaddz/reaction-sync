import { subscribe } from './state.ts'
import { initUI } from './ui/index.ts'
import { getYouTubePlayers } from './ui/video-loading.ts'
import { initDraggable, initResizable, applyPosition } from './drag-resize.ts'
import { initKeyboardShortcuts, trackContainerFocus, initDelayHold } from './keyboard.ts'
import { startAutoSave, onSourceChange } from './storage.ts'

declare global {
  interface Window {
    __reactionSyncInitialized?: boolean
  }
}

export function startReactionSyncApp(): void {
  if (typeof window === 'undefined') return
  if (window.__reactionSyncInitialized) return
  window.__reactionSyncInitialized = true

  initUI()
  initKeyboardShortcuts()
  trackContainerFocus()

  const reactContainer = document.getElementById('videoReactContainer')
  const dragHandle = document.getElementById('reactDragHandle')
  const resizeHandle = document.getElementById('reactResizeHandle')

  if (reactContainer && dragHandle) {
    initDraggable(reactContainer, dragHandle)
  }

  if (reactContainer && resizeHandle) {
    initResizable(reactContainer, resizeHandle, (w, h) => {
      const { reactYT } = getYouTubePlayers()
      reactYT?.setSize(w, h - 44)
    })
    applyPosition(reactContainer)
  }

  const decreaseBtn = document.getElementById('decreaseDelayBtn')
  const increaseBtn = document.getElementById('increaseDelayBtn')
  if (decreaseBtn && increaseBtn) {
    initDelayHold(decreaseBtn, increaseBtn)
  }

  subscribe(() => {
    onSourceChange()
  })

  startAutoSave()
}

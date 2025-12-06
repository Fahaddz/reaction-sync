import './styles.css'
import { subscribe } from './state.ts'
import { initUI, closeTipsScreen, getYouTubePlayers } from './ui/index.ts'
import { initDraggable, initResizable, applyPosition } from './drag-resize.ts'
import { initKeyboardShortcuts, trackContainerFocus, initDelayHold } from './keyboard.ts'
import { startAutoSave, loadLastSession, clearSessions, onSourceChange } from './storage.ts'

function init(): void {
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
      reactYT?.setSize(w, h - 36)
    })
    applyPosition(reactContainer)
  }

  const decreaseBtn = document.getElementById('decreaseDelayBtn')
  const increaseBtn = document.getElementById('increaseDelayBtn')
  if (decreaseBtn && increaseBtn) {
    initDelayHold(decreaseBtn, increaseBtn)
  }

  document.getElementById('tipsClose')?.addEventListener('click', closeTipsScreen)

  document.getElementById('loadLastPairBtn')?.addEventListener('click', () => {
    loadLastSession()
    closeTipsScreen()
  })

  document.getElementById('clearStorageBtn')?.addEventListener('click', () => {
    if (confirm('Clear saved video progress?')) {
      clearSessions()
      alert('Saved progress cleared.')
    }
  })

  subscribe(() => {
    onSourceChange()
  })

  startAutoSave()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}

import { get, set } from './state.ts'

export function initDragResize(): void {
  const container = document.getElementById('videoReactContainer')
  const handle = document.getElementById('reactDragHandle')
  const resizer = document.getElementById('reactResizeHandle')
  if (!container || !handle || !resizer) return

  let startX = 0, startY = 0, startLeft = 0, startTop = 0
  let startW = 0, startH = 0
  let isDragging = false, isResizing = false

  const ASPECT = 16 / 9
  const MIN_W = 200
  const MIN_H = MIN_W / ASPECT

  handle.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault()
    isDragging = true
    startX = e.clientX
    startY = e.clientY
    startLeft = container.offsetLeft
    startTop = container.offsetTop
    set({ userInteracting: true, lastInteractionTime: Date.now() })
    handle.setPointerCapture(e.pointerId)
  })

  handle.addEventListener('pointermove', (e: PointerEvent) => {
    if (!isDragging) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    const newLeft = Math.max(0, Math.min(startLeft + dx, window.innerWidth - container.offsetWidth))
    const newTop = Math.max(0, Math.min(startTop + dy, window.innerHeight - container.offsetHeight))
    container.style.left = `${newLeft}px`
    container.style.top = `${newTop}px`
  })

  handle.addEventListener('pointerup', (e: PointerEvent) => {
    if (!isDragging) return
    isDragging = false
    handle.releasePointerCapture(e.pointerId)
    const pos = get().reactPosition
    set({
      userInteracting: false,
      reactPosition: { ...pos, x: container.offsetLeft, y: container.offsetTop }
    })
  })

  resizer.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault()
    isResizing = true
    startX = e.clientX
    startY = e.clientY
    startW = container.offsetWidth
    startH = container.offsetHeight
    set({ userInteracting: true, lastInteractionTime: Date.now() })
    resizer.setPointerCapture(e.pointerId)
  })

  resizer.addEventListener('pointermove', (e: PointerEvent) => {
    if (!isResizing) return
    const dx = e.clientX - startX
    let newW = Math.max(MIN_W, startW + dx)
    let newH = newW / ASPECT
    if (newH < MIN_H) {
      newH = MIN_H
      newW = newH * ASPECT
    }
    container.style.width = `${newW}px`
    container.style.height = `${newH}px`
  })

  resizer.addEventListener('pointerup', (e: PointerEvent) => {
    if (!isResizing) return
    isResizing = false
    resizer.releasePointerCapture(e.pointerId)
    const pos = get().reactPosition
    set({
      userInteracting: false,
      reactPosition: { ...pos, w: container.offsetWidth, h: container.offsetHeight }
    })
  })
}


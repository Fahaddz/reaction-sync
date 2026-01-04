import { get, set } from './state.ts'
import { clamp } from './utils.ts'

export function initDraggable(container: HTMLElement, handle: HTMLElement): void {
  let startX = 0, startY = 0, startLeft = 0, startTop = 0

  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    handle.setPointerCapture(e.pointerId)
    startX = e.clientX
    startY = e.clientY
    startLeft = container.offsetLeft
    startTop = container.offsetTop
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
  })

  function onMove(e: PointerEvent) {
    const maxX = window.innerWidth - container.offsetWidth
    const maxY = window.innerHeight - container.offsetHeight
    const x = clamp(startLeft + (e.clientX - startX), 0, maxX)
    const y = clamp(startTop + (e.clientY - startY), 0, maxY)
    container.style.left = `${x}px`
    container.style.top = `${y}px`
  }

  function onUp(e: PointerEvent) {
    handle.releasePointerCapture(e.pointerId)
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', onUp)
    const pos = get().reactPosition
    set({ reactPosition: { ...pos, x: container.offsetLeft, y: container.offsetTop } })
  }
}

export function initResizable(
  container: HTMLElement,
  handle: HTMLElement,
  onResize?: (w: number, h: number) => void
): void {
  let startX = 0, startW = 0

  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    handle.setPointerCapture(e.pointerId)
    startX = e.clientX
    startW = container.offsetWidth
    container.classList.add('resizing')
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
  })

  function onMove(e: PointerEvent) {
    const w = Math.max(200, startW + (e.clientX - startX))
    const h = Math.round(w / (16 / 9))
    container.style.width = `${w}px`
    container.style.height = `${h}px`
    onResize?.(w, h)
  }

  function onUp(e: PointerEvent) {
    handle.releasePointerCapture(e.pointerId)
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', onUp)
    container.classList.remove('resizing')
    const pos = get().reactPosition
    set({ reactPosition: { ...pos, w: container.offsetWidth, h: container.offsetHeight } })
    onResize?.(container.offsetWidth, container.offsetHeight)
  }
}

export function applyPosition(container: HTMLElement): void {
  const { reactPosition } = get()
  container.style.left = `${reactPosition.x}px`
  container.style.top = `${reactPosition.y}px`
  container.style.width = `${reactPosition.w}px`
  container.style.height = `${reactPosition.h}px`
}

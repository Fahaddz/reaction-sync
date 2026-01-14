import type { Action } from 'svelte/action'
import { clamp } from '../utils.ts'

export type DraggableOptions = {
  handle?: HTMLElement
  onDragEnd?: (x: number, y: number) => void
}

export const draggable: Action<HTMLElement, DraggableOptions | undefined> = (node, options = {}) => {
  let startX = 0
  let startY = 0
  let startLeft = 0
  let startTop = 0
  let handle = options?.handle ?? node

  function onPointerDown(e: PointerEvent) {
    e.preventDefault()
    handle.setPointerCapture(e.pointerId)
    startX = e.clientX
    startY = e.clientY
    startLeft = node.offsetLeft
    startTop = node.offsetTop
    handle.addEventListener('pointermove', onPointerMove)
    handle.addEventListener('pointerup', onPointerUp)
  }

  function onPointerMove(e: PointerEvent) {
    const maxX = window.innerWidth - node.offsetWidth
    const maxY = window.innerHeight - node.offsetHeight
    const x = clamp(startLeft + (e.clientX - startX), 0, maxX)
    const y = clamp(startTop + (e.clientY - startY), 0, maxY)
    node.style.left = `${x}px`
    node.style.top = `${y}px`
  }

  function onPointerUp(e: PointerEvent) {
    handle.releasePointerCapture(e.pointerId)
    handle.removeEventListener('pointermove', onPointerMove)
    handle.removeEventListener('pointerup', onPointerUp)
    options?.onDragEnd?.(node.offsetLeft, node.offsetTop)
  }

  handle.addEventListener('pointerdown', onPointerDown)

  return {
    update(newOptions: DraggableOptions | undefined) {
      if (newOptions?.handle && newOptions.handle !== handle) {
        handle.removeEventListener('pointerdown', onPointerDown)
        handle = newOptions.handle
        handle.addEventListener('pointerdown', onPointerDown)
      }
      if (newOptions) {
        options = newOptions
      }
    },
    destroy() {
      handle.removeEventListener('pointerdown', onPointerDown)
      handle.removeEventListener('pointermove', onPointerMove)
      handle.removeEventListener('pointerup', onPointerUp)
    }
  }
}

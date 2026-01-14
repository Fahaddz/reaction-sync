import type { Action } from 'svelte/action'

export type ResizableOptions = {
  handle?: HTMLElement
  minWidth?: number
  aspectRatio?: number
  onResize?: (w: number, h: number) => void
  onResizeEnd?: (w: number, h: number) => void
}

export const resizable: Action<HTMLElement, ResizableOptions | undefined> = (node, options = {}) => {
  let startX = 0
  let startW = 0
  let handle = options?.handle ?? node
  let minWidth = options?.minWidth ?? 200
  let aspectRatio = options?.aspectRatio ?? 16 / 9

  function onPointerDown(e: PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    handle.setPointerCapture(e.pointerId)
    startX = e.clientX
    startW = node.offsetWidth
    node.classList.add('resizing')
    handle.addEventListener('pointermove', onPointerMove)
    handle.addEventListener('pointerup', onPointerUp)
  }

  function onPointerMove(e: PointerEvent) {
    const w = Math.max(minWidth, startW + (e.clientX - startX))
    const h = Math.round(w / aspectRatio)
    node.style.width = `${w}px`
    node.style.height = `${h}px`
    options?.onResize?.(w, h)
  }

  function onPointerUp(e: PointerEvent) {
    handle.releasePointerCapture(e.pointerId)
    handle.removeEventListener('pointermove', onPointerMove)
    handle.removeEventListener('pointerup', onPointerUp)
    node.classList.remove('resizing')
    options?.onResizeEnd?.(node.offsetWidth, node.offsetHeight)
    options?.onResize?.(node.offsetWidth, node.offsetHeight)
  }

  handle.addEventListener('pointerdown', onPointerDown)

  return {
    update(newOptions: ResizableOptions | undefined) {
      if (newOptions?.handle && newOptions.handle !== handle) {
        handle.removeEventListener('pointerdown', onPointerDown)
        handle = newOptions.handle
        handle.addEventListener('pointerdown', onPointerDown)
      }
      if (newOptions?.minWidth !== undefined) {
        minWidth = newOptions.minWidth
      }
      if (newOptions?.aspectRatio !== undefined) {
        aspectRatio = newOptions.aspectRatio
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

<script lang="ts">
  import { onMount } from 'svelte'
  import { draggable } from '../actions/draggable.ts'
  import { resizable } from '../actions/resizable.ts'
  import { reactSource, reactPosition } from '../lib/stores.ts'
  import { syncToggle } from '../lib/sync.ts'

  let container: HTMLDivElement
  let dragHandle: HTMLDivElement
  let resizeHandle: HTMLDivElement
  let videoElement: HTMLVideoElement
  let youtubeContainer: HTMLDivElement

  export function getVideoElement(): HTMLVideoElement {
    return videoElement
  }

  export function getYouTubeContainer(): HTMLDivElement {
    return youtubeContainer
  }

  function handleDragEnd(x: number, y: number) {
    reactPosition.update(pos => ({ ...pos, x, y }))
  }

  function handleResizeEnd(w: number, h: number) {
    reactPosition.update(pos => ({ ...pos, w, h }))
  }

  function handleVideoClick() {
    syncToggle()
  }

  $: sourceType = $reactSource?.type
  $: showLocal = sourceType !== 'youtube'
  $: showYouTube = sourceType === 'youtube'
  $: posStyle = `left: ${$reactPosition.x}px; top: ${$reactPosition.y}px; width: ${$reactPosition.w}px; height: ${$reactPosition.h}px;`
</script>

<div
  bind:this={container}
  class="fixed z-50 bg-bg-secondary rounded-lg overflow-hidden shadow-lg border border-border"
  class:hidden={!$reactSource}
  style={posStyle}
  use:draggable={{ handle: dragHandle, onDragEnd: handleDragEnd }}
  use:resizable={{ handle: resizeHandle, minWidth: 200, aspectRatio: 16/9, onResizeEnd: handleResizeEnd }}
>
  <div class="relative w-full h-full">
    <div
      class="absolute inset-0 cursor-pointer"
      onclick={handleVideoClick}
      onkeydown={(e) => e.key === 'Enter' && handleVideoClick()}
      role="button"
      tabindex="0"
    >
      <video
        bind:this={videoElement}
        class="w-full h-full object-contain bg-black"
        class:hidden={!showLocal}
        playsinline
      ></video>
      <div
        bind:this={youtubeContainer}
        class="w-full h-full"
        class:hidden={!showYouTube}
      ></div>
    </div>

    <div class="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-black/60 to-transparent flex items-center px-2 gap-2 opacity-0 hover:opacity-100 transition-opacity">
      <div
        bind:this={dragHandle}
        class="cursor-move text-text-secondary hover:text-text-primary select-none text-sm font-mono"
        title="Drag to move"
      >⋮⋮</div>
    </div>

    <div
      bind:this={resizeHandle}
      class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-0 hover:opacity-100 transition-opacity"
      title="Drag to resize"
    >
      <svg class="w-full h-full text-text-secondary" viewBox="0 0 16 16" fill="currentColor">
        <path d="M14 14H10V12H12V10H14V14ZM14 6H12V8H10V10H8V12H6V14H4V12H6V10H8V8H10V6H12V4H14V6Z" />
      </svg>
    </div>
  </div>
</div>

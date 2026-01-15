<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { draggable } from '../actions/draggable.ts'
  import { resizable } from '../actions/resizable.ts'
  import { reactSource, reactPosition, reactVolume, synced } from '../lib/stores.ts'
  import {
    syncToggle,
    syncPlay,
    syncPause,
    syncSeek,
    getReactCurrentTime,
    getReactDuration,
    isReactPlaying,
    setReactVolume
  } from '../lib/sync.ts'
  import { formatTime, throttle } from '../lib/utils.ts'

  let container: HTMLDivElement
  let dragHandle: HTMLDivElement
  let resizeHandle: HTMLDivElement
  let videoElement: HTMLVideoElement
  let youtubeContainer: HTMLDivElement

  // React video state
  let reactTime = $state(0)
  let reactDuration = $state(0)
  let reactPlaying = $state(false)
  let reactSeekValue = $state(0)
  let intervalId: number | null = null

  // Derived state
  let isSynced = $derived($synced)
  let hasReact = $derived(!!$reactSource)

  export function getVideoElement(): HTMLVideoElement {
    return videoElement
  }

  export function getYouTubeContainer(): HTMLDivElement {
    return youtubeContainer
  }

  onMount(() => {
    intervalId = window.setInterval(updateTimes, 100)
  })

  onDestroy(() => {
    if (intervalId) clearInterval(intervalId)
  })

  function updateTimes() {
    reactTime = getReactCurrentTime()
    reactDuration = getReactDuration()
    reactPlaying = isReactPlaying()
    if (reactDuration > 0) reactSeekValue = (reactTime / reactDuration) * 100
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

  function handleReactPlayPause() {
    reactPlaying ? syncPause(false) : syncPlay(false)
  }

  const handleReactSeek = throttle((e: Event) => {
    const target = e.target as HTMLInputElement
    const pct = parseFloat(target.value)
    if (reactDuration > 0) syncSeek(false, (pct / 100) * reactDuration)
  }, 50)

  function handleReactVolumeChange(e: Event) {
    const target = e.target as HTMLInputElement
    setReactVolume(parseFloat(target.value))
  }

  // Derived state for positioning
  let posStyle = $derived(`left: ${$reactPosition.x}px; top: ${$reactPosition.y}px; width: ${$reactPosition.w}px; height: ${$reactPosition.h}px;`)
</script>

<div
  bind:this={container}
  class="fixed z-50 bg-bg-secondary rounded-lg overflow-hidden shadow-lg group transition-colors duration-200"
  class:hidden={!$reactSource}
  class:border-success={isSynced}
  class:border-2={isSynced}
  class:border-border={!isSynced}
  class:border={!isSynced}
  style={posStyle}
  data-testid="react-overlay"
  data-synced={isSynced}
  use:draggable={{ handle: dragHandle, onDragEnd: handleDragEnd }}
  use:resizable={{ handle: resizeHandle, minWidth: 200, aspectRatio: 16/9, onResizeEnd: handleResizeEnd }}
>
  <div class="relative w-full h-full">
    <!-- Local video -->
    <video
      bind:this={videoElement}
      class="w-full h-full object-contain bg-black cursor-pointer"
      class:invisible={$reactSource?.type === 'youtube'}
      class:pointer-events-none={$reactSource?.type === 'youtube'}
      onclick={handleVideoClick}
      onkeydown={(e) => e.key === 'Enter' && handleVideoClick()}
      playsinline
    ></video>
    <!-- YouTube container -->
    <div
      bind:this={youtubeContainer}
      id="videoReactYoutube"
      class="w-full h-full absolute inset-0"
      class:invisible={$reactSource?.type !== 'youtube'}
      class:pointer-events-none={$reactSource?.type !== 'youtube'}
    ></div>

    <!-- Top bar with react controls - fades in on hover -->
    <div 
      class="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-black/70 to-transparent flex items-center px-2 gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
      data-testid="react-top-bar"
    >
      <!-- Drag handle -->
      <div
        bind:this={dragHandle}
        class="cursor-move text-text-secondary hover:text-text-primary select-none text-sm font-mono"
        title="Drag to move"
      >⋮⋮</div>

      <!-- React play/pause button -->
      <button
        class="w-6 h-6 flex items-center justify-center bg-bg-tertiary/80 border border-border rounded text-text-primary hover:bg-accent hover:border-accent transition-colors text-xs"
        onclick={handleReactPlayPause}
        title={reactPlaying ? 'Pause react' : 'Play react'}
        data-testid="react-play-pause"
      >
        {reactPlaying ? '⏸' : '▶'}
      </button>

      <!-- React seek bar -->
      <div class="flex-1 min-w-0">
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={reactSeekValue}
          oninput={handleReactSeek}
          data-testid="react-seek"
          class="w-full h-1 bg-border rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>

      <!-- React time display -->
      <span class="text-xs text-text-secondary font-mono whitespace-nowrap" data-testid="react-time">
        {formatTime(reactTime)}
      </span>

      <!-- React volume slider -->
      <div class="flex items-center gap-1">
        <span class="text-xs text-text-secondary">🔊</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={$reactVolume}
          oninput={handleReactVolumeChange}
          data-testid="react-volume"
          class="w-12 h-1 bg-border rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-text-secondary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>
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

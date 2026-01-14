<script lang="ts">
  import { onMount } from 'svelte'
  import { baseSource } from '../lib/stores.ts'
  import { syncToggle } from '../lib/sync.ts'

  let videoElement: HTMLVideoElement
  let youtubeContainer: HTMLDivElement

  export function getVideoElement(): HTMLVideoElement {
    return videoElement
  }

  export function getYouTubeContainer(): HTMLDivElement {
    return youtubeContainer
  }

  function handleClick() {
    syncToggle()
  }

  $: sourceType = $baseSource?.type
  $: showLocal = sourceType !== 'youtube'
  $: showYouTube = sourceType === 'youtube'
</script>

<div 
  class="absolute inset-0 bg-bg-primary flex items-center justify-center cursor-pointer"
  onclick={handleClick}
  onkeydown={(e) => e.key === 'Enter' && handleClick()}
  role="button"
  tabindex="0"
>
  <video
    bind:this={videoElement}
    class="w-full h-full object-contain"
    class:hidden={!showLocal}
    playsinline
  ></video>
  <div
    bind:this={youtubeContainer}
    class="w-full h-full"
    class:hidden={!showYouTube}
  ></div>
  {#if !$baseSource}
    <div class="absolute inset-0 flex items-center justify-center text-text-secondary text-lg pointer-events-none">
      Click "Base" to load a video
    </div>
  {/if}
</div>

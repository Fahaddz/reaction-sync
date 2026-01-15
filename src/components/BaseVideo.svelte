<script lang="ts">
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
</script>

<div 
  class="absolute inset-0 bg-bg-primary cursor-pointer"
  onclick={handleClick}
  onkeydown={(e) => e.key === 'Enter' && handleClick()}
  role="button"
  tabindex="0"
>
  <video
    bind:this={videoElement}
    class="w-full h-full object-contain"
    class:invisible={$baseSource?.type === 'youtube'}
    class:pointer-events-none={$baseSource?.type === 'youtube'}
    playsinline
  ></video>
  <div
    bind:this={youtubeContainer}
    id="videoBaseYoutube"
    class="w-full h-full absolute inset-0"
    class:invisible={$baseSource?.type !== 'youtube'}
    class:pointer-events-none={$baseSource?.type !== 'youtube'}
  ></div>
  {#if !$baseSource}
    <div class="absolute inset-0 flex items-center justify-center text-text-secondary text-lg pointer-events-none">
      Click "Load" to load a video
    </div>
  {/if}
</div>

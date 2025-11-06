<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { reactVideo, updateReactTime, updateReactDuration, updateReactState, updateReactVolume, loadReact } from '$lib/stores/video';
  import { getCurrentTime, getDuration, isPlaying, play, pause, seek, setVolume } from '$lib/services/local-video';
  import { getCurrentTime as getYTTime, getDuration as getYTDuration, getPlayerState, playVideo, pauseVideo, seekTo, setVolume as setYTVolume } from '$lib/services/youtube';
  import VideoControls from './VideoControls.svelte';

  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
  
  export let onPlayPause: () => void = () => {};
  export let onSeek: (time: number) => void = () => {};
  export let onVolumeChange: (volume: number) => void = () => {};
  export let onSourceSelect: (type: 'local' | 'link') => void = () => {};

  let container: HTMLDivElement | null = null;
  let videoElement: HTMLVideoElement | null = null;
  let youtubeContainer: HTMLDivElement | null = null;
  let dragHandle: HTMLDivElement | null = null;
  let resizeHandle: HTMLDivElement | null = null;
  let isDragging = false;
  let isResizing = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let startWidth = 0;
  let startHeight = 0;
  let updateInterval: ReturnType<typeof setInterval> | null = null;
  let stateChangeListener: ((e: YT.OnStateChangeEvent) => void) | null = null;
  let listenerAdded = false;
  let showControls = false;

  $: video = $reactVideo;
  $: showYoutube = video.source === 'youtube';
  $: showLocal = video.source === 'local' || video.source === 'direct' || video.source === 'realdebrid';

  function updateTime() {
    try {
      if (video.source === 'youtube' && video.youtubePlayer) {
        const time = getYTTime(video.youtubePlayer);
        const duration = getYTDuration(video.youtubePlayer);
        const state = getPlayerState(video.youtubePlayer);
        updateReactTime(time);
        updateReactDuration(duration);
        updateReactState(state === YT.PlayerState.PLAYING ? 'playing' : state === YT.PlayerState.PAUSED ? 'paused' : state === YT.PlayerState.BUFFERING ? 'buffering' : state === YT.PlayerState.ENDED ? 'ended' : 'unstarted');
      } else if (video.element) {
        const time = getCurrentTime(video.element);
        const duration = getDuration(video.element);
        updateReactTime(time);
        updateReactDuration(duration);
        updateReactState(isPlaying(video.element) ? 'playing' : 'paused');
      }
    } catch (e) {
      console.error('Error updating react video time:', e);
    }
  }

  function handlePlayPause() {
    dispatch('playPause');
    onPlayPause();
  }

  function handleSeek(time: number) {
    try {
      const el = video.element || videoElement;
      if (video.source === 'youtube' && video.youtubePlayer) {
        seekTo(video.youtubePlayer, time);
      } else if (el) {
        seek(el, time);
      }
      dispatch('seek', time);
      onSeek(time);
    } catch (e) {
      console.error('Error seeking react video:', e);
    }
  }

  function handleVolumeChange(volume: number) {
    try {
      const el = video.element || videoElement;
      if (video.source === 'youtube' && video.youtubePlayer) {
        setYTVolume(video.youtubePlayer, volume);
      } else if (el) {
        setVolume(el, volume);
      }
      updateReactVolume(volume);
      dispatch('volumeChange', volume);
      onVolumeChange(volume);
    } catch (e) {
      console.error('Error changing react video volume:', e);
    }
  }

  function initDrag(e: MouseEvent | TouchEvent) {
    if (!container || typeof document === 'undefined') return;
    e.preventDefault();
    isDragging = true;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startX = clientX;
    startY = clientY;
    startLeft = container.offsetLeft;
    startTop = container.offsetTop;
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchmove', drag);
    document.addEventListener('touchend', stopDrag);
  }

  function drag(e: MouseEvent | TouchEvent) {
    if (!isDragging || !container || typeof window === 'undefined') return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const newLeft = startLeft + (clientX - startX);
    const newTop = startTop + (clientY - startY);
    const maxLeft = window.innerWidth - container.offsetWidth;
    const maxTop = window.innerHeight - container.offsetHeight;
    container.style.left = `${Math.max(0, Math.min(newLeft, maxLeft))}px`;
    container.style.top = `${Math.max(0, Math.min(newTop, maxTop))}px`;
  }

  function stopDrag() {
    if (typeof document === 'undefined') return;
    isDragging = false;
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('touchmove', drag);
    document.removeEventListener('touchend', stopDrag);
  }

  function initResize(e: MouseEvent | TouchEvent) {
    if (!container || typeof document === 'undefined') return;
    e.preventDefault();
    e.stopPropagation();
    isResizing = true;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    startX = clientX;
    startWidth = container.offsetWidth;
    startHeight = container.offsetHeight;
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
    document.addEventListener('touchmove', resize);
    document.addEventListener('touchend', stopResize);
  }

  function resize(e: MouseEvent | TouchEvent) {
    if (!isResizing || !container) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const width = Math.max(200, startWidth + (clientX - startX));
    const aspectRatio = 16 / 9;
    const height = Math.round(width / aspectRatio);
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    if (video.source === 'youtube' && video.youtubePlayer) {
      try {
        video.youtubePlayer.setSize(width, height - 60);
      } catch {}
    }
  }

  function stopResize() {
    if (!container || typeof document === 'undefined') return;
    isResizing = false;
    document.removeEventListener('mousemove', resize);
    document.removeEventListener('mouseup', stopResize);
    document.removeEventListener('touchmove', resize);
    document.removeEventListener('touchend', stopResize);
    if (video.source === 'youtube' && video.youtubePlayer) {
      setTimeout(() => {
        try {
          if (container) {
            video.youtubePlayer?.setSize(container.offsetWidth, container.offsetHeight - 60);
          }
        } catch {}
      }, 100);
    }
  }

  $: if (typeof document !== 'undefined' && youtubeContainer && video.source === 'youtube' && video.youtubePlayer && !listenerAdded) {
    const player = video.youtubePlayer;
    try {
      stateChangeListener = (e: YT.OnStateChangeEvent) => {
        if (e.data === YT.PlayerState.PLAYING) {
          updateReactState('playing');
        } else if (e.data === YT.PlayerState.PAUSED) {
          updateReactState('paused');
        } else if (e.data === YT.PlayerState.ENDED) {
          updateReactState('ended');
        }
      };
      player.addEventListener('onStateChange', stateChangeListener);
      listenerAdded = true;
    } catch (e) {
      console.error('Error adding YouTube state change listener:', e);
    }
  }
  
  $: if (video.source !== 'youtube' || !video.youtubePlayer) {
    listenerAdded = false;
  }

  onMount(() => {
    if (!updateInterval) {
      updateInterval = setInterval(updateTime, 1000);
    }
    setTimeout(() => {
      if (videoElement) {
        loadReact(videoElement, null, { id: null, type: 'local' }, 'local');
        videoElement.addEventListener('loadedmetadata', () => {
          updateTime();
        });
        videoElement.addEventListener('timeupdate', () => {
          updateTime();
        });
        videoElement.addEventListener('play', () => {
          updateReactState('playing');
        });
        videoElement.addEventListener('pause', () => {
          updateReactState('paused');
        });
      }
      if (dragHandle) {
        dragHandle.addEventListener('mousedown', initDrag);
        dragHandle.addEventListener('touchstart', initDrag);
      } else {
        setTimeout(() => {
          if (dragHandle) {
            dragHandle.addEventListener('mousedown', initDrag);
            dragHandle.addEventListener('touchstart', initDrag);
          }
        }, 100);
      }
      if (resizeHandle) {
        resizeHandle.addEventListener('mousedown', initResize);
        resizeHandle.addEventListener('touchstart', initResize);
      } else {
        setTimeout(() => {
          if (resizeHandle) {
            resizeHandle.addEventListener('mousedown', initResize);
            resizeHandle.addEventListener('touchstart', initResize);
          }
        }, 100);
      }
    }, 0);
  });

  onDestroy(() => {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
    if (video.youtubePlayer && stateChangeListener) {
      try {
        video.youtubePlayer.removeEventListener('onStateChange', stateChangeListener);
      } catch (e) {
        console.error('Error removing YouTube state change listener:', e);
      }
    }
    listenerAdded = false;
    stateChangeListener = null;
    if (typeof document !== 'undefined') {
      document.removeEventListener('mousemove', drag);
      document.removeEventListener('mouseup', stopDrag);
      document.removeEventListener('touchmove', drag);
      document.removeEventListener('touchend', stopDrag);
      document.removeEventListener('mousemove', resize);
      document.removeEventListener('mouseup', stopResize);
      document.removeEventListener('touchmove', resize);
      document.removeEventListener('touchend', stopResize);
    }
  });
</script>

<div
  bind:this={container}
  id="videoReactContainer"
  class="react-container"
  class:resizing={isResizing}
  on:mouseenter={() => showControls = true}
  on:mouseleave={() => showControls = false}
>
  {#if showLocal}
    <!-- svelte-ignore a11y-media-has-caption -->
    <video
      id="reactVideo"
      bind:this={videoElement}
      class="react-video"
      aria-label="Reaction video player"
    />
  {/if}
  <div
    bind:this={youtubeContainer}
    id="videoReactYoutube"
    class="youtube-container"
    style="display: {showYoutube ? 'block' : 'none'}"
  />
  <div bind:this={dragHandle} class="drag-handle">DRAG</div>
  <div class="resize-handle" bind:this={resizeHandle}></div>
  <div
    class="controls-wrapper"
    class:visible={showControls}
    role="presentation"
  >
    <VideoControls
      isBase={false}
      onPlayPause={handlePlayPause}
      onSeek={handleSeek}
      onVolumeChange={handleVolumeChange}
      {onSourceSelect}
    />
  </div>
</div>

<style>
  .react-container {
    position: fixed;
    z-index: 100;
    top: 1vw;
    left: 1vw;
    border-radius: 8px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
    background: transparent;
    min-width: 200px;
    min-height: 112px;
    overflow: hidden;
    touch-action: none;
  }
  .react-container.resizing {
    border-color: rgba(0, 255, 255, 0.6);
    box-shadow: 0 0 15px rgba(0, 255, 255, 0.4);
  }
  .react-video {
    width: 100%;
    height: 100%;
    border-radius: 8px;
    object-fit: contain;
    background: #000;
  }
  .youtube-container {
    width: 100%;
    height: calc(100% - 60px);
    border-radius: 8px 8px 0 0;
    background: #000;
    position: absolute;
    z-index: 4;
  }
  .drag-handle {
    position: absolute;
    top: 50%;
    left: 6px;
    transform: translateY(-50%);
    background: rgba(0, 0, 0, 0.5);
    color: rgba(255, 255, 255, 0.9);
    padding: 6px 4px;
    border-radius: 6px;
    font-size: 10px;
    cursor: move;
    z-index: 1001;
    backdrop-filter: blur(4px);
    border: 1px solid rgba(255, 255, 255, 0.18);
    opacity: 0.35;
    writing-mode: vertical-rl;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    pointer-events: auto;
  }
  .react-container:hover .drag-handle {
    opacity: 0.6;
  }
  .resize-handle {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 24px;
    height: 24px;
    cursor: se-resize;
    z-index: 1002;
    background: rgba(0, 0, 0, 0.4);
    border-radius: 3px 0 0 0;
    opacity: 0.6;
    backdrop-filter: blur(4px);
  }
  .resize-handle:hover {
    opacity: 0.8;
    background: rgba(0, 0, 0, 0.5);
  }
  .controls-wrapper {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
    z-index: 10;
  }
  .controls-wrapper.visible {
    opacity: 1;
    pointer-events: auto;
  }
</style>


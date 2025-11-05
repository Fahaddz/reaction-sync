<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { baseVideo, updateBaseTime, updateBaseDuration, updateBaseState, updateBaseVolume, loadBase } from '$lib/stores/video';
  import { getCurrentTime, getDuration, isPlaying, play, pause, seek, setVolume } from '$lib/services/local-video';
  import { getCurrentTime as getYTTime, getDuration as getYTDuration, getPlayerState, playVideo, pauseVideo, seekTo, setVolume as setYTVolume } from '$lib/services/youtube';
  import VideoControls from './VideoControls.svelte';

  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
  
  export let onPlayPause: () => void = () => {};
  export let onSeek: (time: number) => void = () => {};
  export let onVolumeChange: (volume: number) => void = () => {};
  export let onSourceSelect: (type: 'local' | 'link') => void = () => {};
  export let onSave: () => void = () => {};
  export let onLoadLast: () => void = () => {};
  export let onClearSaved: () => void = () => {};
  export let onLoadSubtitles: () => void = () => {};
  export let onForceResync: () => void = () => {};
  export let onEnableSync: () => void = () => {};
  export let onDisableSync: () => void = () => {};

  let videoElement: HTMLVideoElement | null = null;
  let youtubeContainer: HTMLDivElement | null = null;
  let updateInterval: ReturnType<typeof setInterval> | null = null;
  let stateChangeListener: ((e: YT.OnStateChangeEvent) => void) | null = null;
  let listenerAdded = false;

  $: video = $baseVideo;
  $: showYoutube = video.source === 'youtube';
  $: showLocal = video.source === 'local' || video.source === 'direct' || video.source === 'realdebrid';

  function updateTime() {
    try {
      if (video.source === 'youtube' && video.youtubePlayer) {
        const time = getYTTime(video.youtubePlayer);
        const duration = getYTDuration(video.youtubePlayer);
        const state = getPlayerState(video.youtubePlayer);
        updateBaseTime(time);
        updateBaseDuration(duration);
        updateBaseState(state === YT.PlayerState.PLAYING ? 'playing' : state === YT.PlayerState.PAUSED ? 'paused' : state === YT.PlayerState.BUFFERING ? 'buffering' : state === YT.PlayerState.ENDED ? 'ended' : 'unstarted');
      } else if (video.element) {
        const time = getCurrentTime(video.element);
        const duration = getDuration(video.element);
        updateBaseTime(time);
        updateBaseDuration(duration);
        updateBaseState(isPlaying(video.element) ? 'playing' : 'paused');
      }
    } catch (e) {
      console.error('Error updating base video time:', e);
    }
  }

  function handlePlayPause() {
    dispatch('playPause');
    onPlayPause();
  }

  function handleSeek(time: number) {
    try {
      if (video.source === 'youtube' && video.youtubePlayer) {
        seekTo(video.youtubePlayer, time);
      } else if (video.element) {
        seek(video.element, time);
      }
      dispatch('seek', time);
      onSeek(time);
    } catch (e) {
      console.error('Error seeking base video:', e);
    }
  }

  function handleVolumeChange(volume: number) {
    try {
      if (video.source === 'youtube' && video.youtubePlayer) {
        setYTVolume(video.youtubePlayer, volume);
      } else if (video.element) {
        setVolume(video.element, volume);
      }
      updateBaseVolume(volume);
      dispatch('volumeChange', volume);
      onVolumeChange(volume);
    } catch (e) {
      console.error('Error changing base video volume:', e);
    }
  }

  $: if (typeof document !== 'undefined' && youtubeContainer && video.source === 'youtube' && video.youtubePlayer && !listenerAdded) {
    const player = video.youtubePlayer;
    try {
      stateChangeListener = (e: YT.OnStateChangeEvent) => {
        if (e.data === YT.PlayerState.PLAYING) {
          updateBaseState('playing');
        } else if (e.data === YT.PlayerState.PAUSED) {
          updateBaseState('paused');
        } else if (e.data === YT.PlayerState.ENDED) {
          updateBaseState('ended');
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
    if (videoElement) {
      loadBase(videoElement, null, { id: null, type: 'local' }, 'local');
      videoElement.addEventListener('loadedmetadata', () => {
        updateTime();
      });
      videoElement.addEventListener('timeupdate', () => {
        updateTime();
      });
      videoElement.addEventListener('play', () => {
        updateBaseState('playing');
      });
      videoElement.addEventListener('pause', () => {
        updateBaseState('paused');
      });
    }
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
  });
</script>

<div class="base-container">
  {#if showLocal}
    <!-- svelte-ignore a11y-media-has-caption -->
    <video
      id="baseVideo"
      bind:this={videoElement}
      class="base-video"
      style="display: {showLocal ? 'block' : 'none'}"
      aria-label="Base video player"
    />
  {/if}
  <div
    bind:this={youtubeContainer}
    id="videoBaseYoutube"
    class="youtube-container"
    style="display: {showYoutube ? 'block' : 'none'}"
  />
  <VideoControls
    isBase={true}
    onPlayPause={handlePlayPause}
    onSeek={handleSeek}
    onVolumeChange={handleVolumeChange}
    {onSourceSelect}
    {onSave}
    {onLoadLast}
    {onClearSaved}
    {onLoadSubtitles}
    {onForceResync}
    {onEnableSync}
    {onDisableSync}
  />
</div>

<style>
  .base-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    z-index: 1;
    background: #000;
  }
  .base-video {
    width: 100%;
    height: calc(100% - 60px);
    object-fit: contain;
  }
  .youtube-container {
    width: 100%;
    height: calc(100% - 60px);
    background: #000;
  }
</style>


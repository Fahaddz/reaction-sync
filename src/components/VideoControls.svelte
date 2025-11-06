<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { syncState, markUserInteraction } from '$lib/stores/sync';
  import { baseVideo, reactVideo } from '$lib/stores/video';
  import DelayControls from './DelayControls.svelte';
  import QualityMenu from './QualityMenu.svelte';
  import { secondsToTime } from '$lib/utils/time';
  import { getAvailableQualities, getCurrentQuality, setQuality } from '$lib/services/youtube';

  export let isBase: boolean;
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

  let showQualityMenu = false;
  let qualityMenuPos = { bottom: 0, left: 0 };
  let showSourceMenu = false;
  let availableQualities: string[] = [];
  let currentQuality = 'auto';

  $: video = isBase ? $baseVideo : $reactVideo;
  $: isPlaying = video.state === 'playing';
  $: timeDisplay = `${secondsToTime(video.currentTime)} / ${secondsToTime(video.duration)}`;
  $: seekPercent = video.duration > 0 ? (video.currentTime / video.duration) * 100 : 0;

  function handleSeek(e: Event) {
    const target = e.target as HTMLInputElement;
    const percent = parseFloat(target.value);
    const time = (percent / 100) * video.duration;
    markUserInteraction();
    onSeek(time);
  }

  function handleVolumeChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const volume = parseFloat(target.value);
    onVolumeChange(volume);
  }

  function toggleQualityMenu() {
    if (isBase && video.source === 'youtube' && video.youtubePlayer) {
      if (!showQualityMenu) {
        availableQualities = getAvailableQualities(video.youtubePlayer);
        currentQuality = getCurrentQuality(video.youtubePlayer);
        const button = document.getElementById('qualityBtn');
        if (button) {
          const rect = button.getBoundingClientRect();
          qualityMenuPos = {
            bottom: window.innerHeight - rect.top,
            left: rect.left
          };
        }
      }
      showQualityMenu = !showQualityMenu;
    }
  }

  function selectQuality(quality: string) {
    if (video.youtubePlayer) {
      setQuality(video.youtubePlayer, quality);
      currentQuality = quality;
      showQualityMenu = false;
    }
  }

  function handlePlayPauseClick(e: MouseEvent) {
    e.stopPropagation();
    onPlayPause();
  }

  function handleSourceMenuToggle(e: MouseEvent) {
    e.stopPropagation();
    showSourceMenu = !showSourceMenu;
  }

  function handleSourceSelect(type: 'local' | 'link', e: MouseEvent) {
    e.stopPropagation();
    onSourceSelect(type);
    showSourceMenu = false;
  }

  function handleQualityMenuToggle(e: MouseEvent) {
    e.stopPropagation();
    toggleQualityMenu();
  }

  function handleButtonClick(callback: () => void, e: MouseEvent) {
    e.stopPropagation();
    callback();
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.source-dropdown')) {
      showSourceMenu = false;
    }
    if (!target.closest('#qualityBtn') && !target.closest('.quality-menu')) {
      showQualityMenu = false;
    }
  }

  onMount(() => {
    if (typeof document !== 'undefined') {
      document.addEventListener('click', handleClickOutside);
    }
  });

  onDestroy(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('click', handleClickOutside);
    }
  });
</script>

<div class="controls">
  {#if isBase}
    <div class="source-dropdown">
      <button id="sourceBtn" class="btn source-btn" on:click={handleSourceMenuToggle}>
        Base
      </button>
      {#if showSourceMenu}
        <div class="source-menu">
          <button class="menu-item" on:click={(e) => handleSourceSelect('local', e)}>Local</button>
          <button class="menu-item" on:click={(e) => handleSourceSelect('link', e)}>Link</button>
        </div>
      {/if}
    </div>
    
    <button class="btn play-pause" on:click={handlePlayPauseClick} title="Play/Pause">
      {#if isPlaying}
        <span class="icon">⏸</span>
      {:else}
        <span class="icon">⏵</span>
      {/if}
    </button>
    
    <div class="seek-container">
      <input
        type="range"
        class="seek-bar"
        min="0"
        max="100"
        value={seekPercent}
        step="any"
        on:input={handleSeek}
      />
    </div>
    
    <span class="time" title="Time">{timeDisplay}</span>
    
    <div class="volume-container">
      <span class="volume-icon" title="Volume">🔊</span>
      <input
        type="range"
        class="volume"
        min="0"
        max="1"
        value={video.volume}
        step="any"
        on:input={handleVolumeChange}
      />
    </div>
    
    <DelayControls />
    
    {#if video.source === 'youtube'}
      <button id="qualityBtn" class="btn icon-btn" on:click={handleQualityMenuToggle} title="Quality">
        Q
      </button>
      {#if showQualityMenu}
        <QualityMenu
          qualities={availableQualities}
          currentQuality={currentQuality}
          position={qualityMenuPos}
          onSelect={selectQuality}
          onClose={() => showQualityMenu = false}
        />
      {/if}
    {/if}
    
    <button class="btn icon-btn" on:click={(e) => handleButtonClick(onLoadSubtitles, e)} title="Subtitles">CC</button>
    
    <div class="sync-buttons">
      <button 
        class="btn sync-btn" 
        class:synced={$syncState.isSynced}
        on:click={(e) => handleButtonClick(onEnableSync, e)} 
        title="Sync Videos"
      >
        S
      </button>
      <button class="btn icon-btn" on:click={(e) => handleButtonClick(onDisableSync, e)} title="Desync">D</button>
      <button class="btn icon-btn" on:click={(e) => handleButtonClick(onForceResync, e)} title="Force Resync">FR</button>
      <button class="btn icon-btn" on:click={(e) => handleButtonClick(onSave, e)} title="Save Progress">💾</button>
    </div>
    
    <button class="btn text-btn" on:click={(e) => handleButtonClick(onLoadLast, e)} title="Load Last Session">Load Last</button>
    <button class="btn text-btn" on:click={(e) => handleButtonClick(onClearSaved, e)} title="Clear Saved Progress">Clear</button>
  {:else}
    <div class="source-dropdown">
      <button id="reactSourceBtn" class="btn source-btn" on:click={handleSourceMenuToggle}>
        React
      </button>
      {#if showSourceMenu}
        <div class="source-menu">
          <button class="menu-item" on:click={(e) => handleSourceSelect('local', e)}>Local</button>
          <button class="menu-item" on:click={(e) => handleSourceSelect('link', e)}>Link</button>
        </div>
      {/if}
    </div>
    
    <button class="btn play-pause" on:click={handlePlayPauseClick} title="Play/Pause">
      {#if isPlaying}
        <span class="icon">⏸</span>
      {:else}
        <span class="icon">⏵</span>
      {/if}
    </button>
    
    <div class="seek-container">
      <input
        type="range"
        class="seek-bar"
        min="0"
        max="100"
        value={seekPercent}
        step="any"
        on:input={handleSeek}
      />
    </div>
    
    <span class="time" title="Time">{timeDisplay}</span>
    
    <div class="volume-container">
      <span class="volume-icon" title="Volume">🔊</span>
      <input
        type="range"
        class="volume"
        min="0"
        max="1"
        value={video.volume}
        step="any"
        on:input={handleVolumeChange}
      />
    </div>
  {/if}
</div>

<style>
  .controls {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.75) 70%, transparent 100%);
    backdrop-filter: blur(12px);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }


  .btn {
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 500;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    color: #e8e8e8;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    height: 36px;
    user-select: none;
  }

  .btn:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.25);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .btn:active {
    transform: translateY(0);
    background: rgba(255, 255, 255, 0.12);
  }

  .source-btn {
    background: rgba(100, 150, 255, 0.15);
    border-color: rgba(100, 150, 255, 0.3);
    color: #b3d4ff;
  }

  .source-btn:hover {
    background: rgba(100, 150, 255, 0.25);
    border-color: rgba(100, 150, 255, 0.5);
  }

  .play-pause {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(66, 165, 245, 0.9), rgba(33, 150, 243, 0.9));
    border: 2px solid rgba(255, 255, 255, 0.2);
    padding: 0;
    box-shadow: 0 4px 16px rgba(66, 165, 245, 0.4);
  }

  .play-pause:hover {
    background: linear-gradient(135deg, rgba(100, 181, 246, 1), rgba(66, 165, 245, 1));
    border-color: rgba(255, 255, 255, 0.4);
    transform: translateY(-2px) scale(1.05);
    box-shadow: 0 6px 20px rgba(66, 165, 245, 0.6);
  }

  .play-pause:active {
    transform: translateY(-1px) scale(1.02);
  }

  .play-pause .icon {
    font-size: 16px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .seek-container {
    flex: 1 1 auto;
    min-width: 300px;
    max-width: none;
  }

  .seek-bar {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.15);
    outline: none;
    cursor: pointer;
    transition: height 0.2s ease;
  }

  .seek-bar:hover {
    height: 8px;
  }

  .seek-bar::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #42a5f5;
    cursor: pointer;
    border: 2px solid rgba(255, 255, 255, 0.8);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    transition: all 0.2s ease;
  }

  .seek-bar::-webkit-slider-thumb:hover {
    width: 18px;
    height: 18px;
    background: #66b3ff;
    box-shadow: 0 3px 12px rgba(66, 165, 245, 0.6);
  }

  .seek-bar::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #42a5f5;
    cursor: pointer;
    border: 2px solid rgba(255, 255, 255, 0.8);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    transition: all 0.2s ease;
  }

  .seek-bar::-moz-range-thumb:hover {
    width: 18px;
    height: 18px;
    background: #66b3ff;
    box-shadow: 0 3px 12px rgba(66, 165, 245, 0.6);
  }

  .time {
    font-size: 11px;
    color: #b8b8b8;
    font-family: 'Courier New', monospace;
    font-weight: 500;
    padding: 0 4px;
    min-width: 100px;
    text-align: center;
  }

  .volume-container {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .volume-icon {
    font-size: 14px;
    opacity: 0.8;
  }

  .volume {
    width: 60px;
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.15);
    outline: none;
    cursor: pointer;
    transition: height 0.2s ease;
  }

  .volume:hover {
    height: 6px;
  }

  .volume::-webkit-slider-thumb {
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #42a5f5;
    cursor: pointer;
    border: 2px solid rgba(255, 255, 255, 0.8);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  }

  .volume::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #42a5f5;
    cursor: pointer;
    border: 2px solid rgba(255, 255, 255, 0.8);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  }

  .icon-btn {
    min-width: 36px;
    font-size: 11px;
  }

  .text-btn {
    font-size: 11px;
    padding: 6px 10px;
    height: 32px;
  }

  .sync-btn {
    min-width: 40px;
    font-weight: 600;
    transition: all 0.3s ease;
  }

  .sync-btn.synced {
    background: linear-gradient(135deg, rgba(76, 175, 80, 0.9), rgba(56, 142, 60, 0.9));
    border-color: rgba(76, 175, 80, 0.5);
    color: #ffffff;
    box-shadow: 0 4px 16px rgba(76, 175, 80, 0.4);
    animation: pulse 2s ease-in-out infinite;
  }

  .sync-btn.synced:hover {
    background: linear-gradient(135deg, rgba(102, 187, 106, 1), rgba(76, 175, 80, 1));
    box-shadow: 0 6px 20px rgba(76, 175, 80, 0.6);
  }

  @keyframes pulse {
    0%, 100% {
      box-shadow: 0 4px 16px rgba(76, 175, 80, 0.4);
    }
    50% {
      box-shadow: 0 4px 20px rgba(76, 175, 80, 0.6);
    }
  }

  .source-dropdown {
    position: relative;
  }

  .source-menu {
    position: absolute;
    bottom: 48px;
    left: 0;
    background: rgba(20, 20, 30, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    width: 90px;
    z-index: 1000;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    overflow: hidden;
  }

  .menu-item {
    padding: 10px 14px;
    text-align: left;
    font-size: 12px;
    background: transparent;
    border: none;
    border-radius: 0;
    color: #e0e0e0;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .menu-item:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .menu-item:first-child {
    border-radius: 10px 10px 0 0;
  }

  .menu-item:last-child {
    border-radius: 0 0 10px 10px;
  }

  .sync-buttons {
    display: flex;
    gap: 4px;
    padding: 0 4px;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    border-right: 1px solid rgba(255, 255, 255, 0.1);
  }
</style>

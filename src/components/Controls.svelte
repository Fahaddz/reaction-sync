<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import {
    synced,
    delay,
    syncHealth,
    baseVolume,
    baseSource,
    showToast
  } from '../lib/stores.ts'
  import {
    syncPlay,
    syncPause,
    syncSeek,
    enableSync,
    disableSync,
    forceResync,
    setDelay,
    setBaseVolume,
    getBaseCurrentTime,
    getBaseDuration,
    isBasePlaying
  } from '../lib/sync.ts'
  import { formatTime, formatTimeWithDecimal, throttle, isQualityActive } from '../lib/utils.ts'
  import { saveSession } from '../lib/storage.ts'
  import { promptLocalFile, selectUrlSource, selectSubtitleFile, getYouTubePlayers } from '../lib/video-loading.ts'
  import { getQualityLabel, getQualityOrder } from '../lib/youtube.ts'

  let baseTime = $state(0)
  let baseDuration = $state(0)
  let basePlaying = $state(false)
  let baseSeekValue = $state(0)
  let intervalId: number | null = null

  // Dropdown states
  let loadMenuOpen = $state(false)
  let qualityMenuOpen = $state(false)
  let qualities = $state<string[]>([])
  let currentQuality = $state('auto')

  let isSynced = $derived($synced)
  let currentDelay = $derived($delay)
  let health = $derived($syncHealth)
  let hasBase = $derived(!!$baseSource)

  onMount(() => {
    intervalId = window.setInterval(updateTimes, 100)
  })

  onDestroy(() => {
    if (intervalId) clearInterval(intervalId)
  })

  function updateTimes() {
    baseTime = getBaseCurrentTime()
    baseDuration = getBaseDuration()
    basePlaying = isBasePlaying()
    if (baseDuration > 0) baseSeekValue = (baseTime / baseDuration) * 100
  }

  function handleBasePlayPause() {
    basePlaying ? syncPause(true) : syncPlay(true)
  }

  const handleBaseSeek = throttle((e: Event) => {
    const target = e.target as HTMLInputElement
    const pct = parseFloat(target.value)
    if (baseDuration > 0) syncSeek(true, (pct / 100) * baseDuration)
  }, 50)

  function handleSync() {
    enableSync()
    showToast('Videos synced', 'info', 2000)
  }

  function handleDesync() {
    disableSync()
    showToast('Sync disabled', 'info', 2000)
  }

  function handleForceResync() {
    forceResync()
    showToast('Force re-synced', 'info', 2000)
  }

  function adjustDelay(amount: number) {
    setDelay(currentDelay + amount, true)
  }

  function handleBaseVolumeChange(e: Event) {
    const target = e.target as HTMLInputElement
    setBaseVolume(parseFloat(target.value))
  }

  function handleSave() {
    saveSession()
    showToast('State saved', 'info', 2000)
  }

  function getHealthColor(h: string): string {
    switch (h) {
      case 'healthy': return 'bg-success'
      case 'correcting': return 'bg-warning'
      case 'drifting': return 'bg-error'
      default: return 'bg-text-secondary'
    }
  }

  // Load menu handlers
  function toggleLoadMenu(e: MouseEvent) {
    e.stopPropagation()
    loadMenuOpen = !loadMenuOpen
    qualityMenuOpen = false
  }

  async function handleLoadLocal(which: 'base' | 'react') {
    loadMenuOpen = false
    await promptLocalFile(which)
  }

  async function handleLoadUrl(which: 'base' | 'react') {
    loadMenuOpen = false
    await selectUrlSource(which)
  }

  function handleSubtitle() {
    loadMenuOpen = false
    selectSubtitleFile()
  }

  // Quality menu handlers
  function toggleQualityMenu(e: MouseEvent) {
    e.stopPropagation()
    if (qualityMenuOpen) {
      qualityMenuOpen = false
      return
    }
    const { baseYT, reactYT } = getYouTubePlayers()
    const player = baseYT || reactYT
    if (!player) {
      showToast('No YouTube video loaded', 'info')
      return
    }
    const levels = player.getAvailableQualities()
    currentQuality = player.getCurrentQuality()
    const order = getQualityOrder()
    qualities = ['auto', ...order.filter(q => levels.includes(q))]
    qualityMenuOpen = true
    loadMenuOpen = false
  }

  function selectQuality(quality: string) {
    const { baseYT, reactYT } = getYouTubePlayers()
    const player = baseYT || reactYT
    if (player) {
      player.setQuality(quality)
      showToast(`Quality: ${getQualityLabel(quality)}`, 'info', 1500)
    }
    qualityMenuOpen = false
  }

  function closeMenus() {
    loadMenuOpen = false
    qualityMenuOpen = false
  }
</script>

<svelte:window onclick={closeMenus} />

<div class="fixed bottom-0 left-0 right-0 z-40 bg-bg-secondary/95 backdrop-blur-sm border-t border-border">
  <!-- Single row layout: load, quality, play/pause, seek, time, delay controls, health dot, volume, sync buttons, save -->
  <div class="flex items-center gap-3 px-3 py-2">
    <!-- Load dropdown -->
    <div class="relative">
      <button
        class="px-2 py-1 text-xs font-medium bg-bg-tertiary border border-border rounded text-text-secondary hover:bg-accent hover:border-accent hover:text-text-primary transition-colors flex items-center gap-1"
        onclick={toggleLoadMenu}
        title="Load video"
        data-testid="load-btn"
      >
        Load <span class="text-[10px]">▼</span>
      </button>
      {#if loadMenuOpen}
        <div
          class="absolute bottom-full left-0 mb-1 bg-bg-secondary border border-border rounded shadow-lg overflow-hidden min-w-[140px] z-[100]"
          onclick={(e) => e.stopPropagation()}
        >
          <div class="px-3 py-1 text-[10px] text-text-secondary uppercase tracking-wide border-b border-border">Base Video</div>
          <button class="block w-full px-4 py-2 text-xs text-left text-text-secondary hover:bg-accent hover:text-text-primary transition-colors" onclick={() => handleLoadLocal('base')}>📁 Local</button>
          <button class="block w-full px-4 py-2 text-xs text-left text-text-secondary hover:bg-accent hover:text-text-primary transition-colors" onclick={() => handleLoadUrl('base')}>🔗 URL/YT</button>
          <div class="border-t border-border"></div>
          <div class="px-3 py-1 text-[10px] text-text-secondary uppercase tracking-wide border-b border-border">React Video</div>
          <button class="block w-full px-4 py-2 text-xs text-left text-text-secondary hover:bg-accent hover:text-text-primary transition-colors" onclick={() => handleLoadLocal('react')}>📁 Local</button>
          <button class="block w-full px-4 py-2 text-xs text-left text-text-secondary hover:bg-accent hover:text-text-primary transition-colors" onclick={() => handleLoadUrl('react')}>🔗 URL/YT</button>
          <div class="border-t border-border"></div>
          <button class="block w-full px-4 py-2 text-xs text-left text-text-secondary hover:bg-accent hover:text-text-primary transition-colors" onclick={handleSubtitle}>📝 Subtitles</button>
        </div>
      {/if}
    </div>

    <!-- Quality dropdown -->
    <div class="relative">
      <button
        class="px-2 py-1 text-xs font-medium bg-bg-tertiary border border-border rounded text-text-secondary hover:bg-accent hover:border-accent hover:text-text-primary transition-colors"
        onclick={toggleQualityMenu}
        title="YouTube quality"
        data-testid="quality-btn"
      >
        Q
      </button>
      {#if qualityMenuOpen}
        <div
          class="absolute bottom-full left-0 mb-1 bg-bg-secondary border border-border rounded shadow-lg overflow-hidden min-w-[120px] z-[100]"
          onclick={(e) => e.stopPropagation()}
        >
          {#each qualities as quality}
            <button
              class="block w-full px-4 py-2 text-xs text-left hover:bg-accent hover:text-text-primary transition-colors"
              class:bg-accent={isQualityActive(quality, currentQuality)}
              class:text-text-primary={isQualityActive(quality, currentQuality)}
              class:text-text-secondary={!isQualityActive(quality, currentQuality)}
              onclick={() => selectQuality(quality)}
            >
              {getQualityLabel(quality)}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Separator -->
    <div class="w-px h-6 bg-border"></div>

    <!-- Base Playback: play/pause -->
    <button
      class="w-8 h-8 flex items-center justify-center bg-bg-tertiary border border-border rounded text-text-primary hover:bg-accent hover:border-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      onclick={handleBasePlayPause}
      disabled={!hasBase}
      title={basePlaying ? 'Pause base' : 'Play base'}
      data-testid="base-play-pause"
    >
      {basePlaying ? '⏸' : '▶'}
    </button>

    <!-- Base Playback: seek bar -->
    <div class="flex-1 min-w-0">
      <input
        type="range"
        min="0"
        max="100"
        step="0.1"
        value={baseSeekValue}
        oninput={handleBaseSeek}
        disabled={!hasBase}
        data-testid="base-seek"
        class="w-full h-1 bg-border rounded-full appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
      />
    </div>

    <!-- Base Playback: time display -->
    <span class="text-xs text-text-secondary font-mono whitespace-nowrap" data-testid="base-time">
      {formatTime(baseTime)} / {formatTime(baseDuration)}
    </span>

    <!-- Separator -->
    <div class="w-px h-6 bg-border"></div>

    <!-- Delay controls: minus, display, health dot, plus -->
    <div class="flex items-center gap-1">
      <button
        class="w-6 h-6 flex items-center justify-center bg-bg-tertiary border border-border rounded text-text-secondary hover:bg-accent hover:text-text-primary transition-colors text-xs"
        onclick={() => adjustDelay(-0.1)}
        title="Decrease delay (-0.1s)"
        data-testid="delay-minus"
      >
        −
      </button>
      <div class="flex items-center gap-1 px-2 py-1 bg-bg-tertiary border border-border rounded min-w-[70px] justify-center">
        <span class="text-xs font-mono" class:text-success={isSynced} class:text-text-secondary={!isSynced} data-testid="delay-display">
          {formatTimeWithDecimal(currentDelay)}
        </span>
      </div>
      <div class="w-2 h-2 rounded-full {getHealthColor(health)}" title="Sync health: {health || 'none'}" data-testid="health-dot"></div>
      <button
        class="w-6 h-6 flex items-center justify-center bg-bg-tertiary border border-border rounded text-text-secondary hover:bg-accent hover:text-text-primary transition-colors text-xs"
        onclick={() => adjustDelay(0.1)}
        title="Increase delay (+0.1s)"
        data-testid="delay-plus"
      >
        +
      </button>
    </div>

    <!-- Separator -->
    <div class="w-px h-6 bg-border"></div>

    <!-- Base Volume -->
    <div class="flex items-center gap-2">
      <span class="text-xs text-text-secondary">🔊</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={$baseVolume}
        oninput={handleBaseVolumeChange}
        data-testid="base-volume"
        class="w-16 h-1 bg-border rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-text-secondary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
      />
    </div>

    <!-- Separator -->
    <div class="w-px h-6 bg-border"></div>

    <!-- Sync buttons -->
    <div class="flex items-center gap-1">
      <button
        class="px-2 py-1 text-xs font-medium bg-bg-tertiary border border-border rounded hover:bg-accent hover:border-accent hover:text-text-primary transition-colors"
        class:bg-accent={isSynced}
        class:border-accent={isSynced}
        class:text-text-primary={isSynced}
        onclick={handleSync}
        title="Sync videos (S)"
        data-testid="sync-btn"
      >
        S
      </button>
      <button
        class="px-2 py-1 text-xs font-medium bg-bg-tertiary border border-border rounded text-text-secondary hover:bg-accent hover:border-accent hover:text-text-primary transition-colors"
        onclick={handleDesync}
        title="Disable sync (D)"
        data-testid="desync-btn"
      >
        D
      </button>
      <button
        class="px-2 py-1 text-xs font-medium bg-bg-tertiary border border-border rounded text-text-secondary hover:bg-accent hover:border-accent hover:text-text-primary transition-colors"
        onclick={handleForceResync}
        title="Force re-sync (F)"
        data-testid="force-btn"
      >
        FR
      </button>
    </div>

    <!-- Save button -->
    <button
      class="px-2 py-1 text-xs font-medium bg-bg-tertiary border border-border rounded text-text-secondary hover:bg-accent hover:border-accent hover:text-text-primary transition-colors"
      onclick={handleSave}
      title="Save state"
      data-testid="save-btn"
    >
      💾
    </button>
  </div>
</div>

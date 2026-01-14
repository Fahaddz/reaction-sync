<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import {
    synced,
    delay,
    syncHealth,
    baseVolume,
    reactVolume,
    userSpeed,
    baseSource,
    reactSource
  } from '../stores.ts'
  import {
    syncPlay,
    syncPause,
    syncSeek,
    enableSync,
    disableSync,
    forceResync,
    setDelay,
    setBaseVolume,
    setReactVolume,
    setUserSpeed,
    getBaseCurrentTime,
    getBaseDuration,
    getReactCurrentTime,
    getReactDuration,
    isBasePlaying,
    isReactPlaying
  } from '../sync.ts'
  import { formatTime, formatTimeWithDecimal, throttle } from '../utils.ts'
  import { showToast } from '../stores.ts'

  const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2]

  let baseTime = $state(0)
  let baseDuration = $state(0)
  let reactTime = $state(0)
  let reactDuration = $state(0)
  let basePlaying = $state(false)
  let reactPlaying = $state(false)
  let baseSeekValue = $state(0)
  let reactSeekValue = $state(0)
  let showSpeedMenu = $state(false)
  let intervalId: number | null = null

  let isSynced = $derived($synced)
  let currentDelay = $derived($delay)
  let health = $derived($syncHealth)
  let currentSpeed = $derived($userSpeed)
  let hasBase = $derived(!!$baseSource)
  let hasReact = $derived(!!$reactSource)

  onMount(() => {
    intervalId = window.setInterval(updateTimes, 100)
  })

  onDestroy(() => {
    if (intervalId) clearInterval(intervalId)
  })

  function updateTimes() {
    baseTime = getBaseCurrentTime()
    baseDuration = getBaseDuration()
    reactTime = getReactCurrentTime()
    reactDuration = getReactDuration()
    basePlaying = isBasePlaying()
    reactPlaying = isReactPlaying()
    if (baseDuration > 0) baseSeekValue = (baseTime / baseDuration) * 100
    if (reactDuration > 0) reactSeekValue = (reactTime / reactDuration) * 100
  }

  function handleBasePlayPause() {
    basePlaying ? syncPause(true) : syncPlay(true)
  }

  function handleReactPlayPause() {
    reactPlaying ? syncPause(false) : syncPlay(false)
  }

  const handleBaseSeek = throttle((e: Event) => {
    const target = e.target as HTMLInputElement
    const pct = parseFloat(target.value)
    if (baseDuration > 0) syncSeek(true, (pct / 100) * baseDuration)
  }, 50)

  const handleReactSeek = throttle((e: Event) => {
    const target = e.target as HTMLInputElement
    const pct = parseFloat(target.value)
    if (reactDuration > 0) syncSeek(false, (pct / 100) * reactDuration)
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

  function handleDelayChange(e: Event) {
    const target = e.target as HTMLInputElement
    setDelay(parseFloat(target.value), true)
  }

  function adjustDelay(amount: number) {
    setDelay(currentDelay + amount, true)
  }

  function handleBaseVolumeChange(e: Event) {
    const target = e.target as HTMLInputElement
    setBaseVolume(parseFloat(target.value))
  }

  function handleReactVolumeChange(e: Event) {
    const target = e.target as HTMLInputElement
    setReactVolume(parseFloat(target.value))
  }

  function handleSpeedSelect(speed: number) {
    setUserSpeed(speed)
    showSpeedMenu = false
    showToast(`Speed: ${speed}x`, 'info', 1500)
  }

  function toggleSpeedMenu() {
    showSpeedMenu = !showSpeedMenu
  }

  function closeSpeedMenu() {
    showSpeedMenu = false
  }

  function getHealthColor(h: string): string {
    switch (h) {
      case 'healthy': return 'bg-success'
      case 'correcting': return 'bg-warning'
      case 'drifting': return 'bg-error'
      default: return 'bg-text-secondary'
    }
  }
</script>

<svelte:window onclick={closeSpeedMenu} />

<div class="fixed bottom-0 left-0 right-0 z-40 bg-bg-secondary/95 backdrop-blur-sm border-t border-border">
  <div class="flex flex-col gap-2 p-3">
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <button
          class="w-8 h-8 flex items-center justify-center bg-bg-tertiary border border-border rounded text-text-primary hover:bg-accent hover:border-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={handleBasePlayPause}
          disabled={!hasBase}
          title={basePlaying ? 'Pause base' : 'Play base'}
        >
          {basePlaying ? '⏸' : '▶'}
        </button>
        <div class="flex-1 min-w-0">
          <input
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={baseSeekValue}
            oninput={handleBaseSeek}
            disabled={!hasBase}
            class="w-full h-1 bg-border rounded-full appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
          />
        </div>
        <span class="text-xs text-text-secondary font-mono whitespace-nowrap">
          {formatTime(baseTime)} / {formatTime(baseDuration)}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-xs text-text-secondary">🔊</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={$baseVolume}
          oninput={handleBaseVolumeChange}
          class="w-16 h-1 bg-border rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-text-secondary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>
    </div>

    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <button
          class="w-8 h-8 flex items-center justify-center bg-bg-tertiary border border-border rounded text-text-primary hover:bg-accent hover:border-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          onclick={handleReactPlayPause}
          disabled={!hasReact}
          title={reactPlaying ? 'Pause react' : 'Play react'}
        >
          {reactPlaying ? '⏸' : '⏵'}
        </button>
        <div class="flex-1 min-w-0">
          <input
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={reactSeekValue}
            oninput={handleReactSeek}
            disabled={!hasReact}
            class="w-full h-1 bg-border rounded-full appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
          />
        </div>
        <span class="text-xs text-text-secondary font-mono whitespace-nowrap">
          {formatTime(reactTime)}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-xs text-text-secondary">🔊</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={$reactVolume}
          oninput={handleReactVolumeChange}
          class="w-16 h-1 bg-border rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-text-secondary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>
    </div>

    <div class="flex items-center justify-between gap-4 pt-1 border-t border-border/50">
      <div class="flex items-center gap-2">
        <button
          class="px-3 py-1.5 text-xs font-medium bg-bg-tertiary border border-border rounded hover:bg-accent hover:border-accent hover:text-text-primary transition-colors"
          class:bg-accent={isSynced}
          class:border-accent={isSynced}
          class:text-text-primary={isSynced}
          onclick={handleSync}
          title="Sync videos (S)"
        >
          Sync
        </button>
        <button
          class="px-3 py-1.5 text-xs font-medium bg-bg-tertiary border border-border rounded text-text-secondary hover:bg-accent hover:border-accent hover:text-text-primary transition-colors"
          onclick={handleDesync}
          title="Disable sync (D)"
        >
          Desync
        </button>
        <button
          class="px-3 py-1.5 text-xs font-medium bg-bg-tertiary border border-border rounded text-text-secondary hover:bg-accent hover:border-accent hover:text-text-primary transition-colors"
          onclick={handleForceResync}
          title="Force re-sync (F)"
        >
          Force
        </button>
        <div class="flex items-center gap-1 ml-2">
          <div class="w-2 h-2 rounded-full {getHealthColor(health)}" title="Sync health: {health || 'none'}"></div>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1">
          <button
            class="w-6 h-6 flex items-center justify-center bg-bg-tertiary border border-border rounded text-text-secondary hover:bg-accent hover:text-text-primary transition-colors text-xs"
            onclick={() => adjustDelay(-0.1)}
            title="Decrease delay"
          >
            −
          </button>
          <div class="flex items-center gap-1 px-2 py-1 bg-bg-tertiary border border-border rounded min-w-[70px] justify-center">
            <span class="text-xs font-mono" class:text-success={isSynced} class:text-text-secondary={!isSynced}>
              {formatTimeWithDecimal(currentDelay)}
            </span>
          </div>
          <button
            class="w-6 h-6 flex items-center justify-center bg-bg-tertiary border border-border rounded text-text-secondary hover:bg-accent hover:text-text-primary transition-colors text-xs"
            onclick={() => adjustDelay(0.1)}
            title="Increase delay"
          >
            +
          </button>
        </div>

        <div class="relative">
          <button
            class="px-3 py-1.5 text-xs font-medium bg-bg-tertiary border border-border rounded text-text-secondary hover:bg-accent hover:border-accent hover:text-text-primary transition-colors flex items-center gap-1"
            onclick={(e) => { e.stopPropagation(); toggleSpeedMenu() }}
            title="Playback speed"
          >
            {currentSpeed}x
            <span class="text-[10px]">▼</span>
          </button>
          {#if showSpeedMenu}
            <div 
              class="absolute bottom-full left-0 mb-1 bg-bg-secondary border border-border rounded shadow-lg overflow-hidden"
              onclick={(e) => e.stopPropagation()}
            >
              {#each SPEED_OPTIONS as speed}
                <button
                  class="block w-full px-4 py-1.5 text-xs text-left hover:bg-accent hover:text-text-primary transition-colors"
                  class:bg-accent={currentSpeed === speed}
                  class:text-text-primary={currentSpeed === speed}
                  class:text-text-secondary={currentSpeed !== speed}
                  onclick={() => handleSpeedSelect(speed)}
                >
                  {speed}x
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

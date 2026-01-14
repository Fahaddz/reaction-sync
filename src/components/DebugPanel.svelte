<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { slide } from 'svelte/transition'
  import { debugVisible, syncStats, synced, syncHealth } from '../lib/stores.ts'

  let intervalId: number | null = null
  let stats = $derived($syncStats)
  let isVisible = $derived($debugVisible)
  let isSynced = $derived($synced)
  let health = $derived($syncHealth)

  onMount(() => {
    intervalId = window.setInterval(() => {
      if ($debugVisible) {
        syncStats.update(s => s)
      }
    }, 100)
  })

  onDestroy(() => {
    if (intervalId) {
      clearInterval(intervalId)
    }
  })

  function formatDrift(drift: number): string {
    const ms = Math.round(drift * 1000)
    const sign = ms >= 0 ? '+' : ''
    return `${sign}${ms}ms`
  }

  function formatRate(rate: number): string {
    return rate.toFixed(3) + 'x'
  }

  function formatThreshold(threshold: number): string {
    return Math.round(threshold * 1000) + 'ms'
  }

  function getHealthColor(h: string): string {
    switch (h) {
      case 'healthy': return 'text-success'
      case 'correcting': return 'text-warning'
      case 'drifting': return 'text-error'
      default: return 'text-text-secondary'
    }
  }

  function getThresholdModeLabel(mode: string): string {
    switch (mode) {
      case 'tight': return 'Tight (Local)'
      case 'loose': return 'Loose (YouTube)'
      case 'adaptive': return 'Adaptive'
      default: return mode
    }
  }
</script>

{#if isVisible}
  <div 
    class="fixed top-12 right-2 z-[999] bg-bg-secondary/95 backdrop-blur-sm border border-border rounded-lg p-3 font-mono text-xs min-w-48 shadow-lg"
    transition:slide={{ duration: 200 }}
  >
    <div class="text-text-secondary mb-2 font-semibold text-[10px] uppercase tracking-wider">Sync Debug</div>
    
    <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      <span class="text-text-secondary">Status:</span>
      <span class={isSynced ? 'text-success' : 'text-text-secondary'}>
        {isSynced ? 'Synced' : 'Not Synced'}
      </span>

      <span class="text-text-secondary">Health:</span>
      <span class={getHealthColor(health)}>
        {health || '—'}
      </span>

      <span class="text-text-secondary">Drift:</span>
      <span class="text-text-primary">{formatDrift(stats.drift)}</span>

      <span class="text-text-secondary">Rate:</span>
      <span class="text-text-primary">{formatRate(stats.rate)}</span>

      <span class="text-text-secondary">Threshold:</span>
      <span class="text-text-primary">{formatThreshold(stats.currentThreshold)}</span>

      <span class="text-text-secondary">Mode:</span>
      <span class="text-text-primary">{getThresholdModeLabel(stats.thresholdMode)}</span>

      <span class="text-text-secondary">Base Buffer:</span>
      <span class={stats.baseBuffering ? 'text-warning' : 'text-text-secondary'}>
        {stats.baseBuffering ? 'Buffering' : 'OK'}
      </span>

      <span class="text-text-secondary">React Buffer:</span>
      <span class={stats.reactBuffering ? 'text-warning' : 'text-text-secondary'}>
        {stats.reactBuffering ? 'Buffering' : 'OK'}
      </span>

      {#if stats.bufferPauseActive}
        <span class="text-text-secondary">Buffer Pause:</span>
        <span class="text-warning">Active</span>
      {/if}
    </div>
  </div>
{/if}

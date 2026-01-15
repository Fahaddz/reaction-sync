<script lang="ts">
  import { fade, scale } from 'svelte/transition'
  import { loadLastSession, clearSessions } from '../lib/storage.ts'
  import { showToast, tipsVisible, closeTipsScreen } from '../lib/stores.ts'

  let visible = $derived($tipsVisible)

  const shortcuts = [
    { key: 'S', desc: 'Sync videos' },
    { key: 'D', desc: 'Desync videos' },
    { key: 'F', desc: 'Force re-sync' },
    { key: 'Space', desc: 'Play/Pause' },
    { key: '←/→', desc: 'Seek ±5 seconds' },
    { key: '↑/↓', desc: 'Volume (Shift for base)' },
    { key: 'PgUp/PgDn', desc: 'Delay ±1 second' },
    { key: ',/.', desc: 'Delay micro-adjust (±33ms)' }
  ]

  function close() {
    closeTipsScreen()
  }

  async function handleLoadSession() {
    await loadLastSession()
    close()
  }

  async function handleClearStorage() {
    await clearSessions()
    showToast('Storage cleared', 'info', 2000)
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close()
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close()
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if visible}
  <div
    class="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-sm"
    transition:fade={{ duration: 200 }}
    onclick={handleBackdropClick}
    role="dialog"
    aria-modal="true"
    aria-labelledby="tips-title"
  >
    <div
      class="bg-bg-secondary border border-border rounded-lg shadow-2xl max-w-md w-full mx-4 overflow-hidden"
      transition:scale={{ duration: 200, start: 0.95 }}
    >
      <div class="p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 id="tips-title" class="text-lg font-semibold text-text-primary">Reaction Sync</h2>
          <button
            class="w-8 h-8 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded transition-colors"
            onclick={close}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p class="text-sm text-text-secondary mb-6">
          Sync two videos with adjustable delay. Load a base video and a reaction video, then press S to sync.
        </p>

        <div class="mb-6">
          <h3 class="text-sm font-medium text-text-primary mb-3">Keyboard Shortcuts</h3>
          <div class="grid grid-cols-2 gap-2">
            {#each shortcuts as { key, desc }}
              <div class="flex items-center gap-2 text-sm">
                <kbd class="px-2 py-0.5 bg-bg-tertiary border border-border rounded text-xs font-mono text-text-primary min-w-[60px] text-center">
                  {key}
                </kbd>
                <span class="text-text-secondary">{desc}</span>
              </div>
            {/each}
          </div>
        </div>

        <div class="flex gap-3 pt-4 border-t border-border">
          <button
            class="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-primary rounded text-sm font-medium transition-colors"
            onclick={handleLoadSession}
          >
            Load Last
          </button>
          <button
            class="px-4 py-2 bg-bg-tertiary border border-border hover:bg-error/20 hover:border-error text-text-secondary hover:text-error rounded text-sm transition-colors"
            onclick={handleClearStorage}
          >
            Clear Saved
          </button>
          <button
            class="px-4 py-2 bg-bg-tertiary border border-border hover:bg-bg-secondary text-text-secondary hover:text-text-primary rounded text-sm transition-colors"
            onclick={close}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

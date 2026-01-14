<script lang="ts">
  import { fade, scale } from 'svelte/transition'
  import { formatTime } from '../lib/utils.ts'
  import { resumePromptData } from '../lib/stores.ts'

  let data = $derived($resumePromptData)

  function handleResume() {
    data.onResume()
    resumePromptData.update(d => ({ ...d, visible: false }))
  }

  function handleDismiss() {
    resumePromptData.update(d => ({ ...d, visible: false }))
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) handleDismiss()
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!data.visible) return
    if (e.key === 'Escape') handleDismiss()
    if (e.key === 'Enter') handleResume()
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if data.visible}
  <div
    class="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-sm"
    transition:fade={{ duration: 200 }}
    onclick={handleBackdropClick}
    role="dialog"
    aria-modal="true"
    aria-labelledby="resume-title"
  >
    <div
      class="bg-bg-secondary border border-border rounded-lg shadow-2xl max-w-sm w-full mx-4 overflow-hidden"
      transition:scale={{ duration: 200, start: 0.95 }}
    >
      <div class="p-6">
        <h2 id="resume-title" class="text-lg font-semibold text-text-primary mb-2">
          Resume Session?
        </h2>
        
        <p class="text-sm text-text-secondary mb-4">
          Found a previous session for these videos.
        </p>

        <div class="bg-bg-tertiary border border-border rounded p-3 mb-6">
          <div class="flex justify-between items-center text-sm mb-2">
            <span class="text-text-secondary">Position</span>
            <span class="font-mono text-text-primary">{formatTime(data.position)}</span>
          </div>
          <div class="flex justify-between items-center text-sm">
            <span class="text-text-secondary">Delay</span>
            <span class="font-mono text-text-primary">{data.delay >= 0 ? '+' : ''}{data.delay.toFixed(2)}s</span>
          </div>
        </div>

        <div class="flex gap-3">
          <button
            class="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-primary rounded text-sm font-medium transition-colors"
            onclick={handleResume}
          >
            Resume
          </button>
          <button
            class="flex-1 px-4 py-2 bg-bg-tertiary border border-border hover:bg-bg-primary text-text-secondary rounded text-sm transition-colors"
            onclick={handleDismiss}
          >
            Start Fresh
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

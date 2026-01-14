<script lang="ts">
  import { promptLocalFile, selectUrlSource, selectSubtitleFile } from '../video-loading.ts'

  interface Props {
    which: 'base' | 'react'
    label?: string
  }

  let { which, label = which === 'base' ? 'Base' : 'React' }: Props = $props()

  let isOpen = $state(false)

  function toggleMenu(e: MouseEvent) {
    e.stopPropagation()
    isOpen = !isOpen
  }

  function closeMenu() {
    isOpen = false
  }

  async function handleLocal() {
    isOpen = false
    await promptLocalFile(which)
  }

  async function handleLink() {
    isOpen = false
    await selectUrlSource(which)
  }

  function handleSubtitle() {
    isOpen = false
    selectSubtitleFile()
  }
</script>

<svelte:window onclick={closeMenu} />

<div class="relative">
  <button
    class="px-3 py-1.5 text-xs font-medium bg-bg-tertiary border border-border rounded text-text-secondary hover:bg-accent hover:border-accent hover:text-text-primary transition-colors flex items-center gap-1"
    onclick={toggleMenu}
    title="Select {label} video source"
  >
    {label}
    <span class="text-[10px]">▼</span>
  </button>

  {#if isOpen}
    <div
      class="absolute bottom-full left-0 mb-1 bg-bg-secondary border border-border rounded shadow-lg overflow-hidden min-w-[120px] z-[100]"
      onclick={(e) => e.stopPropagation()}
    >
      <button
        class="block w-full px-4 py-2 text-xs text-left text-text-secondary hover:bg-accent hover:text-text-primary transition-colors"
        onclick={handleLocal}
      >
        📁 Local File
      </button>
      <button
        class="block w-full px-4 py-2 text-xs text-left text-text-secondary hover:bg-accent hover:text-text-primary transition-colors"
        onclick={handleLink}
      >
        🔗 URL / YouTube
      </button>
      {#if which === 'base'}
        <div class="border-t border-border"></div>
        <button
          class="block w-full px-4 py-2 text-xs text-left text-text-secondary hover:bg-accent hover:text-text-primary transition-colors"
          onclick={handleSubtitle}
        >
          📝 Subtitles
        </button>
      {/if}
    </div>
  {/if}
</div>

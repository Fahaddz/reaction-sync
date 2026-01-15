<script lang="ts">
  import { getYouTubePlayers } from '../lib/video-loading.ts'
  import { getQualityLabel, getQualityOrder } from '../lib/youtube.ts'
  import { showToast } from '../lib/stores.ts'
  import { isQualityActive } from '../lib/utils.ts'

  let isOpen = $state(false)
  let qualities = $state<string[]>([])
  let currentQuality = $state('auto')
  let menuElement: HTMLDivElement
  let buttonElement: HTMLButtonElement
  let menuStyle = $state('')

  function toggleMenu(e: MouseEvent) {
    e.stopPropagation()
    if (isOpen) {
      isOpen = false
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
    isOpen = true
    requestAnimationFrame(() => positionMenu())
  }

  function positionMenu() {
    if (!buttonElement || !menuElement) return
    const btnRect = buttonElement.getBoundingClientRect()
    const menuRect = menuElement.getBoundingClientRect()
    const spaceAbove = btnRect.top
    const spaceBelow = window.innerHeight - btnRect.bottom
    let left = Math.max(8, Math.min(btnRect.left, window.innerWidth - menuRect.width - 8))
    let top: number | null = null
    let bottom: number | null = null
    if (spaceAbove >= menuRect.height + 8) {
      top = btnRect.top - menuRect.height - 8
    } else if (spaceBelow >= menuRect.height + 8) {
      top = btnRect.bottom + 8
    } else {
      bottom = 8
    }
    menuStyle = `left: ${left}px; ${top !== null ? `top: ${top}px` : `bottom: ${bottom}px`}`
  }

  function selectQuality(quality: string) {
    const { baseYT, reactYT } = getYouTubePlayers()
    const player = baseYT || reactYT
    if (player) {
      player.setQuality(quality)
      showToast(`Quality: ${getQualityLabel(quality)}`, 'info', 1500)
    }
    isOpen = false
  }

  function closeMenu() {
    isOpen = false
  }
</script>

<svelte:window onclick={closeMenu} />

<div class="relative">
  <button
    bind:this={buttonElement}
    class="px-3 py-1.5 text-xs font-medium bg-bg-tertiary border border-border rounded text-text-secondary hover:bg-accent hover:border-accent hover:text-text-primary transition-colors"
    onclick={toggleMenu}
    title="YouTube quality"
  >
    Quality
  </button>

  {#if isOpen}
    <div
      bind:this={menuElement}
      class="fixed z-[100] bg-bg-secondary border border-border rounded shadow-lg overflow-hidden min-w-[140px]"
      style={menuStyle}
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

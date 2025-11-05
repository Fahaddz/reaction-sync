<script lang="ts">
  import { getQualityLabel } from '$lib/services/youtube';

  export let qualities: string[] = [];
  export let currentQuality: string = 'auto';
  export let onSelect: (quality: string) => void = () => {};
  export let onClose: () => void = () => {};
  export let position: { bottom: number; left: number } = { bottom: 0, left: 0 };
</script>

{#if qualities.length > 0}
  <div class="quality-menu" style="bottom: {position.bottom}px; left: {position.left}px;">
    {#each qualities as quality}
      <button
        class="quality-option"
        class:active={quality === currentQuality || (quality === 'auto' && currentQuality === 'default')}
        on:click={() => onSelect(quality)}
      >
        {getQualityLabel(quality)}
      </button>
    {/each}
    <hr>
    <button class="quality-option" on:click={onClose}>Close</button>
  </div>
{/if}

<style>
  .quality-menu {
    position: absolute;
    background: rgba(0, 0, 0, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 5px;
    display: flex;
    flex-direction: column;
    width: 150px;
    max-height: 300px;
    overflow-y: auto;
    z-index: 1000;
  }
  .quality-option {
    padding: 8px 12px;
    color: white;
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background 0.2s;
    font-size: 14px;
  }
  .quality-option:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }
  .quality-option.active {
    background-color: rgba(255, 0, 0, 0.3);
  }
  hr {
    border-color: rgba(255, 255, 255, 0.2);
    margin: 5px 0;
  }
</style>


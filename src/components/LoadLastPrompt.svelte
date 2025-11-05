<script lang="ts">
  import type { ProgressRecord } from '$lib/types/progress';

  export let record: ProgressRecord | null = null;
  export let onChooseBase: () => void = () => {};
  export let onChooseReact: () => void = () => {};
  export let onClose: () => void = () => {};

  $: needBase = record?.baseMeta?.type === 'file';
  $: needReact = record?.reactMeta?.type === 'file';
</script>

{#if record && (needBase || needReact)}
  <div class="overlay">
    <div class="modal">
      <div class="title">Select these local files now:</div>
      <div class="files">
        {#if needBase}
          <div>Base: {record.baseMeta?.name || '(unknown)'}</div>
        {/if}
        {#if needBase && needReact}
          <br>
        {/if}
        {#if needReact}
          <div>React: {record.reactMeta?.name || '(unknown)'}</div>
        {/if}
      </div>
      <div class="buttons">
        {#if needBase}
          <button on:click={onChooseBase}>Choose Base</button>
        {/if}
        {#if needReact}
          <button on:click={onChooseReact}>Choose React</button>
        {/if}
        <button on:click={onClose}>Close</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
  }
  .modal {
    background: #111;
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    max-width: 90vw;
    padding: 12px;
    font-size: 13px;
    line-height: 1.4;
    text-align: left;
  }
  .title {
    font-weight: 600;
    margin-bottom: 8px;
  }
  .files {
    margin-bottom: 10px;
  }
  .buttons {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 10px;
  }
  button {
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: #2d3e;
    color: #fff;
    cursor: pointer;
  }
</style>


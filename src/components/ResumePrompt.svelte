<script lang="ts">
  import type { ProgressRecord } from '$lib/types/progress';
  import { secondsToTime } from '$lib/utils/time';

  export let record: ProgressRecord | null = null;
  export let onResume: () => void = () => {};
  export let onStartNew: () => void = () => {};

  function msToTime(ms: number): string {
    const s = Math.floor(ms);
    const m = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    return `${m}:${ss}`;
  }
</script>

{#if record}
  <div class="overlay">
    <div class="modal">
      <div class="title">Resume where you left off?</div>
      <div class="message">
        Last time at {msToTime(record.baseTime)} with delay {record.delay >= 0 ? '+' : ''}{record.delay.toFixed(1)}s
      </div>
      <div class="buttons">
        <button on:click={onStartNew}>Start New</button>
        <button class="resume" on:click={onResume}>Resume</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .modal {
    background: rgba(20, 20, 28, 0.95);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    min-width: 260px;
    max-width: 90vw;
    padding: 14px;
    font-size: 13px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
  }
  .title {
    font-weight: 600;
    margin-bottom: 8px;
  }
  .message {
    opacity: 0.9;
    margin-bottom: 12px;
  }
  .buttons {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  button {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 6px 10px;
    border-radius: 6px;
    cursor: pointer;
  }
  .resume {
    background: #2e7d32;
  }
</style>


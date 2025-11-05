<script lang="ts">
  import { syncState, setDelay } from '$lib/stores/sync';
  import { secondsToTime } from '$lib/utils/time';

  let holdInterval: ReturnType<typeof setInterval> | null = null;
  let holdStartTime = 0;

  function adjustDelay(direction: number) {
    syncState.update(s => {
      const currentDelay = s.delay;
      let increment = 0.1;
      if (holdStartTime > 0) {
        const holdTime = Date.now() - holdStartTime;
        if (holdTime > 2000) {
          increment = 1.0;
        } else if (holdTime > 1000) {
          increment = 0.5;
        }
      }
      const change = direction * increment;
      const newDelay = currentDelay + change;
      setDelay(newDelay);
      return { ...s, delay: newDelay };
    });
  }

  function startHolding(direction: number) {
    holdStartTime = Date.now();
    adjustDelay(direction);
    holdInterval = setInterval(() => adjustDelay(direction), 100);
  }

  function stopHolding() {
    holdStartTime = 0;
    if (holdInterval) {
      clearInterval(holdInterval);
      holdInterval = null;
    }
  }
</script>

<div class="delay-controls">
  <span class="label">D:</span>
  <button
    class="decrease"
    on:mousedown={() => startHolding(-1)}
    on:mouseup={stopHolding}
    on:mouseleave={stopHolding}
    on:touchstart|preventDefault={() => startHolding(-1)}
    on:touchend|preventDefault={stopHolding}
  >-</button>
  <span class="delay-value">
    {$syncState.delay >= 0 ? '+' : ''}{secondsToTime(Math.abs($syncState.delay), 10)}
  </span>
  <button
    class="increase"
    on:mousedown={() => startHolding(1)}
    on:mouseup={stopHolding}
    on:mouseleave={stopHolding}
    on:touchstart|preventDefault={() => startHolding(1)}
    on:touchend|preventDefault={stopHolding}
  >+</button>
</div>

<style>
  .delay-controls {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .label {
    color: #b0b0b0;
    font-size: 9px;
  }
  .delay-value {
    color: #e0e0e0;
    min-width: 45px;
    text-align: center;
    font-size: 9px;
    font-family: 'Courier New', monospace;
  }
  button {
    padding: 2px 6px;
    font-size: 10px;
    min-width: 18px;
    height: 24px;
    margin: 0 1px;
    background: rgba(45, 45, 55, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: #e0e0e0;
    cursor: pointer;
  }
</style>


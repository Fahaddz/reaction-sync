<script lang="ts">
  import { onMount } from 'svelte';
  import { syncState, syncThreshold, syncInterval } from '$lib/stores/sync';
  import { baseVideo, reactVideo } from '$lib/stores/video';

  let show = false;
  let debugData: any = {};

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    show = params.get('debug') === 'true';
    
    const unsubscribe = [
      syncState.subscribe(s => {
        debugData.sync = {
          isSynced: s.isSynced,
          delay: s.delay.toFixed(2),
          isSeeking: s.isSeeking,
          isUserInteracting: s.isUserInteracting
        };
      }),
      syncThreshold.subscribe(t => {
        debugData.threshold = t.toFixed(2);
      }),
      syncInterval.subscribe(i => {
        debugData.interval = i;
      }),
      baseVideo.subscribe(v => {
        debugData.base = {
          time: v.currentTime.toFixed(2),
          duration: v.duration.toFixed(2),
          state: v.state
        };
      }),
      reactVideo.subscribe(v => {
        debugData.react = {
          time: v.currentTime.toFixed(2),
          duration: v.duration.toFixed(2),
          state: v.state
        };
      })
    ];

    return () => unsubscribe.forEach(u => u());
  });
</script>

{#if show}
  <div class="debug-overlay">
    <div>Sync: {debugData.sync?.isSynced ? 'ON' : 'OFF'}</div>
    <div>Delay: {debugData.sync?.delay}s</div>
    <div>Threshold: {debugData.threshold}s</div>
    <div>Interval: {debugData.interval}ms</div>
    <div>Base: {debugData.base?.time}s / {debugData.base?.duration}s ({debugData.base?.state})</div>
    <div>React: {debugData.react?.time}s / {debugData.react?.duration}s ({debugData.react?.state})</div>
    <div>Seeking: {debugData.sync?.isSeeking ? 'YES' : 'NO'}</div>
    <div>User Interacting: {debugData.sync?.isUserInteracting ? 'YES' : 'NO'}</div>
  </div>
{/if}

<style>
  .debug-overlay {
    position: fixed;
    bottom: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.7);
    color: #0f0;
    font-size: 12px;
    padding: 5px;
    max-width: 200px;
    max-height: 150px;
    overflow: auto;
    z-index: 9999;
    font-family: monospace;
  }
</style>


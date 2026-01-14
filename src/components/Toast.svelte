<script lang="ts">
  import { fly, fade } from 'svelte/transition'
  import { flip } from 'svelte/animate'
  import { toasts } from '../stores.ts'
</script>

<div class="fixed bottom-16 left-1/2 -translate-x-1/2 z-[400] flex flex-col gap-2 pointer-events-none">
  {#each $toasts as toast (toast.id)}
    <div
      class="bg-bg-tertiary border border-border text-text-primary px-5 py-2.5 rounded-lg text-sm pointer-events-auto
             {toast.type === 'error' ? 'border-error' : ''}
             {toast.type === 'warning' ? 'border-warning' : ''}"
      in:fly={{ y: 20, duration: 300 }}
      out:fade={{ duration: 200 }}
      animate:flip={{ duration: 200 }}
    >
      {toast.message}
    </div>
  {/each}
</div>

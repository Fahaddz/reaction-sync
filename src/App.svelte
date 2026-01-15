<script lang="ts">
  import { onMount } from 'svelte'
  import { initKeyboardShortcuts, trackContainerFocus } from './lib/keyboard.ts'
  import Toast from './components/Toast.svelte'
  import DebugPanel from './components/DebugPanel.svelte'
  import BaseVideo from './components/BaseVideo.svelte'
  import ReactOverlay from './components/ReactOverlay.svelte'
  import Controls from './components/Controls.svelte'
  import TipsScreen from './components/TipsScreen.svelte'
  import ResumePrompt from './components/ResumePrompt.svelte'
  import { debugVisible, subscribe } from './lib/stores.ts'
  import { setBaseElements, setReactElements } from './lib/video-loading.ts'
  import { startAutoSave, onSourceChange } from './lib/storage.ts'

  let baseVideoComponent: BaseVideo
  let reactOverlayComponent: ReactOverlay

  onMount(() => {
    initKeyboardShortcuts()
    trackContainerFocus()
    
    if (baseVideoComponent) {
      const baseVideo = baseVideoComponent.getVideoElement()
      const baseYT = baseVideoComponent.getYouTubeContainer()
      if (baseVideo && baseYT) {
        baseYT.id = 'videoBaseYoutube'
        setBaseElements(baseVideo, baseYT)
      }
    }
    
    if (reactOverlayComponent) {
      const reactVideo = reactOverlayComponent.getVideoElement()
      const reactYT = reactOverlayComponent.getYouTubeContainer()
      if (reactVideo && reactYT) {
        reactYT.id = 'videoReactYoutube'
        setReactElements(reactVideo, reactYT)
      }
    }

    subscribe(() => {
      onSourceChange()
    })

    startAutoSave()
  })

  function toggleDebug() {
    debugVisible.update(v => !v)
  }
</script>

<div class="w-full h-full relative bg-bg-primary pb-14" data-testid="app-container">
  <!-- Full-screen base video with bottom padding for control bar -->
  <BaseVideo bind:this={baseVideoComponent} />
  
  <!-- Floating react overlay -->
  <ReactOverlay bind:this={reactOverlayComponent} />
  
  <!-- Debug toggle button -->
  <button 
    class="fixed top-3 right-3 z-50 bg-bg-tertiary border border-border rounded px-2 py-1 text-sm text-text-secondary cursor-pointer opacity-50 transition-all hover:opacity-100 hover:bg-accent hover:text-text-primary"
    onclick={toggleDebug}
    title="Toggle Debug Panel"
    data-testid="debug-toggle"
  >
    🔧
  </button>
  
  <!-- Bottom control bar -->
  <Controls />
  
  <!-- Modals -->
  <Toast />
  <DebugPanel />
  <TipsScreen />
  <ResumePrompt />
</div>



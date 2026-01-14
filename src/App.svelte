<script lang="ts">
  import { onMount } from 'svelte'
  import { initKeyboardShortcuts, trackContainerFocus } from './keyboard.ts'
  import Toast from './components/Toast.svelte'
  import DebugPanel from './components/DebugPanel.svelte'
  import BaseVideo from './components/BaseVideo.svelte'
  import ReactOverlay from './components/ReactOverlay.svelte'
  import Controls from './components/Controls.svelte'
  import SourceMenu from './components/SourceMenu.svelte'
  import QualityMenu from './components/QualityMenu.svelte'
  import TipsScreen from './components/TipsScreen.svelte'
  import ResumePrompt from './components/ResumePrompt.svelte'
  import { debugVisible, subscribe } from './stores.ts'
  import { setBaseElements, setReactElements } from './video-loading.ts'
  import { startAutoSave, onSourceChange } from './storage.ts'

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

<div class="w-full h-full relative bg-bg-primary pb-24">
  <BaseVideo bind:this={baseVideoComponent} />
  <ReactOverlay bind:this={reactOverlayComponent} />
  <Toast />
  <DebugPanel />
  <Controls />
  <TipsScreen />
  <ResumePrompt />
  
  <div class="fixed top-2 left-2 z-[1000] flex items-center gap-2">
    <SourceMenu which="base" />
    <SourceMenu which="react" />
    <QualityMenu />
  </div>
  
  <button 
    class="fixed top-2 right-2 z-[1000] bg-bg-tertiary border border-border rounded px-2 py-1 text-sm text-text-secondary cursor-pointer opacity-50 transition-all hover:opacity-100 hover:bg-accent hover:text-text-primary"
    onclick={toggleDebug}
    title="Toggle Debug Panel"
  >
    🔧
  </button>
</div>



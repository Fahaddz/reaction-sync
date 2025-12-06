import { subscribe } from '../state.ts'
import { initSourceMenus, initQualityMenu } from './menus.ts'
import { initControlBindings, initSyncButtons, initVolumeSliders, initSeekBars, updateTimeDisplays, updateUIFromState } from './controls.ts'

export { showToast, showResumePrompt, closeTipsScreen } from './toast.ts'
export { promptLocalFile, loadYouTubeVideo, loadUrlVideo, getYouTubePlayers, getLocalPlayers } from './video-loading.ts'

export function initUI(): void {
  initSourceMenus()
  initControlBindings()
  initSyncButtons()
  initVolumeSliders()
  initSeekBars()
  initQualityMenu()
  subscribe(updateUIFromState)
  setInterval(updateTimeDisplays, 500)
}


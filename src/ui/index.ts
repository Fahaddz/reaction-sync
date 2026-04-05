import { subscribe } from '../state.ts'
import { initSourceMenus, initQualityMenu } from './menus.ts'
import { initControlBindings, initSyncButtons, initVolumeSliders, initPlaybackSpeedControl, initSeekBars, updateTimeDisplays, updateUIFromState } from './controls.ts'

export { showToast, showResumePrompt, closeTipsScreen } from './toast.ts'
export { promptLocalFile, loadYouTubeVideo, loadUrlVideo, getYouTubePlayers } from './video-loading.ts'

export function initUI(): void {
  initSourceMenus()
  initControlBindings()
  initSyncButtons()
  initVolumeSliders()
  initPlaybackSpeedControl()
  initSeekBars()
  initQualityMenu()
  subscribe(updateUIFromState)
  updateUIFromState()
  setInterval(updateTimeDisplays, 500)
}

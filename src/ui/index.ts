import { subscribe } from '../state.ts'
import { initControlBindings, initSyncButtons, initVolumeSliders, initPlaybackSpeedControl, initSeekBars, updateTimeDisplays, updateUIFromState } from './controls.ts'

export function initUI(): void {
  initControlBindings()
  initSyncButtons()
  initVolumeSliders()
  initPlaybackSpeedControl()
  initSeekBars()
  subscribe(updateUIFromState)
  updateUIFromState()
  setInterval(updateTimeDisplays, 500)
}

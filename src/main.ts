import './styles.css'
import { initUI } from './ui.ts'
import { initKeyboard } from './keyboard.ts'
import { initDragResize } from './drag-resize.ts'
import { initStorage } from './storage.ts'

async function main(): Promise<void> {
  initUI()
  initKeyboard()
  initDragResize()
  await initStorage()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main)
} else {
  main()
}


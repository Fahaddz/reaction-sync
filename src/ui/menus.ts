import { getQualityLabel, getQualityOrder } from '../youtube.ts'
import { promptLocalFile, selectUrlSource, selectSubtitleFile, getYouTubePlayers } from './video-loading.ts'
import { showToast } from './toast.ts'

const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null

export function initSourceMenus(): void {
  const baseBtn = $<HTMLButtonElement>('baseVideoSourceBtn')
  const baseMenu = $<HTMLDivElement>('baseVideoSourceMenu')
  const reactBtn = $<HTMLButtonElement>('reactVideoSourceBtn')
  const reactMenu = $<HTMLDivElement>('reactVideoSourceMenu')

  baseBtn?.addEventListener('click', (e) => {
    e.stopPropagation()
    baseMenu?.classList.toggle('open')
    reactMenu?.classList.remove('open')
  })

  reactBtn?.addEventListener('click', (e) => {
    e.stopPropagation()
    reactMenu?.classList.toggle('open')
    baseMenu?.classList.remove('open')
  })

  document.addEventListener('click', () => {
    baseMenu?.classList.remove('open')
    reactMenu?.classList.remove('open')
  })

  $('addBaseVideoLocal')?.addEventListener('click', () => promptLocalFile('base'))
  $('addBaseVideoLink')?.addEventListener('click', () => selectUrlSource('base'))
  $('addReactVidLocal')?.addEventListener('click', () => promptLocalFile('react'))
  $('addReactVidLink')?.addEventListener('click', () => selectUrlSource('react'))
  $('addSubBtn')?.addEventListener('click', selectSubtitleFile)
}

export function initQualityMenu(): void {
  const btn = $('youtubeQuality')
  const menu = $<HTMLDivElement>('qualityMenu')
  if (!btn || !menu) return

  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    const { baseYT, reactYT } = getYouTubePlayers()
    const player = baseYT || reactYT
    if (!player) {
      showToast('No YouTube video loaded', 'info')
      return
    }
    const levels = player.getAvailableQualities()
    const current = player.getCurrentQuality()
    menu.innerHTML = ''
    const opts = ['auto', ...getQualityOrder().filter(q => levels.includes(q))]
    for (const q of opts) {
      const opt = document.createElement('button')
      opt.className = `quality-option${q === current || (q === 'auto' && current === 'default') ? ' active' : ''}`
      opt.textContent = getQualityLabel(q)
      opt.addEventListener('click', () => {
        player.setQuality(q)
        menu.classList.remove('open')
      })
      menu.appendChild(opt)
    }
    menu.style.visibility = 'hidden'
    menu.classList.add('open')
    const btnRect = btn.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()
    const spaceAbove = btnRect.top
    const spaceBelow = window.innerHeight - btnRect.bottom
    menu.style.left = `${Math.max(8, Math.min(btnRect.left, window.innerWidth - menuRect.width - 8))}px`
    if (spaceAbove >= menuRect.height + 8) {
      menu.style.top = `${btnRect.top - menuRect.height - 8}px`
      menu.style.bottom = 'auto'
    } else if (spaceBelow >= menuRect.height + 8) {
      menu.style.top = `${btnRect.bottom + 8}px`
      menu.style.bottom = 'auto'
    } else {
      menu.style.bottom = '8px'
      menu.style.top = 'auto'
    }
    menu.style.visibility = 'visible'
  })

  document.addEventListener('click', () => menu.classList.remove('open'))
}


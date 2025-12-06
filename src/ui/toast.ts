import { formatTime, formatTimeWithDecimal } from '../utils.ts'

const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null

export function showToast(message: string, type: 'info' | 'error' | 'warning' = 'info', duration = 3000): void {
  const container = $('toastContainer')
  if (!container) return
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.textContent = message
  container.appendChild(toast)
  requestAnimationFrame(() => toast.classList.add('show'))
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => toast.remove(), 300)
  }, duration)
}

export function showResumePrompt(
  baseTime: number,
  delay: number,
  onResume: () => void,
  onReset: () => void
): void {
  const container = $('resumePrompt')
  if (!container) return
  container.innerHTML = `
    <div class="resume-dialog">
      <h3>Resume where you left off?</h3>
      <p>Last time at ${formatTime(baseTime)} with delay ${formatTimeWithDecimal(delay)}</p>
      <div class="buttons">
        <button class="reset-btn">Start New</button>
        <button class="resume-btn">Resume</button>
      </div>
    </div>
  `
  container.classList.add('open')
  container.querySelector('.resume-btn')?.addEventListener('click', () => {
    container.classList.remove('open')
    onResume()
  })
  container.querySelector('.reset-btn')?.addEventListener('click', () => {
    container.classList.remove('open')
    onReset()
  })
}

export function closeTipsScreen(): void {
  const tips = $('tipsScreen')
  if (tips) tips.style.display = 'none'
}


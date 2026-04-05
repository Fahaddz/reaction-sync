import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { getQualityLabel, getQualityOrder } from '../youtube.ts'
import { getYouTubePlayers } from '../ui/video-loading.ts'
import { showToast } from '../ui/toast.ts'

export function QualityMenu() {
  const [options, setOptions] = useState<string[]>([])
  const [current, setCurrent] = useState('auto')

  const refreshOptions = () => {
    const { baseYT, reactYT } = getYouTubePlayers()
    const player = baseYT || reactYT
    if (!player) {
      setOptions([])
      setCurrent('auto')
      showToast('No YouTube video loaded', 'info')
      return false
    }

    const levels = player.getAvailableQualities()
    const nextOptions = ['auto', ...getQualityOrder().filter((quality) => levels.includes(quality))]
    setOptions(nextOptions)
    setCurrent(player.getCurrentQuality())
    return true
  }

  return (
    <DropdownMenu.Root
      onOpenChange={(open) => {
        if (open) {
          refreshOptions()
        }
      }}
    >
      <DropdownMenu.Trigger asChild>
        <button id="youtubeQuality" type="button" className="icon-button" aria-label="YouTube quality">
          <SlidersHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu-surface" sideOffset={10} align="end">
          {options.length === 0 ? (
            <DropdownMenu.Item className="menu-item text-[var(--text-secondary)]" disabled>
              No quality options
            </DropdownMenu.Item>
          ) : (
            options.map((quality) => (
              <DropdownMenu.Item
                key={quality}
                className="menu-item justify-between"
                onSelect={() => {
                  const { baseYT, reactYT } = getYouTubePlayers()
                  const player = baseYT || reactYT
                  player?.setQuality(quality)
                  setCurrent(quality)
                }}
              >
                <span>{getQualityLabel(quality)}</span>
                <Check className={`h-4 w-4 ${current === quality || (quality === 'auto' && current === 'default') ? 'opacity-100' : 'opacity-0'}`} />
              </DropdownMenu.Item>
            ))
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

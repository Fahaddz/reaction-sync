import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Link2, Upload, X } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { loadSourceFromUrl, promptLocalFile } from '../ui/video-loading.ts'

type Props = {
  which: 'base' | 'react'
  buttonId: string
}

export function SourceActionMenu({ which, buttonId }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [url, setUrl] = useState('')
  const titleId = useId()

  const label = which === 'base' ? 'Base' : 'React'

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextUrl = url.trim()
    if (!nextUrl) return
    setDialogOpen(false)
    setUrl('')
    void loadSourceFromUrl(which, nextUrl)
  }

  return (
    <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button id={buttonId} type="button" className="control-chip">
            {label}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="menu-surface" sideOffset={10} align="start">
            <DropdownMenu.Item
              className="menu-item"
              onSelect={() => {
                void promptLocalFile(which)
              }}
            >
              <Upload className="h-4 w-4" />
              <span>Local file</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="menu-item"
              onSelect={() => {
                setDialogOpen(true)
              }}
            >
              <Link2 className="h-4 w-4" />
              <span>Video URL</span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-surface" aria-describedby={undefined} aria-labelledby={titleId}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title id={titleId} className="text-lg font-semibold text-[var(--text-primary)]">
                Add {label} source
              </Dialog.Title>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Paste a YouTube link, direct media file, or HLS playlist URL.
              </p>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="icon-button" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <form className="mt-5 flex flex-col gap-3" onSubmit={handleSubmit}>
            <input
              autoFocus
              type="url"
              className="url-field"
              placeholder="https://..."
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <div className="flex justify-end gap-3">
              <Dialog.Close asChild>
                <button type="button" className="secondary-action">
                  Cancel
                </button>
              </Dialog.Close>
              <button type="submit" className="primary-action">
                Load source
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

import { useRef } from 'react'
import { useT } from '../i18n'
import type { Protection } from '../pdf/decrypt'
import { LanguageSelect } from './LanguageSelect'

type Props = {
  fileName: string | null
  pageCount: number
  protection: Protection
  busy: boolean
  canUndo: boolean
  canRedo: boolean
  zoom: number
  addMode: boolean
  editCount: number
  rulers: boolean
  snap: boolean
  drawMode: boolean
  onToggleRulers: () => void
  onToggleSnap: () => void
  onToggleDraw: () => void
  onImageFile: (file: File) => void
  onWord: () => void
  onOpen: (file: File) => void
  onUndo: () => void
  onRedo: () => void
  onZoom: (zoom: number) => void
  onToggleAdd: () => void
  onDownload: () => void
  onRemoveProtection: () => void
  onReset: () => void
  onClose: () => void
}

export function Toolbar(props: Props) {
  const t = useT()
  const hasFile = Boolean(props.fileName)
  const protection = t(`toolbar.protection.${props.protection}`)

  return (
    <header className="z-20 flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white/90 px-3 py-2 backdrop-blur">
      <div className="mr-2 flex shrink-0 items-baseline gap-2">
        <span className="whitespace-nowrap text-sm font-semibold tracking-tight text-zinc-900">
          {t('brand')}
        </span>
        {hasFile && (
          <span className="max-w-[220px] truncate text-xs text-zinc-500" title={props.fileName ?? ''}>
            {t('toolbar.fileMeta', {
              name: props.fileName ?? '',
              count: props.pageCount,
              protection,
            })}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <OpenButton busy={props.busy} onOpen={props.onOpen} />
        <button className="tool" onClick={props.onWord} title={t('toolbar.wordTitle')}>
          {t('toolbar.word')}
        </button>
        {hasFile && (
          <button className="tool" onClick={props.onClose}>
            {t('toolbar.close')}
          </button>
        )}
        <LanguageSelectSlot />
      </div>

      {hasFile && (
        <>
          <Divider />
          <div className="flex items-center gap-1">
            <button className="tool" onClick={props.onUndo} disabled={!props.canUndo}>
              {t('toolbar.undo')}
            </button>
            <button className="tool" onClick={props.onRedo} disabled={!props.canRedo}>
              {t('toolbar.redo')}
            </button>
          </div>

          <Divider />
          <div className="flex items-center gap-1">
            <button className="tool w-8" onClick={() => props.onZoom(props.zoom - 0.15)}>
              −
            </button>
            <span className="w-12 text-center text-xs tabular-nums text-zinc-600">
              {Math.round(props.zoom * 100)}%
            </span>
            <button className="tool w-8" onClick={() => props.onZoom(props.zoom + 0.15)}>
              +
            </button>
            <button className="tool" onClick={() => props.onZoom(1)}>
              100%
            </button>
          </div>

          <Divider />
          <button
            className={`tool ${props.addMode ? 'tool-active' : ''}`}
            onClick={props.onToggleAdd}
          >
            {t('toolbar.addText')}
          </button>
          <button
            className={`tool ${props.rulers ? 'tool-active' : ''}`}
            onClick={props.onToggleRulers}
            title={t('toolbar.rulersTitle')}
          >
            {t('toolbar.rulers')}
          </button>
          <button
            className={`tool ${props.snap ? 'tool-active' : ''}`}
            onClick={props.onToggleSnap}
            title={t('toolbar.snapTitle')}
          >
            {t('toolbar.snap')}
          </button>
          <button
            className={`tool ${props.drawMode ? 'tool-active' : ''}`}
            onClick={props.onToggleDraw}
            title={t('toolbar.drawTitle')}
          >
            {t('toolbar.draw')}
          </button>
          <ImageButton onImageFile={props.onImageFile} />

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {props.editCount > 0 && (
              <button className="tool" onClick={props.onReset}>
                {t('toolbar.reset')}
              </button>
            )}
            {props.protection !== 'none' && (
              <button className="tool" onClick={props.onRemoveProtection} disabled={props.busy}>
                {t('toolbar.unlock')}
              </button>
            )}
            <button
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              onClick={props.onDownload}
              disabled={props.busy}
            >
              {props.busy ? t('toolbar.saving') : t('toolbar.download')}
            </button>
          </div>
        </>
      )}
    </header>
  )
}

function LanguageSelectSlot() {
  return (
    <div className="ml-1">
      <LanguageSelect compact />
    </div>
  )
}

function OpenButton({ busy, onOpen }: { busy: boolean; onOpen: (file: File) => void }) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <button className="tool" onClick={() => inputRef.current?.click()} disabled={busy}>
        {t('toolbar.open')}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onOpen(file)
          event.target.value = ''
        }}
      />
    </>
  )
}

function ImageButton({ onImageFile }: { onImageFile: (file: File) => void }) {
  const t = useT()
  const imageRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <button className="tool" onClick={() => imageRef.current?.click()}>
        {t('toolbar.image')}
      </button>
      <input
        ref={imageRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onImageFile(file)
          event.target.value = ''
        }}
      />
    </>
  )
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-zinc-200" />
}

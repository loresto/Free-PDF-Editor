import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { renderAsync } from 'docx-preview'
import { useT } from '../i18n'

type Props = {
  open: boolean
  /** A .docx the user dropped or picked outside the dialog. */
  file: File | null
  onClose: () => void
}

/**
 * Word → PDF without a backend: the document is laid out in the browser and
 * sent to the system print dialog, where «Сохранить как PDF» writes the file.
 */
export function WordToPdf({ open, file, onClose }: Props) {
  const t = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<File | null>(null)

  useEffect(() => {
    if (open && file) setPending(file)
  }, [open, file])

  useEffect(() => {
    if (!open || !pending) return
    let cancelled = false
    setBusy(true)
    setError(null)
    setName(pending.name)
    void (async () => {
      try {
        const data = await pending.arrayBuffer()
        if (cancelled) return
        const container = containerRef.current
        if (!container) return
        container.innerHTML = ''
        await renderAsync(data, container, container, {
          className: 'docx',
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          experimental: true,
          useBase64URL: true,
        })
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? t('word.error', { message: caught.message })
              : t('word.errorGeneric'),
          )
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, pending, t])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="word-overlay fixed inset-0 z-50 flex flex-col bg-zinc-900/60 p-3 backdrop-blur-sm">
      <div className="word-shell mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="word-chrome flex flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-2">
          <h2 className="text-sm font-semibold text-zinc-900">{t('toolbar.word')}</h2>
          <span className="max-w-[240px] truncate text-xs text-zinc-500">
            {name || t('word.noFile')}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button className="tool" onClick={() => inputRef.current?.click()}>
              {t('word.open')}
            </button>
            <button
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              onClick={() => window.print()}
              disabled={busy || !name}
              title={t('word.saveTitle')}
            >
              {t('word.save')}
            </button>
            <button className="tool" onClick={onClose}>
              {t('toolbar.close')}
            </button>
          </div>
        </header>

        <div className="word-note border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] leading-relaxed text-amber-800">
          {t('word.note')}
        </div>

        <div className="word-scroll flex-1 overflow-auto bg-zinc-100 p-4">
          {busy && <p className="mb-2 text-center text-xs text-zinc-500">{t('word.busy')}</p>}
          {error && (
            <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          )}
          {!name && !busy && (
            <div className="mx-auto mt-10 max-w-xl rounded-2xl border-2 border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
              <p className="text-sm font-medium text-zinc-800">{t('word.emptyTitle')}</p>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">{t('word.emptyText')}</p>
            </div>
          )}
          <div
            ref={containerRef}
            className="word-print"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const dropped = event.dataTransfer.files[0]
              if (dropped) setPending(dropped)
            }}
          />
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(event) => {
          const picked = event.target.files?.[0]
          if (picked) setPending(picked)
          event.target.value = ''
        }}
      />
    </div>,
    document.body,
  )
}

import { useRef } from 'react'
import type { Protection } from '../pdf/decrypt'

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

const PROTECTION_LABEL: Record<Protection, string> = {
  none: 'без защиты',
  owner: 'ограничения владельца',
  user: 'пароль на открытие',
}

export function Toolbar(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const hasFile = Boolean(props.fileName)

  return (
    <header className="z-20 flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white/90 px-3 py-2 backdrop-blur">
      <div className="mr-2 flex items-baseline gap-2">
        <span className="text-sm font-semibold tracking-tight text-zinc-900">PDF Правка</span>
        {hasFile && (
          <span className="max-w-[220px] truncate text-xs text-zinc-500" title={props.fileName ?? ''}>
            {props.fileName} · {props.pageCount} стр. · {PROTECTION_LABEL[props.protection]}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button className="tool" onClick={() => inputRef.current?.click()} disabled={props.busy}>
          Открыть
        </button>
        <button className="tool" onClick={props.onWord} title="Перевести документ Word (.docx) в PDF">
          Word → PDF
        </button>
        {hasFile && (
          <button className="tool" onClick={props.onClose}>
            Закрыть
          </button>
        )}
      </div>

      {hasFile && (
        <>
          <Divider />
          <div className="flex items-center gap-1">
            <button className="tool" onClick={props.onUndo} disabled={!props.canUndo}>
              Отменить
            </button>
            <button className="tool" onClick={props.onRedo} disabled={!props.canRedo}>
              Повторить
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
            + Текст
          </button>
          <button
            className={`tool ${props.rulers ? 'tool-active' : ''}`}
            onClick={props.onToggleRulers}
            title="Показать или скрыть линейки"
          >
            Линейка
          </button>
          <button
            className={`tool ${props.snap ? 'tool-active' : ''}`}
            onClick={props.onToggleSnap}
            title="Прилипание к соседнему тексту при перетаскивании"
          >
            Привязка
          </button>
          <button
            className={`tool ${props.drawMode ? 'tool-active' : ''}`}
            onClick={props.onToggleDraw}
            title="Рисовать от руки: подпись, пометки, линии"
          >
            ✏ Рисовать
          </button>
          <button className="tool" onClick={() => imageRef.current?.click()}>
            Изображение
          </button>

          <div className="ml-auto flex items-center gap-2">
            {props.editCount > 0 && (
              <button className="tool" onClick={props.onReset}>
                Сбросить правки
              </button>
            )}
            {props.protection !== 'none' && (
              <button className="tool" onClick={props.onRemoveProtection} disabled={props.busy}>
                Снять защиту
              </button>
            )}
            <button
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              onClick={props.onDownload}
              disabled={props.busy}
            >
              {props.busy ? 'Сохраняю…' : 'Скачать PDF'}
            </button>
          </div>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) props.onOpen(file)
          event.target.value = ''
        }}
      />
      <input
        ref={imageRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) props.onImageFile(file)
          event.target.value = ''
        }}
      />
    </header>
  )
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-zinc-200" />
}

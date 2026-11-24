import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { DropZone } from '../components/DropZone'
import { PageView } from '../components/PageView'
import { PasswordDialog } from '../components/PasswordDialog'
import { PropertiesPanel } from '../components/PropertiesPanel'
import { Rulers } from '../components/Rulers'
import { Toolbar } from '../components/Toolbar'
import { WordToPdf } from '../components/WordToPdf'
import { probeProtection, saveWithoutProtection, type Protection } from '../pdf/decrypt'
import { outputName, savePdf } from '../pdf/download'
import { buildPdf, buildPreview } from '../pdf/export'
import type {
  ImageEdit,
  LineDraft,
  PageInfo,
  Rgb,
  StrokeEdit,
  TextEdit,
  TextRun,
} from '../pdf/model'
import { canvasMeasure, fitSize, joinLine, pageLines, uid, wrapText } from '../pdf/model'
import { ImagePanel, StrokePanel } from '../components/MediaPanel'
import { openPdfDocument, readPageInfos } from '../pdf/pdfjs'

type Loaded = {
  name: string
  bytes: Uint8Array
  doc: PDFDocumentProxy
  password: string | undefined
  destroy: () => Promise<void>
  pages: PageInfo[]
  protection: Protection
}

const EMPTY_BLANKED: Set<string> = new Set()

type DocState = {
  edits: TextEdit[]
  images: ImageEdit[]
  strokes: StrokeEdit[]
}

/** Shown in the right column while no text block is selected. */
function EmptyPanel({
  editCount,
  rulers,
  snap,
  onToggleRulers,
  onToggleSnap,
}: {
  editCount: number
  rulers: boolean
  snap: boolean
  onToggleRulers: () => void
  onToggleSnap: () => void
}) {
  const shortcuts: [string, string][] = [
    ['Клик по тексту', 'править строку'],
    ['Пробел + тянуть', 'двигать страницу'],
    ['Ctrl+Z / Ctrl+Shift+Z', 'отменить / вернуть'],
    ['Стрелки', 'сдвиг на 1 pt (Shift — 10 pt)'],
    ['Ctrl+D', 'дублировать блок'],
    ['Ctrl+C / Ctrl+V', 'копировать / вставить'],
    ['Delete', 'удалить блок'],
    ['+ Текст', 'новый блок на странице'],
    ['Изображение', 'PNG-подпись или печать'],
    ['✏ Рисовать', 'линия или подпись от руки'],
    ['Word → PDF', '.docx в PDF через печать'],
    ['Esc', 'выйти из правки'],
  ]
  return (
    <div className="px-4 py-4 text-sm">
      <h2 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Настройки</h2>
      <p className="mt-2 rounded-lg bg-zinc-50 px-2 py-1.5 text-[11px] leading-relaxed text-zinc-500">
        {editCount > 0
          ? 'Выберите строку или блок на странице — здесь появятся кегль, шрифт, цвета, отступы и слои.'
          : 'Кликните по любой строке документа, чтобы заменить её текст, или нажмите «+ Текст», чтобы добавить новый блок.'}
      </p>

      <h3 className="mt-4 text-[11px] font-medium text-zinc-500">Вид</h3>
      <div className="mt-1 grid grid-cols-2 gap-1">
        <button
          type="button"
          className={`tool ${rulers ? 'tool-active' : ''}`}
          onClick={onToggleRulers}
        >
          Линейка
        </button>
        <button
          type="button"
          className={`tool ${snap ? 'tool-active' : ''}`}
          onClick={onToggleSnap}
        >
          Привязка
        </button>
      </div>

      <h3 className="mt-4 text-[11px] font-medium text-zinc-500">Горячие клавиши</h3>
      <ul className="mt-1 space-y-1">
        {shortcuts.map(([keys, action]) => (
          <li key={keys} className="flex justify-between gap-2 text-[11px]">
            <span className="shrink-0 rounded border border-zinc-200 bg-zinc-50 px-1 text-zinc-600">
              {keys}
            </span>
            <span className="text-right text-zinc-400">{action}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Typography copied by the style pipette. */
const STYLE_KEYS = [
  'font',
  'size',
  'bold',
  'color',
  'align',
  'lineHeight',
  'letterSpacing',
  'underline',
  'strike',
  'opacity',
  'textCase',
  'highlight',
] as const satisfies readonly (keyof TextEdit)[]

/** Wraps a page in rulers, or renders it bare when the rulers are off. */
function PageFrame({
  rulers,
  width,
  height,
  zoom,
  children,
}: {
  rulers: boolean
  width: number
  height: number
  zoom: number
  children: React.ReactNode
}) {
  if (!rulers) return <>{children}</>
  return (
    <Rulers width={width} height={height} zoom={zoom}>
      {children}
    </Rulers>
  )
}

const PROTECTION_TEXT: Record<Protection, string> = {
  none: 'Защита не обнаружена',
  owner: 'Только ограничения владельца: печать и копирование запрещены, пароль на открытие не нужен',
  user: 'Нужен пароль на открытие',
}

export function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [edits, setEdits] = useState<TextEdit[]>([])
  const editsRef = useRef<TextEdit[]>([])
  const [images, setImages] = useState<ImageEdit[]>([])
  const imagesRef = useRef<ImageEdit[]>([])
  const [strokes, setStrokes] = useState<StrokeEdit[]>([])
  const strokesRef = useRef<StrokeEdit[]>([])
  const [pageOrder, setPageOrder] = useState<number[]>([])
  const [removedPages, setRemovedPages] = useState<number[]>([])
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [selectedStrokeId, setSelectedStrokeId] = useState<string | null>(null)
  const [drawMode, setDrawMode] = useState(false)
  const [wordOpen, setWordOpen] = useState(false)
  const [wordFile, setWordFile] = useState<File | null>(null)
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [drawColor] = useState<Rgb>([20, 20, 20])
  const [drawWidth, setDrawWidth] = useState(1.6)
  const [preview, setPreview] = useState<{ doc: PDFDocumentProxy; blanked: Set<string> } | null>(
    null,
  )
  const previewRef = useRef<{ destroy: () => Promise<void> } | null>(null)
  const previewSourceRef = useRef<Uint8Array | null>(null)
  const [past, setPast] = useState<DocState[]>([])
  const [future, setFuture] = useState<DocState[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addMode, setAddMode] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [rulers, setRulers] = useState(true)
  const [snap, setSnap] = useState(true)
  const [runsByPage, setRunsByPage] = useState<Record<number, TextRun[]>>({})
  const clipboardRef = useRef<TextEdit | null>(null)
  const styleRef = useRef<Partial<TextEdit> | null>(null)
  const [hasStyle, setHasStyle] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [passwordPrompt, setPasswordPrompt] = useState<{
    incorrect: boolean
    resolve: (value: string) => void
  } | null>(null)

  const askPassword = useCallback(
    (incorrect: boolean) =>
      new Promise<string>((resolve) => setPasswordPrompt({ incorrect, resolve })),
    [],
  )

  useEffect(() => {
    editsRef.current = edits
  }, [edits])

  // Live «decompile → recompose»: pages are re-rendered from a working copy where
  // replaced lines are cut out of the content stream, so the preview never needs
  // a white patch over the original text.
  const editSignature = edits
    .map(
      (edit) =>
        `${edit.id}|${edit.page}|${edit.kind}|${edit.original ?? ''}|${edit.x.toFixed(1)}|${edit.y.toFixed(1)}`,
    )
    .join('~')

  useEffect(() => {
    if (!loaded) {
      if (previewRef.current) {
        void previewRef.current.destroy()
        previewRef.current = null
      }
      previewSourceRef.current = null
      setPreview(null)
      return
    }
    if (previewSourceRef.current !== loaded.bytes) {
      previewSourceRef.current = loaded.bytes
      if (previewRef.current) {
        void previewRef.current.destroy()
        previewRef.current = null
      }
      setPreview(null)
    }
    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const next = await buildPreview(loaded.bytes, editsRef.current, loaded.password)
          if (cancelled) return
          if (!next) {
            if (previewRef.current) {
              void previewRef.current.destroy()
              previewRef.current = null
            }
            setPreview(null)
            return
          }
          const opened = await openPdfDocument(next.bytes, undefined, async () => '')
          if (cancelled) {
            void opened.destroy()
            return
          }
          if (previewRef.current) void previewRef.current.destroy()
          previewRef.current = { destroy: opened.destroy }
          setPreview({ doc: opened.doc, blanked: next.blanked })
        } catch {
          // Живой пересбор не критичен: останутся подложки, как раньше.
        }
      })()
    }, 160)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [loaded, editSignature])

  useEffect(() => {
    if (!status) return
    const timer = setTimeout(() => setStatus(null), 3500)
    return () => clearTimeout(timer)
  }, [status])

  function currentState(): DocState {
    return {
      edits: editsRef.current,
      images: imagesRef.current,
      strokes: strokesRef.current,
    }
  }

  function applyState(next: DocState) {
    editsRef.current = next.edits
    imagesRef.current = next.images
    strokesRef.current = next.strokes
    setEdits(next.edits)
    setImages(next.images)
    setStrokes(next.strokes)
  }

  function apply(next: TextEdit[]) {
    applyState({ ...currentState(), edits: next })
  }

  function applyImages(next: ImageEdit[]) {
    applyState({ ...currentState(), images: next })
  }

  function applyStrokes(next: StrokeEdit[]) {
    applyState({ ...currentState(), strokes: next })
  }

  function snapshot() {
    const state = currentState()
    setPast((previous) => [...previous.slice(-49), state])
    setFuture([])
  }

  function commit(next: TextEdit[]) {
    snapshot()
    apply(next)
  }

  function undo() {
    setPast((previous) => {
      if (!previous.length) return previous
      const prior = previous[previous.length - 1]
      setFuture((next) => [currentState(), ...next].slice(0, 50))
      applyState(prior)
      setSelectedId(null)
      setEditingId(null)
      setSelectedImageId(null)
      setSelectedStrokeId(null)
      return previous.slice(0, -1)
    })
  }

  function redo() {
    setFuture((next) => {
      if (!next.length) return next
      setPast((previous) => [...previous, currentState()])
      applyState(next[0])
      setSelectedId(null)
      setEditingId(null)
      setSelectedImageId(null)
      setSelectedStrokeId(null)
      return next.slice(1)
    })
  }

  const openFile = useCallback(
    async (file: File) => {
      if (/\.docx$/i.test(file.name)) {
        setWordFile(file)
        setWordOpen(true)
        return
      }
      setBusy(true)
      setError(null)
      setStatus(null)
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const { doc, password, destroy } = await openPdfDocument(bytes, undefined, askPassword)
        const pages = await readPageInfos(doc)
        const protection = await probeProtection(bytes)
        setLoaded((previous) => {
          if (previous) void previous.destroy()
          return { name: file.name, bytes, doc, password, destroy, pages, protection }
        })
        applyState({ edits: [], images: [], strokes: [] })
        setPast([])
        setFuture([])
        setPageOrder(pages.map((page) => page.index))
        setRemovedPages([])
        setSelectedId(null)
        setEditingId(null)
        setSelectedImageId(null)
        setSelectedStrokeId(null)
        setAddMode(false)
        setDrawMode(false)
        setZoom(1)
      } catch (caught) {
        setError(
          caught instanceof Error
            ? `Не удалось открыть файл: ${caught.message}`
            : 'Не удалось открыть файл.',
        )
      } finally {
        setBusy(false)
      }
    },
    [askPassword],
  )

  function closeFile() {
    if (loaded) void loaded.destroy()
    setLoaded(null)
    applyState({ edits: [], images: [], strokes: [] })
    setPast([])
    setFuture([])
    setPageOrder([])
    setRemovedPages([])
    setSelectedId(null)
    setEditingId(null)
    setSelectedImageId(null)
    setSelectedStrokeId(null)
    setAddMode(false)
    setDrawMode(false)
    setError(null)
  }

  function editRun(draft: LineDraft) {
    const existing = editsRef.current.find(
      (edit) =>
        edit.page === draft.page &&
        edit.kind === 'replace' &&
        Math.abs(edit.x - draft.x) < 2 &&
        Math.abs(edit.y - draft.y) < 2,
    )
    if (existing) {
      setSelectedId(existing.id)
      setEditingId(existing.id)
      return
    }
    const edit: TextEdit = {
      id: uid(),
      page: draft.page,
      kind: 'replace',
      x: draft.x,
      y: draft.y,
      width: Math.max(draft.width, draft.size * 2),
      original: draft.text,
      size: draft.size || 12,
      text: draft.text,
      font: draft.font,
      bold: draft.bold,
      align: 'left',
      color: [23, 23, 23],
      lineHeight: 1.18,
      letterSpacing: 0,
      underline: false,
      strike: false,
      opacity: 1,
      textCase: 'none',
      highlight: null,
      locked: false,
      cover: draft.cover ?? {
        x: draft.x - 0.8,
        y: draft.y - (draft.size || 12) * 0.26,
        width: draft.width + 1.6,
        height: (draft.size || 12) * 1.32,
        color: [255, 255, 255],
      },
    }
    commit([...editsRef.current, edit])
    setSelectedId(edit.id)
    setEditingId(edit.id)
    setAddMode(false)
  }

  function addAt(page: number, x: number, y: number) {
    const edit: TextEdit = {
      id: uid(),
      page,
      kind: 'add',
      x,
      y,
      width: 200,
      size: 12,
      text: '',
      font: 'sans',
      bold: false,
      align: 'left',
      color: [23, 23, 23],
      lineHeight: 1.18,
      letterSpacing: 0,
      underline: false,
      strike: false,
      opacity: 1,
      textCase: 'none',
      highlight: null,
      locked: false,
      cover: null,
    }
    commit([...editsRef.current, edit])
    setSelectedId(edit.id)
    setEditingId(edit.id)
    setAddMode(false)
  }

  function updateEdit(id: string, patch: Partial<TextEdit>) {
    apply(editsRef.current.map((edit) => (edit.id === id ? { ...edit, ...patch } : edit)))
  }

  function moveEdit(id: string, x: number, y: number) {
    apply(
      editsRef.current.map((edit) => {
        if (edit.id !== id) return edit
        const dx = x - edit.x
        const dy = y - edit.y
        return {
          ...edit,
          x,
          y,
          cover: edit.cover
            ? { ...edit.cover, x: edit.cover.x + dx, y: edit.cover.y + dy }
            : null,
        }
      }),
    )
  }

  /** Finishing an inline edit shrinks the font when the new text no longer fits. */
  function finishEditing(id: string | null) {
    setEditingId(null)
    if (!id) return
    const edit = editsRef.current.find((item) => item.id === id)
    if (!edit?.cover || edit.kind !== 'replace') return
    if (!edit.text.trim() || edit.text.includes('\n')) return
    const step = edit.size * (edit.lineHeight || 1.18)
    const maxLines = Math.max(1, Math.round(edit.cover.height / step))
    const measure = canvasMeasure(edit.font, edit.bold)
    const spacing = edit.letterSpacing || 0
    if (wrapText(edit.text, edit.size, edit.width, measure, spacing).length <= maxLines) return
    const fitted = fitSize(edit.text, edit.width, edit.size, maxLines, measure, spacing)
    // Никогда не уменьшаем больше чем на 30%: лучше показать предупреждение,
    // чем сделать текст нечитаемым.
    if (fitted < edit.size && fitted >= Math.max(edit.size * 0.7, 6)) {
      apply(editsRef.current.map((item) => (item.id === id ? { ...item, size: fitted } : item)))
    }
  }

  function removeEdit(id: string) {
    commit(editsRef.current.filter((edit) => edit.id !== id))
    setSelectedId(null)
    setEditingId(null)
  }

  function duplicateEdit(id: string) {
    const source = editsRef.current.find((edit) => edit.id === id)
    if (!source) return
    const copy: TextEdit = {
      ...source,
      id: uid(),
      y: source.y - source.size * (source.lineHeight || 1.18) * 1.1,
      original: undefined,
      kind: source.kind === 'replace' ? 'replace' : 'add',
    }
    commit([...editsRef.current, copy])
    setSelectedId(copy.id)
    setEditingId(null)
  }

  function copyEdit(id: string) {
    const source = editsRef.current.find((edit) => edit.id === id)
    if (source) clipboardRef.current = { ...source }
  }

  function pasteEdit() {
    const source = clipboardRef.current
    if (!source) return
    const copy: TextEdit = {
      ...source,
      id: uid(),
      page: source.page,
      x: source.x + 12,
      y: source.y - 12,
      original: undefined,
    }
    clipboardRef.current = copy
    commit([...editsRef.current, copy])
    setSelectedId(copy.id)
    setEditingId(null)
  }

  function nudgeEdit(id: string, dx: number, dy: number) {
    if (editsRef.current.find((edit) => edit.id === id)?.locked) return
    apply(
      editsRef.current.map((edit) =>
        edit.id === id
          ? {
              ...edit,
              x: edit.x + dx,
              y: edit.y + dy,
              cover: edit.cover
                ? { ...edit.cover, x: edit.cover.x + dx, y: edit.cover.y + dy }
                : null,
            }
          : edit,
      ),
    )
  }

  /** Moves the block onto the nearest original line: left edge or baseline. */
  function alignToNeighbour(kind: 'x' | 'y') {
    if (!selectedId) return
    const edit = editsRef.current.find((item) => item.id === selectedId)
    if (!edit) return
    const candidates = (runsByPage[edit.page] ?? []).filter(
      (run) => Math.abs(run.y - edit.y) < 40 || kind === 'y',
    )
    let best: TextRun | null = null
    let bestDistance = Number.POSITIVE_INFINITY
    for (const run of candidates) {
      const distance =
        kind === 'x'
          ? Math.abs(run.y - edit.y) * 4 + Math.abs(run.x - edit.x)
          : Math.abs(run.y - edit.y)
      if (distance < bestDistance) {
        bestDistance = distance
        best = run
      }
    }
    if (!best) return
    snapshot()
    if (kind === 'x') updateEdit(edit.id, { x: best.x })
    else updateEdit(edit.id, { y: best.y })
  }

  function copyStyle(id: string) {
    const source = editsRef.current.find((edit) => edit.id === id)
    if (!source) return
    const style: Partial<TextEdit> = {}
    for (const key of STYLE_KEYS) Object.assign(style, { [key]: source[key] })
    styleRef.current = structuredClone(style)
    setHasStyle(true)
    setStatus('Стиль скопирован — выберите другой блок и нажмите «Применить стиль»')
  }

  function pasteStyle(id: string) {
    if (!styleRef.current) return
    commit(
      editsRef.current.map((edit) =>
        edit.id === id ? { ...edit, ...structuredClone(styleRef.current!) } : edit,
      ),
    )
  }

  /** Reorders a block above or below its neighbours on the same page. */
  function moveLayer(id: string, direction: 1 | -1) {
    const list = [...editsRef.current]
    const index = list.findIndex((edit) => edit.id === id)
    if (index < 0) return
    const page = list[index].page
    let target = index + direction
    while (target >= 0 && target < list.length && list[target].page !== page) target += direction
    if (target < 0 || target >= list.length) return
    const [item] = list.splice(index, 1)
    list.splice(target, 0, item)
    commit(list)
  }

  /** Centres the block horizontally on its page. */
  function centerEdit(id: string) {
    const edit = editsRef.current.find((item) => item.id === id)
    const page = loaded?.pages.find((item) => item.index === edit?.page)
    if (!edit || !page) return
    snapshot()
    updateEdit(id, { x: Math.max(0, (page.width - edit.width) / 2) })
  }

  async function addImageFile(file: File) {
    if (!loaded) return
    if (!/^image\/(png|jpeg)$/i.test(file.type)) {
      setError('Поддерживаются PNG и JPEG — например, подпись или печать на прозрачном фоне.')
      return
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('Не удалось прочитать файл.'))
        reader.readAsDataURL(file)
      })
      const natural = await new Promise<{ width: number; height: number }>((resolve) => {
        const image = new Image()
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
        image.onerror = () => resolve({ width: 1, height: 1 })
        image.src = dataUrl
      })
      const visible = pageOrder.filter((page) => !removedPages.includes(page))
      const pageNumber = visible[0] ?? 1
      const info = loaded.pages.find((page) => page.index === pageNumber)
      const pageWidth = info?.width ?? 595
      const width = Math.min(180, pageWidth * 0.4)
      const ratio = natural.height / Math.max(1, natural.width)
      const height = width * ratio
      const image: ImageEdit = {
        id: uid(),
        page: pageNumber,
        x: (pageWidth - width) / 2,
        y: ((info?.height ?? 842) - height) / 2,
        width,
        height,
        opacity: 1,
        rotation: 0,
        dataUrl,
        label: file.name.replace(/\.[^.]+$/, ''),
        locked: false,
      }
      snapshot()
      applyImages([...imagesRef.current, image])
      setSelectedImageId(image.id)
      setSelectedId(null)
      setSelectedStrokeId(null)
      setStatus('Изображение добавлено — перетащите его в нужное место')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось добавить изображение.')
    }
  }

  function updateImage(id: string, patch: Partial<ImageEdit>) {
    applyImages(imagesRef.current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function removeImage(id: string) {
    snapshot()
    applyImages(imagesRef.current.filter((item) => item.id !== id))
    setSelectedImageId(null)
  }

  function duplicateImage(id: string) {
    const source = imagesRef.current.find((item) => item.id === id)
    if (!source) return
    const copy: ImageEdit = { ...source, id: uid(), x: source.x + 14, y: source.y - 14 }
    snapshot()
    applyImages([...imagesRef.current, copy])
    setSelectedImageId(copy.id)
  }

  function addStroke(page: number, points: [number, number][]) {
    if (points.length < 2) return
    const stroke: StrokeEdit = {
      id: uid(),
      page,
      points,
      color: drawColor,
      width: drawWidth,
      opacity: 1,
    }
    snapshot()
    applyStrokes([...strokesRef.current, stroke])
    setSelectedStrokeId(stroke.id)
    setSelectedId(null)
    setSelectedImageId(null)
  }

  function updateStroke(id: string, patch: Partial<StrokeEdit>) {
    applyStrokes(strokesRef.current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function removeStroke(id: string) {
    snapshot()
    applyStrokes(strokesRef.current.filter((item) => item.id !== id))
    setSelectedStrokeId(null)
  }

  function movePage(page: number, direction: -1 | 1) {
    const list = [...pageOrder]
    const index = list.indexOf(page)
    const target = index + direction
    if (index < 0 || target < 0 || target >= list.length) return
    ;[list[index], list[target]] = [list[target], list[index]]
    setPageOrder(list)
    setStatus(`Страница ${page} перемещена: новый порядок применится при скачивании`)
  }

  function togglePage(page: number) {
    setRemovedPages((previous) =>
      previous.includes(page) ? previous.filter((item) => item !== page) : [...previous, page],
    )
  }

  async function download() {
    if (!loaded) return
    setBusy(true)
    setError(null)
    try {
      const order = pageOrder.filter((page) => !removedPages.includes(page)).map((page) => page - 1)
      const output = await buildPdf(loaded.bytes, editsRef.current, loaded.password, {
        images: imagesRef.current,
        strokes: strokesRef.current,
        order,
      })
      savePdf(output, outputName(loaded.name, '-edited'))
      setStatus('Файл сохранён с изменениями')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось собрать PDF.')
    } finally {
      setBusy(false)
    }
  }

  async function removeProtection() {
    if (!loaded) return
    setBusy(true)
    setError(null)
    try {
      const output = await saveWithoutProtection(loaded.bytes, loaded.password)
      savePdf(output, outputName(loaded.name, '-unlocked'))
      setStatus('Защита снята, сохранена копия без ограничений')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось снять защиту.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT' || target?.isContentEditable
      if (event.key === 'Escape') {
        setEditingId(null)
        setAddMode(false)
        setDrawMode(false)
        return
      }
      const command = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (command && key === 'z') {
        if (typing) return
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (typing) return
      if (command && key === 'd') {
        event.preventDefault()
        if (selectedId) duplicateEdit(selectedId)
        return
      }
      if (command && key === 'c') {
        if (!selectedId) return
        event.preventDefault()
        copyEdit(selectedId)
        return
      }
      if (command && key === 'v') {
        event.preventDefault()
        pasteEdit()
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedImageId) {
          event.preventDefault()
          removeImage(selectedImageId)
          return
        }
        if (selectedStrokeId) {
          event.preventDefault()
          removeStroke(selectedStrokeId)
          return
        }
        if (!selectedId) return
        event.preventDefault()
        removeEdit(selectedId)
        return
      }
      if (selectedImageId) {
        const image = imagesRef.current.find((item) => item.id === selectedImageId)
        if (!image || image.locked) return
        const step = event.shiftKey ? 10 : 1
        const moves: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, step],
          ArrowDown: [0, -step],
        }
        const shift = moves[event.key]
        if (!shift) return
        event.preventDefault()
        updateImage(image.id, { x: image.x + shift[0], y: image.y + shift[1] })
        return
      }
      if (!selectedId) return
      const step = event.shiftKey ? 10 : 1
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
      }
      const move = moves[event.key]
      if (!move) return
      event.preventDefault()
      nudgeEdit(selectedId, move[0], move[1])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const selected = edits.find((edit) => edit.id === selectedId) ?? null
  const selectedImage = images.find((image) => image.id === selectedImageId) ?? null
  const selectedStroke = strokes.find((stroke) => stroke.id === selectedStrokeId) ?? null
  const editCount = edits.length

  /** Visual lines with their runs, used by the search box and replace-all. */
  const pageLineList = Object.values(runsByPage)
    .flatMap((runs) => pageLines(runs))
    .map((runs) => ({ runs, text: joinLine(runs), page: runs[0].page }))
    .filter((line) => line.text.trim())

  const searchResults = (() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return [] as typeof pageLineList
    return pageLineList.filter((line) => line.text.toLowerCase().includes(needle)).slice(0, 80)
  })()

  /** Replaces the query in every extracted line on the pages seen so far. */
  function replaceAll() {
    const needle = query.trim()
    if (!needle) return
    const next = [...editsRef.current]
    const taken = new Set(
      next
        .filter((edit) => edit.kind === 'replace' && edit.original)
        .map((edit) => `${edit.page}|${edit.original}`),
    )
    const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    let count = 0
    for (const line of pageLineList) {
      pattern.lastIndex = 0
      if (!pattern.test(line.text)) continue
      pattern.lastIndex = 0
      const key = `${line.page}|${line.text}`
      if (taken.has(key)) continue
      taken.add(key)
      const first = line.runs[0]
      const last = line.runs[line.runs.length - 1]
      next.push({
        id: uid(),
        page: line.page,
        kind: 'replace',
        x: first.x,
        y: first.y,
        width: Math.max(last.x + last.width - first.x + 6, 12),
        original: line.text,
        size: first.size,
        text: line.text.replace(pattern, replacement),
        font: first.font,
        bold: first.bold,
        align: 'left',
        color: [20, 20, 20],
        lineHeight: 1.18,
        letterSpacing: 0,
        underline: false,
        strike: false,
        opacity: 1,
        textCase: 'none',
        highlight: null,
        locked: false,
        cover: null,
      })
      count += 1
    }
    if (!count) {
      setStatus('Совпадений для замены нет на просмотренных страницах')
      return
    }
    commit(next)
    setStatus(`Заменено строк: ${count}`)
  }

  return (
    <div className="flex h-full flex-col bg-zinc-100">
      <Toolbar
        fileName={loaded?.name ?? null}
        pageCount={loaded?.pages.length ?? 0}
        protection={loaded?.protection ?? 'none'}
        busy={busy}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        zoom={zoom}
        addMode={addMode}
        editCount={editCount}
        rulers={rulers}
        snap={snap}
        drawMode={drawMode}
        onToggleRulers={() => setRulers((value) => !value)}
        onToggleSnap={() => setSnap((value) => !value)}
        onToggleDraw={() => {
          setDrawMode((value) => !value)
          setAddMode(false)
          setEditingId(null)
        }}
        onImageFile={(file) => void addImageFile(file)}
        onWord={() => {
          setWordFile(null)
          setWordOpen(true)
        }}
        onOpen={(file) => void openFile(file)}
        onUndo={undo}
        onRedo={redo}
        onZoom={(value) => setZoom(Math.min(3, Math.max(0.3, Math.round(value * 100) / 100)))}
        onToggleAdd={() => {
          setAddMode((value) => !value)
          setEditingId(null)
        }}
        onDownload={() => void download()}
        onRemoveProtection={() => void removeProtection()}
        onReset={() => {
          snapshot()
          applyState({ edits: [], images: [], strokes: [] })
          setPageOrder(loaded?.pages.map((page) => page.index) ?? [])
          setRemovedPages([])
          setSelectedId(null)
          setEditingId(null)
          setSelectedImageId(null)
          setSelectedStrokeId(null)
        }}
        onClose={closeFile}
      />

      {!loaded ? (
        <DropZone busy={busy} onFile={(file) => void openFile(file)} />
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-52 shrink-0 flex-col overflow-y-auto border-r border-zinc-200 bg-white px-3 py-4 md:flex">
            <h2 className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
              Документ
            </h2>
            <dl className="mt-2 space-y-1 text-[11px] text-zinc-500">
              <div className="flex justify-between gap-2">
                <dt>Страниц</dt>
                <dd className="font-medium text-zinc-800">{loaded.pages.length}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Правок</dt>
                <dd className="font-medium text-zinc-800">{editCount}</dd>
              </div>
            </dl>
            <p
              className={`mt-2 rounded-lg px-2 py-1.5 text-[11px] leading-relaxed ${
                loaded.protection === 'none'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              {PROTECTION_TEXT[loaded.protection]}
            </p>

            <details className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] text-zinc-600">
              <summary className="cursor-pointer font-medium text-zinc-700 select-none">
                Подсказки
              </summary>
              <ul className="mt-2 space-y-1.5 leading-relaxed">
                <li>• Клик по строке — правка текста. Esc — выйти, клик мимо — снять выделение.</li>
                <li>• Клик по картинке или линии открывает их свойства справа.</li>
                <li>• «+ Текст» — новый блок, «Изображение» — PNG-подпись или печать, «✏ Рисовать» — линия от руки.</li>
                <li>• При перетаскивании блок прилипает к строкам и блокам; кнопка «Привязка» отключает это.</li>
                <li>• Стрелки двигают на 1 pt, Shift+стрелки — на 10 pt, Delete удаляет.</li>
                <li>• Ctrl+Z / Ctrl+Shift+Z — отмена и повтор, Ctrl+D — дублировать, Ctrl+C / Ctrl+V — копировать и вставить.</li>
                <li>• «Копировать стиль» → «Применить стиль» переносит шрифт, цвет и интервалы на другой блок.</li>
                <li>• Найденная строка заменяется во всём документе кнопкой «Заменить всё» (страницы должны быть просмотрены).</li>
                <li>• «Скачать PDF» собирает файл локально; для .docx используется диалог печати с принтером «Сохранить как PDF».</li>
              </ul>
            </details>

            <h2 className="mt-5 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
              Страницы
            </h2>
            <ul className="mt-2 space-y-1">
              {pageOrder.map((page, position) => {
                const removed = removedPages.includes(page)
                return (
                  <li
                    key={page}
                    className={`flex items-center gap-1 rounded-md border px-1 py-0.5 text-[11px] ${
                      removed
                        ? 'border-dashed border-zinc-300 text-zinc-400'
                        : 'border-zinc-200 text-zinc-600'
                    }`}
                  >
                    <button
                      type="button"
                      className="w-7 text-left font-medium hover:text-indigo-600"
                      onClick={() =>
                        document.getElementById(`page-${page}`)?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        })
                      }
                      title="Перейти к странице"
                    >
                      {removed ? '—' : position + 1}
                    </button>
                    <span className="flex-1 truncate text-[10px] text-zinc-400">
                      {removed ? 'удалена' : `стр. ${page}`}
                    </span>
                    <button
                      type="button"
                      className="rounded px-1 hover:bg-zinc-100"
                      onClick={() => movePage(page, -1)}
                      disabled={position === 0}
                      title="Переместить выше"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="rounded px-1 hover:bg-zinc-100"
                      onClick={() => movePage(page, 1)}
                      disabled={position === pageOrder.length - 1}
                      title="Переместить ниже"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="rounded px-1 hover:bg-zinc-100"
                      onClick={() => togglePage(page)}
                      title={removed ? 'Вернуть страницу' : 'Удалить страницу из файла'}
                    >
                      {removed ? '↺' : '✕'}
                    </button>
                  </li>
                )
              })}
            </ul>

            <h2 className="mt-5 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
              Поиск и замена
            </h2>
            <div className="mt-2 space-y-1">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Найти текст"
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-[11px] outline-none focus:border-indigo-500"
              />
              <input
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
                placeholder="Заменить на"
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-[11px] outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                className="tool w-full"
                onClick={replaceAll}
                disabled={!query.trim()}
                title="Заменить во всех просмотренных строках"
              >
                Заменить всё
              </button>
              {query.trim() && (
                <p className="text-[10px] text-zinc-400">
                  Найдено: {searchResults.length}
                  {searchResults.length >= 80 ? ' (первые 80)' : ''}
                </p>
              )}
              <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                {searchResults.slice(0, 20).map((line, index) => (
                  <li key={`${line.page}-${line.runs[0].id}-${index}`}>
                    <button
                      type="button"
                      className="w-full truncate rounded px-1 py-0.5 text-left text-[10px] text-zinc-600 hover:bg-indigo-50"
                      title={line.text}
                      onClick={() =>
                        document.getElementById(`page-${line.page}`)?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'center',
                        })
                      }
                    >
                      стр. {line.page} · {line.text}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <h2 className="mt-5 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
              Правки
            </h2>
            {editCount === 0 ? (
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
                Кликните по тексту на странице, чтобы изменить его.
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {edits.map((edit) => (
                  <li key={edit.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(edit.id)
                        setEditingId(null)
                        document.getElementById(`page-${edit.page}`)?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'center',
                        })
                      }}
                      className={`w-full truncate rounded-md px-2 py-1 text-left text-[11px] ${
                        edit.id === selectedId
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'text-zinc-600 hover:bg-zinc-50'
                      }`}
                      title={edit.text}
                    >
                      стр. {edit.page} · {edit.text.trim() || 'пусто'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <main className="relative min-w-0 flex-1 overflow-auto">
            <div className="mx-auto w-fit max-w-full px-6 py-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white/80 px-4 py-2 text-[11px] text-zinc-500">
                <span>
                  {addMode
                    ? 'Кликните по странице, чтобы поставить новый текстовый блок'
                    : drawMode
                      ? 'Ведите мышью по странице, чтобы нарисовать линию или подпись'
                      : 'Кликните по строке, чтобы править текст. Esc — выйти. Свойства — справа.'}
                </span>
                <span className="text-zinc-400">
                  Блоки прилипают к краям и базовым линиям соседних строк · картинку тяните
                  мышью, уголком — размер</span>
              </div>
              <div className="flex flex-col items-center gap-6">
                {pageOrder
                  .filter((page) => !removedPages.includes(page))
                  .map((pageNumber, position) => {
                  const page = loaded.pages[pageNumber - 1]
                  if (!page) return null
                  return (
                  <div key={pageNumber} id={`page-${pageNumber}`}>
                    <PageFrame
                      rulers={rulers}
                      width={page.width * zoom}
                      height={page.height * zoom}
                      zoom={zoom}
                    >
                      <PageView
                        doc={preview?.doc ?? loaded.doc}
                        info={page}
                        label={position + 1}
                        zoom={zoom}
                        edits={edits}
                        images={images}
                        strokes={strokes}
                        selectedImageId={selectedImageId}
                        selectedStrokeId={selectedStrokeId}
                        drawMode={drawMode}
                        drawColor={drawColor}
                        drawWidth={drawWidth}
                        onSelectImage={(id) => {
                          setSelectedImageId(id)
                          if (id) {
                            setSelectedId(null)
                            setEditingId(null)
                            setSelectedStrokeId(null)
                          }
                        }}
                        onSelectStroke={(id) => {
                          setSelectedStrokeId(id)
                          if (id) {
                            setSelectedId(null)
                            setEditingId(null)
                            setSelectedImageId(null)
                          }
                        }}
                        onMoveImage={(id, x, y) => updateImage(id, { x, y })}
                        onResizeImage={(id, width, height) => updateImage(id, { width, height })}
                        onStroke={addStroke}
                        blanked={preview?.blanked ?? EMPTY_BLANKED}
                        selectedId={selectedId}
                        editingId={editingId}
                        addMode={addMode}
                        onEditRun={editRun}
                        onAddAt={addAt}
                        onSelect={(id) => {
                          setSelectedId(id)
                          if (!id) setEditingId(null)
                        }}
                        onStartEditing={setEditingId}
                        onFinishEditing={finishEditing}
                        onText={(id, text) => updateEdit(id, { text })}
                        onSnapshot={snapshot}
                        onMoveTo={moveEdit}
                        onResize={(id, width) => updateEdit(id, { width })}
                        snap={snap}
                        onRuns={(page, next) =>
                          setRunsByPage((previous) =>
                            previous[page] === next ? previous : { ...previous, [page]: next },
                          )
                        }
                      />
                    </PageFrame>
                  </div>
                  )
                })}
              </div>
              <p className="mt-6 max-w-2xl pb-4 text-center text-[10px] leading-relaxed text-zinc-400">
                Работает офлайн: файл читается и записывается в вашем браузере. Снятие
                защиты допустимо только для документов, к которым у вас есть права.
                Заменённая строка вырезается из текстового потока страницы — и в превью,
                и в файле, поэтому фон и линии таблицы не повреждаются. Если строку снять
                не удалось, используется подложка, и такой текст остаётся доступным поиску.
                <br />
                PDF Правка · MIT · автор Buffy (Freebuff coding agent)
              </p>
            </div>
          </main>

          <aside className="w-64 shrink-0 overflow-y-auto border-l border-zinc-200 bg-white">
            {selectedImage ? (
              <ImagePanel
                image={selectedImage}
                onChange={(patch) => updateImage(selectedImage.id, patch)}
                onDuplicate={() => duplicateImage(selectedImage.id)}
                onRemove={() => removeImage(selectedImage.id)}
              />
            ) : selectedStroke ? (
              <StrokePanel
                stroke={selectedStroke}
                onChange={(patch) => updateStroke(selectedStroke.id, patch)}
                onRemove={() => removeStroke(selectedStroke.id)}
              />
            ) : selected ? (
              <PropertiesPanel
                edit={selected}
                onChange={(patch) => {
                  updateEdit(selected.id, patch)
                  if (patch.locked) setEditingId(null)
                }}
                onSnapshot={snapshot}
                onRemove={() => removeEdit(selected.id)}
                onDuplicate={() => duplicateEdit(selected.id)}
                onAlign={alignToNeighbour}
                onCopyStyle={() => copyStyle(selected.id)}
                onPasteStyle={() => pasteStyle(selected.id)}
                canPasteStyle={hasStyle}
                onCenter={() => centerEdit(selected.id)}
                onRaise={() => moveLayer(selected.id, 1)}
                onLower={() => moveLayer(selected.id, -1)}
              />
            ) : (
              <EmptyPanel
                editCount={editCount}
                rulers={rulers}
                snap={snap}
                onToggleRulers={() => setRulers((value) => !value)}
                onToggleSnap={() => setSnap((value) => !value)}
              />
            )}
          </aside>
        </div>
      )}

      <WordToPdf open={wordOpen} file={wordFile} onClose={() => setWordOpen(false)} />

      {passwordPrompt && (
        <PasswordDialog
          incorrect={passwordPrompt.incorrect}
          onSubmit={(value) => {
            passwordPrompt.resolve(value)
            setPasswordPrompt(null)
          }}
          onCancel={() => {
            passwordPrompt.resolve('')
            setPasswordPrompt(null)
          }}
        />
      )}

      {(status || error) && (
        <div
          className={`pointer-events-none fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-xl px-4 py-2 text-xs shadow-lg ${
            error ? 'bg-red-600 text-white' : 'bg-zinc-900 text-white'
          }`}
        >
          {error ?? status}
        </div>
      )}
    </div>
  )
}

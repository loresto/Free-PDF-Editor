import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { runsFromItems } from '../pdf/pdfjs'
import { freeSpaceRight, inkBox, renderPage, sampleCover, type Box } from '../pdf/render'
import { displayText, wrapText, canvasMeasure } from '../pdf/model'
import type {
  Cover,
  ImageEdit,
  LineDraft,
  PageInfo,
  Rgb,
  StrokeEdit,
  TextEdit,
  TextRun,
} from '../pdf/model'

type Props = {
  doc: PDFDocumentProxy
  info: PageInfo
  zoom: number
  edits: TextEdit[]
  /** Edits whose original text is already cut out of the rendered page. */
  blanked: Set<string>
  selectedId: string | null
  editingId: string | null
  addMode: boolean
  onEditRun: (draft: LineDraft) => void
  onAddAt: (page: number, x: number, y: number) => void
  onSelect: (id: string | null) => void
  onStartEditing: (id: string | null) => void
  onFinishEditing: (id: string | null) => void
  onText: (id: string, text: string) => void
  onSnapshot: () => void
  onMoveTo: (id: string, x: number, y: number) => void
  onResize: (id: string, width: number) => void
  /** Auto-alignment while dragging. */
  snap: boolean
  onRuns: (page: number, runs: TextRun[]) => void
  images: ImageEdit[]
  strokes: StrokeEdit[]
  selectedImageId: string | null
  selectedStrokeId: string | null
  drawMode: boolean
  drawColor: Rgb
  drawWidth: number
  /** Page number shown under the sheet, when pages are reordered or removed. */
  label: number
  onSelectImage: (id: string | null) => void
  onSelectStroke: (id: string | null) => void
  onMoveImage: (id: string, x: number, y: number) => void
  onResizeImage: (id: string, width: number, height: number) => void
  onStroke: (page: number, points: [number, number][]) => void
}

function nearest(values: number[], target: number, tolerance: number): number | null {
  let best: number | null = null
  let bestDistance = tolerance
  for (const value of values) {
    const distance = Math.abs(value - target)
    if (distance <= bestDistance) {
      bestDistance = distance
      best = value
    }
  }
  return best
}

const FONT_STACK = {
  sans: '"Noto Sans Document", system-ui, sans-serif',
  serif: '"Noto Serif Document", Georgia, serif',
} as const

function coverBackground(cover: Cover): string {
  const colors = cover.colors?.length ? cover.colors : [cover.color]
  if (colors.length === 1) return `rgb(${colors[0].join(',')})`
  const step = 100 / colors.length
  const stops = colors
    .map((color, index) => {
      const from = (index * step).toFixed(2)
      const to = ((index + 1) * step).toFixed(2)
      return `rgb(${color.join(',')}) ${from}% ${to}%`
    })
    .join(', ')
  return `linear-gradient(to bottom, ${stops})`
}

export function PageView({
  doc,
  info,
  zoom,
  edits,
  blanked,
  selectedId,
  editingId,
  addMode,
  onEditRun,
  onAddAt,
  onSelect,
  onStartEditing,
  onFinishEditing,
  onText,
  onSnapshot,
  onMoveTo,
  onResize,
  snap,
  onRuns,
  images,
  strokes,
  selectedImageId,
  selectedStrokeId,
  drawMode,
  drawColor,
  drawWidth,
  label,
  onSelectImage,
  onSelectStroke,
  onMoveImage,
  onResizeImage,
  onStroke,
}: Props) {
  const holderRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pageRef = useRef<PDFPageProxy | null>(null)
  const [runs, setRuns] = useState<TextRun[]>([])
  const [visible, setVisible] = useState(false)
  const [rendered, setRendered] = useState(false)
  /** Alignment guides (PDF points) shown while dragging. */
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  })
  /** Points of the line being drawn right now (PDF space). */
  const [draft, setDraft] = useState<[number, number][] | null>(null)

  useEffect(() => {
    const holder = holderRef.current
    if (!holder) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setVisible(true)
      },
      { rootMargin: '300px 0px' },
    )
    observer.observe(holder)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    let task: { cancel: () => void } | null = null
    void (async () => {
      const page = await doc.getPage(info.index)
      if (cancelled) return
      pageRef.current = page
      const canvas = canvasRef.current
      if (!canvas) return
      task = renderPage(page, canvas, zoom)
      try {
        await (task as unknown as { promise: Promise<void> }).promise
      } catch {
        return
      }
      if (cancelled) return
      setRendered(true)
      const content = await page.getTextContent()
      if (cancelled) return
      setRuns(
        runsFromItems(
          content.items.filter((item) => 'str' in item) as never,
          content.styles as never,
          info.index,
        ),
      )
    })()
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, info.index, zoom, visible])

  useEffect(() => {
    onRuns(info.index, runs)
  }, [runs, info.index, onRuns])

  const pageWidth = info.width * zoom
  const pageHeight = info.height * zoom
  const viewport = () => pageRef.current?.getViewport({ scale: zoom })

  function runBox(run: TextRun): Box {
    const vp = viewport()
    if (!vp) return { left: 0, top: 0, width: 0, height: 0 }
    const descent = run.size * 0.24
    const [x1, y1] = vp.convertToViewportPoint(run.x, run.y - descent)
    const [x2, y2] = vp.convertToViewportPoint(run.x + run.width, run.y + run.size)
    return {
      left: Math.min(x1, x2),
      top: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    }
  }

  function editTop(edit: TextEdit): { left: number; top: number } {
    const vp = viewport()
    if (!vp) return { left: 0, top: 0 }
    const [x, y] = vp.convertToViewportPoint(edit.x, edit.y)
    return { left: x, top: y - edit.size * zoom * 0.78 }
  }

  function coverBox(edit: TextEdit): Box | null {
    if (!edit.cover) return null
    const vp = viewport()
    if (!vp) return null
    const [x1, y1] = vp.convertToViewportPoint(edit.cover.x, edit.cover.y)
    const [x2, y2] = vp.convertToViewportPoint(
      edit.cover.x + edit.cover.width,
      edit.cover.y + edit.cover.height,
    )
    return {
      left: Math.min(x1, x2),
      top: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    }
  }

  /**
   * Collects the runs that visually form one line around the clicked run.
   * PDFs produced by 1C/Word often split a line into label + value fragments;
   * editing them separately leaves the neighbouring fragment visible under the
   * replacement, so the whole line is edited at once.
   */
  function lineRuns(run: TextRun): TextRun[] {
    const sameLine = runs
      .filter(
        (item) =>
          item.page === run.page &&
          Math.abs(item.y - run.y) <= Math.max(1.2, Math.min(item.size, run.size) * 0.3),
      )
      .sort((a, b) => a.x - b.x)
    const index = sameLine.findIndex((item) => item.id === run.id)
    if (index < 0) return [run]
    const gapLimit = Math.max(2.5, run.size * 1.3)
    let start = index
    let end = index
    while (start > 0) {
      const previous = sameLine[start - 1]
      if (sameLine[start].x - (previous.x + previous.width) > gapLimit) break
      start -= 1
    }
    while (end < sameLine.length - 1) {
      const current = sameLine[end]
      const next = sameLine[end + 1]
      if (next.x - (current.x + current.width) > gapLimit) break
      end += 1
    }
    return sameLine.slice(start, end + 1)
  }

  /**
   * Drops runs drawn on top of each other (OCR/1C overlays): the longer visible
   * text wins, but both stay inside the cover so nothing shows through.
   */
  function visibleRuns(group: TextRun[]): TextRun[] {
    const kept = group.filter((item, index) =>
      !group.some((other, otherIndex) => {
        if (otherIndex === index) return false
        const overlap =
          Math.min(item.x + item.width, other.x + other.width) - Math.max(item.x, other.x)
        if (overlap <= 0) return false
        const shorter = Math.min(item.width, other.width) || 1
        if (overlap / shorter < 0.55) return false
        const size = item.text.trim().length
        const otherSize = other.text.trim().length
        return otherSize > size || (otherSize === size && otherIndex < index)
      }),
    )
    return kept.length ? kept : group
  }

  function joinRuns(group: TextRun[]): string {
    let text = ''
    group.forEach((item, index) => {
      if (index > 0) {
        const previous = group[index - 1]
        const gap = item.x - (previous.x + previous.width)
        // Runs are often split mid-word, so a space is added only where one is
        // expected: after punctuation or on a visible gap.
        const spaceNeeded =
          /[:;,.!?]$/.test(previous.text.trimEnd()) || gap > Math.max(0.4, item.size * 0.12)
        if (spaceNeeded && !/\s$/.test(text) && !/^\s/.test(item.text)) text += ' '
      }
      text += item.text
    })
    return text.replace(/\s+/g, ' ').trim()
  }

  function unionBox(group: TextRun[]): Box {
    const boxes = group.map(runBox)
    const left = Math.min(...boxes.map((box) => box.left))
    const top = Math.min(...boxes.map((box) => box.top))
    const right = Math.max(...boxes.map((box) => box.left + box.width))
    const bottom = Math.max(...boxes.map((box) => box.top + box.height))
    return { left, top, width: right - left, height: bottom - top }
  }

  function handleRunClick(run: TextRun) {
    const canvas = canvasRef.current
    const view = viewport()
    const group = lineRuns(run)
    const visible = visibleRuns(group)
    const box = unionBox(group)
    let ink = box
    let colors: [number, number, number][] = [[255, 255, 255]]
    let extraWidth = 0
    if (canvas) {
      // Background first, then the real ink bounds, then per-band colours.
      const background = sampleCover(canvas, box, 1)?.colors[0] ?? [255, 255, 255]
      ink = inkBox(canvas, box, background) ?? box
      // Sample the cell background around the letters, never on them.
      const padX = Math.max(4, ink.width * 0.08)
      const padY = Math.max(1.5, ink.height * 0.12)
      colors =
        sampleCover(
          canvas,
          {
            left: ink.left - padX,
            top: ink.top - padY,
            width: ink.width + padX * 2,
            height: ink.height + padY * 2,
          },
          6,
          ink,
        )?.colors ?? [background]
      // Let the replacement use the empty space on the right (table cell width)
      // so it wraps less often than the original narrow run.
      extraWidth = freeSpaceRight(canvas, box, background, pageWidth * 0.6) / zoom
    }

    let cover: Cover | null = null
    if (view) {
      const [x1, y1] = view.convertToPdfPoint(ink.left - 0.5, ink.top - 0.5)
      const [x2, y2] = view.convertToPdfPoint(
        ink.left + ink.width + 0.5,
        ink.top + ink.height + 0.5,
      )
      cover = {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
        color: colors[0],
        colors,
      }
    }

    const first = visible[0]
    const last = visible[visible.length - 1]
    onEditRun({
      page: run.page,
      x: first.x,
      y: run.y,
      width: Math.max(last.x + last.width - first.x + extraWidth, run.size * 2),
      size: run.size,
      font: run.font,
      bold: run.bold,
      text: joinRuns(visible),
      cover,
    })
  }

  function handleBackgroundClick(event: React.MouseEvent<HTMLDivElement>) {
    if (addMode) {
      const vp = viewport()
      if (!vp) return
      const rect = event.currentTarget.getBoundingClientRect()
      const [x, y] = vp.convertToPdfPoint(event.clientX - rect.left, event.clientY - rect.top)
      onAddAt(info.index, x, y)
      return
    }
    onSelect(null)
    onSelectImage(null)
    onSelectStroke(null)
  }

  function imageBox(image: ImageEdit): { left: number; top: number; width: number; height: number } {
    const vp = viewport()
    if (!vp) return { left: 0, top: 0, width: 0, height: 0 }
    const [x, y] = vp.convertToViewportPoint(image.x, image.y + image.height)
    return { left: x, top: y, width: image.width * zoom, height: image.height * zoom }
  }

  function startImageDrag(event: React.PointerEvent, image: ImageEdit) {
    event.preventDefault()
    event.stopPropagation()
    onSelectImage(image.id)
    if (image.locked) return
    onSnapshot()
    const originX = image.x
    const originY = image.y
    const startX = event.clientX
    const startY = event.clientY
    const move = (moveEvent: PointerEvent) => {
      onMoveImage(
        image.id,
        originX + (moveEvent.clientX - startX) / zoom,
        originY - (moveEvent.clientY - startY) / zoom,
      )
    }
    const finish = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
  }

  function startImageResize(event: React.PointerEvent, image: ImageEdit) {
    event.preventDefault()
    event.stopPropagation()
    if (image.locked) return
    onSnapshot()
    const originWidth = image.width
    const ratio = image.height / Math.max(1, image.width)
    const startX = event.clientX
    const move = (moveEvent: PointerEvent) => {
      const width = Math.max(4, originWidth + (moveEvent.clientX - startX) / zoom)
      onResizeImage(image.id, Math.round(width * 10) / 10, Math.round(width * ratio * 10) / 10)
    }
    const finish = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
  }

  /** Freehand pen: collects PDF points while the pointer is down. */
  function startDrawing(event: React.PointerEvent<HTMLDivElement>) {
    const vp = viewport()
    if (!vp || !drawMode) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const toPdf = (clientX: number, clientY: number): [number, number] =>
      vp.convertToPdfPoint(clientX - rect.left, clientY - rect.top) as [number, number]
    const points: [number, number][] = [toPdf(event.clientX, event.clientY)]
    setDraft(points)
    const move = (moveEvent: PointerEvent) => {
      const point = toPdf(moveEvent.clientX, moveEvent.clientY)
      const last = points[points.length - 1]
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 0.8) return
      points.push(point)
      setDraft([...points])
    }
    const finish = () => {
      setDraft(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      if (points.length > 1) onStroke(info.index, points)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
  }

  function startDrag(event: React.PointerEvent, edit: TextEdit) {
    event.preventDefault()
    event.stopPropagation()
    if (edit.locked) return
    onSnapshot()
    const originX = edit.x
    const originY = edit.y
    const startX = event.clientX
    const startY = event.clientY
    // Auto-alignment: the block snaps to the edges and baselines of other text
    // and to the other edits, so columns line up without manual precision.
    const xTargets: number[] = []
    const yTargets: number[] = []
    for (const run of runs) {
      if (run.page !== edit.page) continue
      xTargets.push(run.x)
      yTargets.push(run.y)
    }
    for (const item of edits) {
      if (item.page !== edit.page || item.id === edit.id) continue
      xTargets.push(item.x)
      yTargets.push(item.y)
      xTargets.push(item.x + item.width)
    }
    const tolerance = 4 / zoom
    const move = (moveEvent: PointerEvent) => {
      let x = originX + (moveEvent.clientX - startX) / zoom
      let y = originY - (moveEvent.clientY - startY) / zoom
      const snapX = snap ? nearest(xTargets, x, tolerance) : null
      const snapY = snap ? nearest(yTargets, y, tolerance) : null
      if (snapX !== null) x = snapX
      if (snapY !== null) y = snapY
      setGuides({ x: snapX, y: snapY })
      onMoveTo(edit.id, x, y)
    }
    const finish = () => {
      setGuides({ x: null, y: null })
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
  }

  /** Drags the right edge of a block to change its wrap width. */
  function startResize(event: React.PointerEvent, edit: TextEdit) {
    event.preventDefault()
    event.stopPropagation()
    if (edit.locked) return
    onSnapshot()
    const originWidth = edit.width
    const startX = event.clientX
    const xTargets = runs.filter((run) => run.page === edit.page).map((run) => run.x)
    const move = (moveEvent: PointerEvent) => {
      let width = Math.max(10, originWidth + (moveEvent.clientX - startX) / zoom)
      const target = snap ? nearest(xTargets, edit.x + width, 4 / zoom) : null
      if (target !== null) width = Math.max(10, target - edit.x)
      setGuides({ x: target, y: null })
      onResize(edit.id, Math.round(width * 10) / 10)
    }
    const finish = () => {
      setGuides({ x: null, y: null })
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
  }

  const verticalGuide = guides.x !== null ? viewport()?.convertToViewportPoint(guides.x, 0)[0] : null
  const horizontalGuide =
    guides.y !== null ? viewport()?.convertToViewportPoint(0, guides.y)[1] : null

  const pageEdits = edits.filter((edit) => edit.page === info.index)
  const pageImages = images.filter((image) => image.page === info.index)
  const pageStrokes = strokes.filter((stroke) => stroke.page === info.index)

  return (
    <div
      ref={holderRef}
      className="relative shrink-0"
      style={{ width: pageWidth, height: pageHeight }}
    >
      <div
        className="paper relative h-full w-full overflow-hidden bg-white"
        onClick={handleBackgroundClick}
        style={{ cursor: addMode ? 'crosshair' : 'default' }}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
        {verticalGuide !== null && verticalGuide !== undefined && (
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-indigo-500/80"
            style={{ left: verticalGuide }}
          />
        )}
        {horizontalGuide !== null && horizontalGuide !== undefined && (
          <div
            className="pointer-events-none absolute inset-x-0 h-px bg-indigo-500/80"
            style={{ top: horizontalGuide }}
          />
        )}
        {!rendered && (
          <div className="absolute inset-0 grid place-items-center text-xs text-zinc-400">
            Страница {info.index}…
          </div>
        )}

        <div className="absolute inset-0">
          {runs.map((run) => {
            const box = runBox(run)
            return (
              <button
                key={run.id}
                type="button"
                title={addMode ? undefined : 'Изменить этот текст'}
                onClick={(event) => {
                  if (addMode) return
                  event.stopPropagation()
                  handleRunClick(run)
                }}
                className="absolute cursor-text rounded-[2px] bg-transparent hover:bg-sky-400/20 hover:ring-1 hover:ring-sky-500/50"
                data-run={run.id}
                style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
              />
            )
          })}
        </div>

        <div className="pointer-events-none absolute inset-0">
          {pageImages.map((image) => {
            const box = imageBox(image)
            const selected = image.id === selectedImageId
            return (
              <div
                key={image.id}
                onPointerDown={(event) => startImageDrag(event, image)}
                onClick={(event) => event.stopPropagation()}
                className={`pointer-events-auto absolute ${
                  selected ? 'ring-2 ring-indigo-500' : 'hover:ring-1 hover:ring-indigo-400/60'
                }`}
                style={{
                  left: box.left,
                  top: box.top,
                  width: box.width,
                  height: box.height,
                  transform: image.rotation ? `rotate(${-image.rotation}deg)` : undefined,
                  transformOrigin: 'center',
                  opacity: image.opacity,
                  cursor: image.locked ? 'default' : 'move',
                }}
              >
                <img
                  src={image.dataUrl}
                  alt={image.label}
                  draggable={false}
                  className="h-full w-full select-none object-fill"
                />
                {selected && !image.locked && (
                  <div
                    onPointerDown={(event) => startImageResize(event, image)}
                    onClick={(event) => event.stopPropagation()}
                    className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-indigo-500"
                    title="Изменить размер"
                  />
                )}
              </div>
            )
          })}
        </div>

        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {pageStrokes.map((stroke) => (
            <polyline
              key={stroke.id}
              points={stroke.points
                .map(([x, y]) => viewport()?.convertToViewportPoint(x, y) ?? [0, 0])
                .map(([x, y]) => `${x},${y}`)
                .join(' ')}
              fill="none"
              stroke={`rgb(${stroke.color.join(',')})`}
              strokeWidth={Math.max(0.5, stroke.width * zoom)}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={stroke.opacity}
              style={{
                pointerEvents: drawMode ? 'none' : 'stroke',
                cursor: 'pointer',
                filter:
                  stroke.id === selectedStrokeId
                    ? 'drop-shadow(0 0 1.5px rgb(99,102,241))'
                    : undefined,
              }}
              onPointerDown={(event) => {
                if (drawMode) return
                event.stopPropagation()
                onSelectStroke(stroke.id)
                onSelect(null)
                onSelectImage(null)
              }}
              onClick={(event) => event.stopPropagation()}
            />
          ))}
          {draft && (
            <polyline
              points={draft
                .map(([x, y]) => viewport()?.convertToViewportPoint(x, y) ?? [0, 0])
                .map(([x, y]) => `${x},${y}`)
                .join(' ')}
              fill="none"
              stroke={`rgb(${drawColor.join(',')})`}
              strokeWidth={Math.max(0.5, drawWidth * zoom)}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>

        <div className="pointer-events-none absolute inset-0">
          {pageEdits.map((edit) => {
            // A blanked line is physically gone from the page, so painting a
            // patch over it would only damage the background.
            const cover = blanked.has(edit.id) ? null : coverBox(edit)
            const pos = editTop(edit)
            const selected = edit.id === selectedId
            const editing = edit.id === editingId
            const shown = displayText(edit)
            const step = edit.size * (edit.lineHeight || 1.18)
            const lineCount = edit.text.trim()
              ? wrapText(shown, edit.size, edit.width, canvasMeasure(edit.font, edit.bold), edit.letterSpacing || 0).length
              : 1
            const decorations = [edit.underline ? 'underline' : '', edit.strike ? 'line-through' : '']
              .filter(Boolean)
              .join(' ')
            const pad = edit.highlight ? edit.highlight.padding * zoom : 0
            return (
              <div key={edit.id}>
                {cover && (
                  <div
                    className="pointer-events-auto absolute"
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelect(edit.id)
                    }}
                    style={{
                      left: cover.left,
                      top: cover.top,
                      width: cover.width,
                      height: cover.height,
                      background: coverBackground(edit.cover!),
                    }}
                  />
                )}
                <div
                  className={`group pointer-events-auto absolute ${
                    selected ? 'ring-2 ring-indigo-500' : 'hover:ring-1 hover:ring-indigo-400/60'
                  }`}
                  style={{
                    left: pos.left,
                    top: pos.top,
                    width: edit.width * zoom,
                    cursor: edit.locked ? 'default' : undefined,
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    // Clicks inside the block (including the textarea, where the
                    // caret is placed between letters) must never reach the page
                    // background, or the selection is cleared mid-edit.
                    event.stopPropagation()
                    if (editing) return
                    onSelect(edit.id)
                    if (!edit.locked) onStartEditing(edit.id)
                  }}
                >
                  {edit.highlight && (
                    <div
                      className="pointer-events-none absolute"
                      style={{
                        left: -pad,
                        top: -pad,
                        width: edit.width * zoom + pad * 2,
                        height: lineCount * step * zoom + pad * 2,
                        background: `rgb(${edit.highlight.color.join(',')})`,
                        opacity: edit.opacity ?? 1,
                      }}
                    />
                  )}
                  {editing ? (
                    <textarea
                      autoFocus
                      value={edit.text}
                      onChange={(event) => onText(edit.id, event.target.value)}
                      onFocus={() => onSnapshot()}
                      onBlur={() => onFinishEditing(edit.id)}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault()
                          onFinishEditing(edit.id)
                        }
                      }}
                      rows={Math.max(1, edit.text.split('\n').length)}
                      spellCheck={false}
                      className="block w-full resize-none overflow-hidden bg-transparent p-0 outline-none"
                      style={{
                        fontFamily: FONT_STACK[edit.font],
                        fontWeight: edit.bold ? 700 : 400,
                        fontSize: edit.size * zoom,
                        lineHeight: edit.lineHeight || 1.18,
                        letterSpacing: (edit.letterSpacing || 0) * zoom,
                        color: `rgb(${edit.color.join(',')})`,
                        textAlign: edit.align,
                        textDecorationLine: (decorations || 'none') as 'none',
                        opacity: edit.opacity ?? 1,
                      }}
                    />
                  ) : (
                    <div
                      className="whitespace-pre-wrap break-words"
                      style={{
                        fontFamily: FONT_STACK[edit.font],
                        fontWeight: edit.bold ? 700 : 400,
                        fontSize: edit.size * zoom,
                        lineHeight: edit.lineHeight || 1.18,
                        letterSpacing: (edit.letterSpacing || 0) * zoom,
                        color: `rgb(${edit.color.join(',')})`,
                        textAlign: edit.align,
                        textDecorationLine: (decorations || 'none') as 'none',
                        opacity: edit.opacity ?? 1,
                        minHeight: edit.size * zoom * (edit.lineHeight || 1.18),
                      }}
                    >
                      {shown || '\u00a0'}
                    </div>
                  )}
                  {selected && !edit.locked && (
                    <>
                      <div
                        onPointerDown={(event) => startDrag(event, edit)}
                        className="absolute -left-6 -top-1 cursor-move rounded bg-indigo-500 px-1 py-0.5 text-[10px] leading-none text-white select-none"
                        title="Перетащить"
                      >
                        ⠿
                      </div>
                      <div
                        onPointerDown={(event) => startResize(event, edit)}
                        className="absolute -right-1.5 top-0 h-full w-2.5 cursor-ew-resize rounded bg-indigo-500/30 hover:bg-indigo-500/60"
                        title="Изменить ширину"
                      />
                    </>
                  )}
                  {selected && edit.locked && (
                    <div
                      className="absolute -left-6 -top-1 rounded bg-zinc-700 px-1 py-0.5 text-[10px] leading-none text-white select-none"
                      title="Блок заблокирован"
                    >
                      🔒
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {drawMode && (
        <div
          className="absolute inset-0 cursor-crosshair"
          style={{ touchAction: 'none' }}
          onPointerDown={startDrawing}
        />
      )}
      <div className="mt-2 text-center text-[11px] text-zinc-500">{label}</div>
    </div>
  )
}

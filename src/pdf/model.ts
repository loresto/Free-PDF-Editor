export type FontFamily = 'sans' | 'serif'
export type Align = 'left' | 'center' | 'right'
export type TextCase = 'none' | 'upper' | 'lower'
export type Rgb = [number, number, number]

/** Colour plate behind a text block. */
export type Highlight = {
  color: Rgb
  padding: number
}

export type Cover = {
  x: number
  y: number
  width: number
  height: number
  /** Basic colour, used when there are no vertical bands. */
  color: Rgb
  /** Optional vertical bands (top to bottom) so gradients stay invisible. */
  colors?: Rgb[]
}

/** A change laid over the original page. Coordinates are PDF points (origin bottom-left). */
export type TextEdit = {
  id: string
  page: number
  kind: 'replace' | 'add'
  /** Left edge of the text box. */
  x: number
  /** Baseline of the first line. */
  y: number
  /** Wrap width in points. */
  width: number
  /** Original line text, so the export can find and delete it in the stream. */
  original?: string
  size: number
  text: string
  font: FontFamily
  bold: boolean
  align: Align
  color: Rgb
  /** Line advance as a multiple of the font size. */
  lineHeight: number
  /** Extra space between characters, in points. */
  letterSpacing: number
  underline: boolean
  strike: boolean
  /** 0..1, applied to the text, its rules and the block highlight. */
  opacity: number
  textCase: TextCase
  highlight: Highlight | null
  /** Locked blocks keep their place: no dragging, resizing or text editing. */
  locked: boolean
  cover: Cover | null
}

/** An embedded picture: signature, stamp, logo or a photo. */
export type ImageEdit = {
  id: string
  page: number
  /** Bottom-left corner in PDF points. */
  x: number
  y: number
  width: number
  height: number
  opacity: number
  /** Counter-clockwise rotation in degrees, around the bottom-left corner. */
  rotation: number
  dataUrl: string
  label: string
  locked: boolean
}

/** A freehand line drawn with the pen, in PDF points. */
export type StrokeEdit = {
  id: string
  page: number
  points: [number, number][]
  color: Rgb
  width: number
  opacity: number
}

/** Page order and pages removed from the exported file. */
export type PageLayout = {
  /** Original 1-based page numbers in their new order. */
  order: number[]
  removed: number[]
}

export type TextRun = {
  id: string
  page: number
  text: string
  x: number
  y: number
  width: number
  size: number
  font: FontFamily
  bold: boolean
}

/** What a click on a text line hands to the editor. */
/** Groups runs that sit on one baseline, left to right. */
export function pageLines(runs: TextRun[]): TextRun[][] {
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: TextRun[][] = []
  for (const run of sorted) {
    const current = lines[lines.length - 1]
    if (current && Math.abs(current[0].y - run.y) <= Math.max(0.8, run.size * 0.3)) {
      current.push(run)
    } else {
      lines.push([run])
    }
  }
  return lines.map((line) => line.sort((a, b) => a.x - b.x))
}

/** Joined text of one visual line, with spaces where the runs are apart. */
export function joinLine(line: TextRun[]): string {
  let text = ''
  line.forEach((run, index) => {
    if (index > 0) {
      const previous = line[index - 1]
      const gap = run.x - (previous.x + previous.width)
      const needsSpace =
        /[:;,.!?]$/.test(previous.text.trimEnd()) || gap > Math.max(0.4, run.size * 0.12)
      if (needsSpace && !/\s$/.test(text) && !/^\s/.test(run.text)) text += ' '
    }
    text += run.text
  })
  return text.replace(/\s+/g, ' ').trim()
}

export type LineDraft = {
  page: number
  x: number
  y: number
  width: number
  size: number
  font: FontFamily
  bold: boolean
  text: string
  cover: Cover | null
}

export type PageInfo = {
  index: number
  width: number
  height: number
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value
  return [
    Number.parseInt(full.slice(0, 2), 16) || 0,
    Number.parseInt(full.slice(2, 4), 16) || 0,
    Number.parseInt(full.slice(4, 6), 16) || 0,
  ]
}

export type Measure = (text: string, size: number) => number

/** Width of one laid-out line, including the extra tracking. */
export function lineWidth(
  value: string,
  size: number,
  measure: Measure,
  letterSpacing = 0,
): number {
  return measure(value, size) + letterSpacing * Math.max(0, value.length - 1)
}

/** Greedy word wrap that matches the export pass. */
export function wrapText(
  text: string,
  size: number,
  width: number,
  measure: Measure,
  letterSpacing = 0,
): string[] {
  const lines: string[] = []
  const maxWidth = Math.max(width, size * 1.2)
  const fits = (value: string) => lineWidth(value, size, measure, letterSpacing) <= maxWidth
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    if (!paragraph.trim()) {
      lines.push('')
      continue
    }
    let line = ''
    for (const word of paragraph.split(/(\s+)/)) {
      const candidate = line + word
      if (line && !fits(candidate)) {
        lines.push(line.trimEnd())
        line = word.trimStart()
      } else {
        line = candidate
      }
      // A single word can be wider than the box: break it by characters.
      while (line && !fits(line)) {
        let cut = line.length - 1
        while (cut > 1 && !fits(line.slice(0, cut))) cut -= 1
        lines.push(line.slice(0, cut))
        line = line.slice(cut)
      }
    }
    lines.push(line.trimEnd())
  }
  return lines.length ? lines : ['']
}

/** Largest size (down to 4pt) that keeps the text within maxLines at this width. */
export function fitSize(
  text: string,
  width: number,
  size: number,
  maxLines: number,
  measure: Measure,
  letterSpacing = 0,
): number {
  for (let candidate = size; candidate >= 4; candidate -= 0.25) {
    if (
      wrapText(text || ' ', candidate, width, measure, letterSpacing).length <= maxLines
    )
      return Math.round(candidate * 100) / 100
  }
  return 4
}

/** Text as it is shown and exported (case transform applied). */
export function displayText(edit: Pick<TextEdit, 'text' | 'textCase'>): string {
  if (edit.textCase === 'upper') return edit.text.toUpperCase()
  if (edit.textCase === 'lower') return edit.text.toLowerCase()
  return edit.text
}

/** Baseline step for the given block, in points. */
export function lineStep(edit: Pick<TextEdit, 'size' | 'lineHeight'>): number {
  return edit.size * (edit.lineHeight || 1.18)
}

let measureCanvas: HTMLCanvasElement | null = null

/** Browser measurement for the preview, matching the bundled document fonts. */
export function canvasMeasure(font: FontFamily, bold: boolean): Measure {
  const stack =
    font === 'serif'
      ? '"Noto Serif Document", Georgia, serif'
      : '"Noto Sans Document", system-ui, sans-serif'
  return (text, size) => {
    if (!measureCanvas) measureCanvas = document.createElement('canvas')
    const context = measureCanvas.getContext('2d')
    if (!context) return text.length * size * 0.5
    context.font = `${bold ? 700 : 400} ${size}px ${stack}`
    return context.measureText(text).width
  }
}

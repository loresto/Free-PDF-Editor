// The legacy build ships the polyfills (Uint8Array.toHex and friends) that
// pdf.js 6 needs inside its worker on older Chromium.
import {
  getDocument,
  GlobalWorkerOptions,
  PasswordResponses,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type { FontFamily, PageInfo, TextRun } from './model'

GlobalWorkerOptions.workerSrc = workerUrl

type RawItem = {
  str: string
  transform: number[]
  width: number
  height: number
  fontName: string
}

type StyleMap = Record<string, { fontFamily?: string } | undefined>

export type AskPassword = (incorrect: boolean) => Promise<string>

export type OpenedPdf = {
  doc: PDFDocumentProxy
  password: string | undefined
  destroy: () => Promise<void>
}

/**
 * Opens a PDF in the viewer. When the file is encrypted, pdf.js asks for the
 * password through the dialog and we remember it for the export pass.
 */
export async function openPdfDocument(
  bytes: Uint8Array,
  password: string | undefined,
  askPassword: AskPassword,
): Promise<OpenedPdf> {
  // pdf.js may detach the buffer it is given, so it always gets a copy.
  const loadingTask = getDocument({
    data: bytes.slice(),
    password,
  })
  let used = password
  loadingTask.onPassword = (update: (value: string) => void, reason: number) => {
    void (async () => {
      const value = await askPassword(reason === PasswordResponses.INCORRECT_PASSWORD)
      used = value
      update(value)
    })()
  }
  const doc = await loadingTask.promise
  return { doc, password: used, destroy: () => loadingTask.destroy() }
}

export async function readPageInfos(doc: PDFDocumentProxy): Promise<PageInfo[]> {
  const infos: PageInfo[] = []
  for (let index = 1; index <= doc.numPages; index += 1) {
    const page = await doc.getPage(index)
    const viewport = page.getViewport({ scale: 1 })
    infos.push({ index, width: viewport.width, height: viewport.height })
  }
  return infos
}

function isSerif(family: string): boolean {
  const value = family.toLowerCase()
  if (/sans[-\s]?serif/.test(value)) return false
  return /serif|times|georgia|garamond|book|roman|playfair|liberation|noto serif|cambria/.test(
    value,
  )
}

function isBold(family: string): boolean {
  return /bold|black|heavy|semibold|demi|extrabold/.test(family.toLowerCase())
}

export function runsFromItems(
  items: RawItem[],
  styles: StyleMap,
  pageNumber: number,
): TextRun[] {
  const runs: TextRun[] = []
  items.forEach((item, index) => {
    if (!item.str || !item.str.trim()) return
    const [a, b, c, d, e, f] = item.transform
    const size = Math.abs(d) || Math.hypot(c, d) || item.height || 10
    const descriptor = styles[item.fontName]?.fontFamily || item.fontName || ''
    const signature = `${descriptor} ${item.fontName}`
    const font: FontFamily = isSerif(signature) ? 'serif' : 'sans'
    // item.width is already in PDF user space.
    const width = Math.max(item.width, item.str.length * 0.2)
    runs.push({
      id: `${pageNumber}:${index}`,
      page: pageNumber,
      text: item.str,
      x: e,
      y: f,
      width,
      size,
      font,
      bold: isBold(signature),
    })
  })
  return runs
}

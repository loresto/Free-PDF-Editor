// Проверяет настоящую замену текста в content stream: старая строка исчезает
// из файла, новая добавляется наложением. Запуск: bun run verify:stream
import { readFile } from 'node:fs/promises'
import { PDFDocument, rgb } from '@cantoo/pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { groupLines, readPageContent, squash } from '../src/pdf/content'
import { lineStep, lineWidth, wrapText } from '../src/pdf/model'
import { buildPreview } from '../src/pdf/export'
import type { TextEdit } from '../src/pdf/model'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
}

async function pageText(bytes: Uint8Array): Promise<string> {
  const task = getDocument({ data: new Uint8Array(bytes), disableFontFace: true })
  const doc = await task.promise
  const page = await doc.getPage(1)
  const content = await page.getTextContent()
  const text = content.items.map((item: any) => item.str ?? '').join(' | ')
  await task.destroy()
  return text
}

const edit = (patch: Partial<TextEdit>): TextEdit => ({
  id: 'test',
  page: 1,
  kind: 'replace',
  x: 0,
  y: 0,
  width: 100,
  size: 10,
  text: 'новый текст',
  font: 'sans',
  bold: false,
  align: 'left',
  color: [20, 20, 20],
  cover: null,
  ...patch,
})

const fontBytes = await readFile('public/fonts/NotoSans-Regular.ttf')
const doc = await PDFDocument.create()
doc.registerFontkit(fontkit)
const font = await doc.embedFont(fontBytes, { subset: false })
const page = doc.addPage([595, 842])
page.drawText('Адрес регистрации:', { x: 60, y: 700, size: 9, font, color: rgb(0.1, 0.1, 0.1) })
page.drawText('г. Сысерть, ул. Коммуны, д. 36', { x: 130, y: 700, size: 9, font, color: rgb(0.1, 0.1, 0.1) })
// Таблица: две ячейки на одной базовой линии — их нельзя склеивать.
page.drawText('Комплект клапанов', { x: 46, y: 660, size: 10, font, color: rgb(0.1, 0.1, 0.1) })
page.drawText('1', { x: 310, y: 660, size: 10, font, color: rgb(0.1, 0.1, 0.1) })
page.drawText('Фильтр воздушный', { x: 46, y: 640, size: 10, font, color: rgb(0.1, 0.1, 0.1) })
// Шапка с подчёркиванием: широкая заливка ячейки, текст и тонкая линия под ним.
page.drawRectangle({ x: 40, y: 600, width: 240, height: 22, color: rgb(0.88, 0.9, 0.93) })
page.drawText('Цена', { x: 140, y: 607, size: 10, font, color: rgb(0.1, 0.1, 0.1) })
page.drawRectangle({ x: 140, y: 604.5, width: 26, height: 1.4, color: rgb(0.2, 0.2, 0.2) })
page.drawRectangle({ x: 40, y: 598, width: 240, height: 0.8, color: rgb(0.2, 0.2, 0.2) })
const bytes = await doc.save()

const base = await PDFDocument.load(bytes)
const baseContent = readPageContent(base, base.getPages()[0])
check('content stream parsed', Boolean(baseContent))
if (!baseContent) process.exit(1)

const lines = groupLines(baseContent.ops)
check('label + value grouped as one visual line', lines.length === 4, `got ${lines.length}`)
check(
  'split line found',
  lines.some(
    (ops) =>
      squash(ops.map((op) => op.text).join('')) ===
      squash('Адрес регистрации: г. Сысерть, ул. Коммуны, д. 36'),
  ),
)
const thin = baseContent.paths.filter((path) => path.top - path.bottom <= 1.5 && path.right - path.left <= 60)
check('underline rule parsed as a thin path', thin.length === 1, `got ${thin.length}`)

const preview = await buildPreview(bytes, [
  edit({
    id: 'addr',
    x: 60,
    y: 700,
    size: 9,
    original: 'Адрес регистрации: г. Сысерть, ул. Коммуны, д. 36',
    text: 'Адрес регистрации: г. Екатеринбург, ул. Ленина, 1',
    cover: { x: 60, y: 698, width: 250, height: 11, color: [255, 255, 255] },
  }),
  edit({ id: 'cell', x: 46, y: 660, original: 'Комплект клапанов', text: 'Комплект прокладок' }),
  edit({
    id: 'price',
    x: 140,
    y: 607,
    size: 10,
    original: 'Цена',
    text: 'Стоимость',
    cover: { x: 140, y: 604, width: 27, height: 12, color: [226, 230, 237] },
  }),
])
check('preview built', Boolean(preview))
if (!preview) process.exit(1)
check('all three edits matched', preview.blanked.size === 3, [...preview.blanked].join(','))

const text = await pageText(preview.bytes)
check('old split line removed', !text.includes('Сысерть'), text)
check('replaced cell removed', !text.includes('Комплект клапанов'))
check('replaced header removed', !text.includes('Цена'))
check('neighbouring cell survives', text.split('|').some((part) => part.trim() === '1'))
check('next row survives', text.includes('Фильтр воздушный'))
check('label and value were one line', text.includes('ул. Коммуны') === false)

const previewDoc = await PDFDocument.load(preview.bytes)
const previewContent = readPageContent(previewDoc, previewDoc.getPages()[0])
if (!previewContent) {
  check('preview content parsed', false)
} else {
  const underlineLeft = previewContent.paths.filter(
    (path) => path.top - path.bottom <= 1.5 && path.right - path.left <= 60,
  )
  check('underline removed with the text', underlineLeft.length === 0, `got ${underlineLeft.length}`)
  check(
    'cell frame and shading survive',
    previewContent.paths.some((path) => path.right - path.left >= 200),
  )
}

// Типографские настройки: трекинг и межстрочный интервал.
const fakeMeasure = (value: string, size: number) => value.length * size * 0.5
check('line width includes tracking', lineWidth('abc', 10, fakeMeasure, 2) === 19, String(lineWidth('abc', 10, fakeMeasure, 2)))
const tight = wrapText('abcdefghij', 10, 30, fakeMeasure, 0).length
const spaced = wrapText('abcdefghij', 10, 30, fakeMeasure, 4).length
check('tracking widens the wrap', spaced > tight, `${tight} → ${spaced}`)
check('line step follows line height', lineStep({ size: 10, lineHeight: 1.6 }) === 16)

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)

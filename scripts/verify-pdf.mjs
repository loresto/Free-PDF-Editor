// Verifies the export/preview core in Node: Cyrillic embedding, encryption and
// removal of the encryption dictionary. Run with `bun run verify:pdf`.
import { readFile } from 'node:fs/promises'
import { PDFDocument, PDFName, rgb } from '@cantoo/pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const FONT_BYTES = await readFile('public/fonts/NotoSans-Regular.ttf')
const ORIGINAL = 'Привет, мир! Проверка кириллицы'
const REPLACEMENT = 'Заменённый текст: ёжик, Ёлка, 2026'

let failures = 0
function check(label, condition, detail = '') {
  const ok = Boolean(condition)
  if (!ok) failures += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
}

function encrypted(bytes) {
  return new TextDecoder('latin1').decode(bytes).includes('/Encrypt')
}

async function samplePdf(text) {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(FONT_BYTES, { subset: false })
  const page = doc.addPage([595, 842])
  page.drawText(text, { x: 60, y: 700, size: 16, font, color: rgb(0.1, 0.1, 0.1) })
  return doc.save()
}

async function textOf(bytes, password) {
  const task = getDocument({
    data: new Uint8Array(bytes),
    password,
    disableFontFace: true,
  })
  const doc = await task.promise
  const page = await doc.getPage(1)
  const content = await page.getTextContent()
  const text = content.items
    .map((item) => ('str' in item ? item.str : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  doc.cleanup()
  await task.destroy()
  return text
}

/** Mirrors src/pdf/decrypt.ts: drop the encrypt dict and stale xref streams. */
function stripArtifacts(doc) {
  const context = doc.context
  const encryptRef = context.trailerInfo.Encrypt
  delete context.trailerInfo.Encrypt
  if (encryptRef) context.delete(encryptRef)
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    const dict = object?.dict
    if (dict?.get) {
      if (String(dict.get(PDFName.of('Type'))) === '/XRef') context.delete(ref)
      continue
    }
    if (typeof object?.copyBytesInto !== 'function') continue
    const size = object.sizeInBytes()
    if (!size) continue
    const bytes = new Uint8Array(size)
    object.copyBytesInto(bytes, 0)
    const raw = new TextDecoder('latin1').decode(bytes)
    if (raw.includes('/Encrypt') || /\/Type\s*\/XRef/.test(raw)) context.delete(ref)
  }
}

/** Mirrors src/pdf/export.ts: cover patch + embedded Cyrillic font. */
async function withEdit(bytes, password, replacement) {
  const doc = await PDFDocument.load(bytes, { password, updateMetadata: false })
  if (!doc.isEncrypted) stripArtifacts(doc)
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(FONT_BYTES, { subset: false })
  const page = doc.getPages()[0]
  page.drawRectangle({ x: 58, y: 692, width: 480, height: 26, color: rgb(1, 1, 1) })
  page.drawText(replacement, {
    x: 60,
    y: 700,
    size: 16,
    font,
    color: rgb(0.1, 0.1, 0.1),
  })
  return doc.save({ useObjectStreams: false })
}

const plain = await samplePdf(ORIGINAL)
check('plain PDF is not encrypted', !encrypted(plain))
check('plain text extracts', (await textOf(plain)).includes(ORIGINAL))

// User password (opens the document).
const locked = await PDFDocument.load(plain)
locked.encrypt({ userPassword: 'secret', ownerPassword: 'owner-2026' })
const lockedBytes = await locked.save()
check('user-password PDF is encrypted', encrypted(lockedBytes))
check(
  'pdf.js opens it with the password',
  (await textOf(lockedBytes, 'secret')).includes(ORIGINAL),
)

const unlocked = await PDFDocument.load(lockedBytes, { password: 'secret' })
check('fork decrypts on load', unlocked.isEncrypted === false)
stripArtifacts(unlocked)
const stripped = await unlocked.save({ useObjectStreams: false })
check('saved copy has no /Encrypt', !encrypted(stripped))
check('decrypted copy keeps the text', (await textOf(stripped)).includes(ORIGINAL))
const reopened = await PDFDocument.load(stripped)
check('decrypted copy reopens without a password', reopened.isEncrypted === false)

let rejected = false
try {
  await PDFDocument.load(lockedBytes, { password: 'wrong' })
} catch {
  rejected = true
}
check('wrong password is rejected', rejected)

let rejectedEmpty = false
try {
  const doc = await PDFDocument.load(lockedBytes, { password: '' })
  if (doc.isEncrypted) throw new Error('still encrypted')
} catch {
  rejectedEmpty = true
}
check('empty password cannot open a user-password file', rejectedEmpty)

// Owner password only: permissions are set but the file opens for everyone.
const restricted = await PDFDocument.load(plain)
restricted.encrypt({
  ownerPassword: 'owner-2026',
  userPassword: '',
  permissions: { printing: false, copying: false, modifying: false },
})
const restrictedBytes = await restricted.save()
check('owner-only PDF still has /Encrypt', encrypted(restrictedBytes))
const openedRestricted = await PDFDocument.load(restrictedBytes, { password: '' })
check('owner-only PDF opens with an empty password', openedRestricted.isEncrypted === false)
stripArtifacts(openedRestricted)
const restrictedCopy = await openedRestricted.save({ useObjectStreams: false })
check('owner restrictions are dropped on save', !encrypted(restrictedCopy))

// The full editing path: patch text, keep the file encrypted input, save clean.
const edited = await withEdit(lockedBytes, 'secret', REPLACEMENT)
check('edited export is unencrypted', !encrypted(edited))
const editedText = await textOf(edited)
check('edited export contains the new Cyrillic text', editedText.includes(REPLACEMENT))
check('original text is painted over but still readable in the stream', editedText.includes(ORIGINAL))

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)

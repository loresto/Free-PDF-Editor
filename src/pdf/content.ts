import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
  type PDFDocument,
  type PDFPage,
} from '@cantoo/pdf-lib'

/** One text-showing operator found in the page content stream. */
export type ShowOp = {
  /** Offsets of the whole operator's text token in the decoded content. */
  start: number
  end: number
  text: string
  x: number
  y: number
  size: number
  /** Position was set explicitly right before the operator, so blanking it is safe. */
  explicit: boolean
}

/** A painted path (filled or stroked) found in the page content stream. */
export type PaintOp = {
  start: number
  end: number
  left: number
  bottom: number
  right: number
  top: number
  fill: boolean
}

export type PageContent = {
  text: string
  ops: ShowOp[]
  paths: PaintOp[]
  apply: (next: string) => void
}

type Token = {
  kind: 'string' | 'array' | 'number' | 'name' | 'op' | 'other'
  start: number
  end: number
  bytes?: Uint8Array
  /** For arrays: the string tokens inside, with their own offsets. */
  strings?: { start: number; end: number; bytes: Uint8Array }[]
}

const WHITESPACE = new Set([0, 9, 10, 12, 13, 32])

function isRegular(byte: number): boolean {
  return !WHITESPACE.has(byte) && byte !== 0x28 && byte !== 0x29 && byte !== 0x3c && byte !== 0x3e && byte !== 0x5b && byte !== 0x5d && byte !== 0x7b && byte !== 0x7d && byte !== 0x2f && byte !== 0x25
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  const length = text.length

  const readLiteral = (): { start: number; end: number; bytes: Uint8Array } => {
    const start = index
    index += 1
    const out: number[] = []
    let depth = 1
    while (index < length) {
      const char = text[index]
      if (char === '\\') {
        const next = text[index + 1]
        index += 2
        if (next === 'n') out.push(10)
        else if (next === 'r') out.push(13)
        else if (next === 't') out.push(9)
        else if (next === 'b') out.push(8)
        else if (next === 'f') out.push(12)
        else if (next === '\n') continue
        else if (next === '\r') {
          if (text[index] === '\n') index += 1
        } else if (next >= '0' && next <= '7') {
          let octal = next
          while (octal.length < 3 && text[index] >= '0' && text[index] <= '7') {
            octal += text[index]
            index += 1
          }
          out.push(Number.parseInt(octal, 8) & 0xff)
        } else out.push(next.charCodeAt(0) & 0xff)
        continue
      }
      if (char === '(') depth += 1
      if (char === ')') {
        depth -= 1
        index += 1
        if (depth === 0) break
        out.push(0x29)
        continue
      }
      out.push(char.charCodeAt(0) & 0xff)
      index += 1
    }
    return { start, end: index, bytes: Uint8Array.from(out) }
  }

  while (index < length) {
    const char = text[index]
    if (WHITESPACE.has(char.charCodeAt(0))) {
      index += 1
      continue
    }
    if (char === '%') {
      while (index < length && text[index] !== '\n' && text[index] !== '\r') index += 1
      continue
    }
    if (char === '(') {
      const literal = readLiteral()
      tokens.push({ kind: 'string', ...literal })
      continue
    }
    if (char === '<' && text[index + 1] !== '<') {
      const start = index
      index += 1
      let hex = ''
      while (index < length && text[index] !== '>') {
        hex += text[index]
        index += 1
      }
      index += 1
      const clean = hex.replace(/[^0-9a-fA-F]/g, '')
      const bytes = new Uint8Array(Math.floor(clean.length / 2))
      for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
      }
      tokens.push({ kind: 'string', start, end: index, bytes })
      continue
    }
    if (char === '[') {
      const start = index
      index += 1
      const strings: { start: number; end: number; bytes: Uint8Array }[] = []
      while (index < length && text[index] !== ']') {
        if (text[index] === '(') {
          const literal = readLiteral()
          strings.push(literal)
          continue
        }
        if (text[index] === '<' && text[index + 1] !== '<') {
          const hexStart = index
          index += 1
          let hex = ''
          while (index < length && text[index] !== '>') {
            hex += text[index]
            index += 1
          }
          index += 1
          const clean = hex.replace(/[^0-9a-fA-F]/g, '')
          const bytes = new Uint8Array(Math.floor(clean.length / 2))
          for (let i = 0; i < bytes.length; i += 1) {
            bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
          }
          strings.push({ start: hexStart, end: index, bytes })
          continue
        }
        index += 1
      }
      index += 1
      tokens.push({ kind: 'array', start, end: index, strings })
      continue
    }
    if (char === '<' && text[index + 1] === '<') {
      const start = index
      let depth = 0
      while (index < length) {
        if (text[index] === '<' && text[index + 1] === '<') {
          depth += 1
          index += 2
          continue
        }
        if (text[index] === '>' && text[index + 1] === '>') {
          depth -= 1
          index += 2
          if (depth === 0) break
          continue
        }
        index += 1
      }
      tokens.push({ kind: 'other', start, end: index })
      continue
    }
    if (char === ']' || char === '>' || char === '}' || char === '{') {
      index += 1
      continue
    }
    if (char === '/') {
      const start = index
      index += 1
      while (index < length && isRegular(text.charCodeAt(index))) index += 1
      tokens.push({ kind: 'name', start, end: index })
      continue
    }
    const start = index
    while (index < length && isRegular(text.charCodeAt(index))) index += 1
    if (index === start) {
      index += 1
      continue
    }
    const word = text.slice(start, index)
    const isNumber = /^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)
    tokens.push({ kind: isNumber ? 'number' : 'op', start, end: index })
  }
  return tokens
}

function hexToUnicode(hex: string): string {
  let out = ''
  for (let i = 0; i + 3 < hex.length + 1; i += 4) {
    const code = Number.parseInt(hex.slice(i, i + 4), 16)
    if (!Number.isFinite(code)) break
    out += String.fromCharCode(code)
  }
  return out
}

type Decoder = (bytes: Uint8Array) => string

/** Parses a ToUnicode CMap into a byte-code → text decoder. */
function decoderFromCMap(cmap: string, codeLength: number): Decoder | null {
  const map = new Map<number, string>()
  let found = false

  const charBlock = /beginbfchar([\s\S]*?)endbfchar/g
  for (const block of cmap.matchAll(charBlock)) {
    for (const pair of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      map.set(Number.parseInt(pair[1], 16), hexToUnicode(pair[2]))
      found = true
    }
  }

  const rangeBlock = /beginbfrange([\s\S]*?)endbfrange/g
  for (const block of cmap.matchAll(rangeBlock)) {
    for (const range of block[1].matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\[([\s\S]*?)\])/g,
    )) {
      const low = Number.parseInt(range[1], 16)
      const high = Number.parseInt(range[2], 16)
      if (high - low > 65535) continue
      if (range[3] !== undefined) {
        const base = hexToUnicode(range[3])
        const prefix = base.slice(0, -1)
        const last = base.charCodeAt(base.length - 1)
        for (let code = low; code <= high; code += 1) {
          map.set(code, prefix + String.fromCharCode(last + (code - low)))
        }
      } else if (range[4]) {
        const items = Array.from(range[4].matchAll(/<([0-9a-fA-F]+)>/g)).map((item) =>
          hexToUnicode(item[1]),
        )
        items.forEach((value, offset) => map.set(low + offset, value))
      }
      found = true
    }
  }

  if (!found) return null
  return (bytes) => {
    let out = ''
    for (let i = 0; i < bytes.length; i += codeLength) {
      const code = codeLength === 2 ? (bytes[i] << 8) | (bytes[i + 1] ?? 0) : bytes[i]
      const value = map.get(code)
      out += value ?? ''
    }
    return out
  }
}

function fallbackDecoder(codeLength: number): Decoder {
  const decoder = new TextDecoder('windows-1252')
  return (bytes) => {
    // Without a ToUnicode map only single-byte text can be guessed: two-byte
    // codes are taken as high byte + low byte and decoded byte by byte.
    if (codeLength === 2) {
      const out = new Uint8Array(bytes.length)
      for (let i = 0; i < bytes.length; i += 1) out[i] = bytes[i]
      return decoder.decode(out)
    }
    return decoder.decode(bytes)
  }
}

function decodeStreamBytes(stream: PDFRawStream): Uint8Array {
  const filter = stream.dict.get(PDFName.of('Filter'))
  const filterName = filter ? String(filter) : ''
  if (!filter || filterName === '/FlateDecode' || filterName === '/ASCIIHexDecode' || filterName === '/ASCII85Decode') {
    try {
      return decodePDFRawStream(stream).decode()
    } catch {
      return stream.getContents()
    }
  }
  return stream.getContents()
}

function readFontDecoders(doc: PDFDocument, page: PDFPage): Map<string, Decoder> {
  const decoders = new Map<string, Decoder>()
  const resources = page.node.Resources()
  if (!resources) return decoders
  const fonts = doc.context.lookup(resources.get(PDFName.of('Font')), PDFDict)
  if (!fonts) return decoders

  for (const key of fonts.keys()) {
    const name = String(key)
    const font = doc.context.lookup(fonts.get(key), PDFDict)
    if (!font) continue
    const subtype = String(font.get(PDFName.of('Subtype')) ?? '')
    const toUnicode = doc.context.lookup(font.get(PDFName.of('ToUnicode')))
    let decoder: Decoder | null = null
    if (toUnicode instanceof PDFRawStream) {
      const cmap = new TextDecoder('latin1').decode(decodeStreamBytes(toUnicode))
      const codeLength = /begincodespacerange\s*<([0-9a-fA-F]+)>/.test(cmap)
        ? (cmap.match(/begincodespacerange\s*<([0-9a-fA-F]+)>/)?.[1].length ?? 2) / 2
        : subtype === '/Type0'
          ? 2
          : 1
      decoder = decoderFromCMap(cmap, codeLength)
    }
    if (!decoder) decoder = fallbackDecoder(subtype === '/Type0' ? 2 : 1)
    decoders.set(name.replace(/^\//, ''), decoder)
  }
  return decoders
}

const IDENTITY = [1, 0, 0, 1, 0, 0]

function multiply(m: number[], n: number[]): number[] {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ]
}

/** Finds every text-showing operator with its decoded text and position. */
export function readPageContent(doc: PDFDocument, page: PDFPage): PageContent | null {
  const contents = page.node.Contents()
  if (!contents) return null

  const streams: PDFRawStream[] = []
  if (contents instanceof PDFArray) {
    for (let index = 0; index < contents.size(); index += 1) {
      const stream = doc.context.lookup(contents.get(index))
      if (stream instanceof PDFRawStream) streams.push(stream)
    }
  } else if (contents instanceof PDFRawStream) {
    streams.push(contents)
  } else {
    const resolved = doc.context.lookup(contents)
    if (resolved instanceof PDFRawStream) streams.push(resolved)
  }
  if (!streams.length) return null

  const text = streams
    .map((stream) => new TextDecoder('latin1').decode(decodeStreamBytes(stream)))
    .join('\n')

  const decoders = readFontDecoders(doc, page)
  const tokens = tokenize(text)
  const ops: ShowOp[] = []
  const paths: PaintOp[] = []
  const stack: Token[] = []
  const state = { font: '', size: 10 }
  let tm = IDENTITY
  let ctm = IDENTITY
  let lineMatrix = IDENTITY
  let leading = 0
  let explicit = false
  const saved: {
    tm: number[]
    ctm: number[]
    lineMatrix: number[]
    size: number
    leading: number
  }[] = []
  // Wrapped in an object so TypeScript keeps the type across closure writes.
  const pathState: { current: { left: number; bottom: number; right: number; top: number } | null } = {
    current: null,
  }

  const number = (offset: number, fallback = 0): number => {
    const token = stack[stack.length - offset]
    return token && token.kind === 'number' ? Number.parseFloat(text.slice(token.start, token.end)) : fallback
  }

  const matrix = (): number[] => [number(6), number(5), number(4), number(3), number(2), number(1)]

  /** User space → page space (both the CTM and the text matrix matter). */
  const project = (m: number[], x: number, y: number): [number, number] => [
    m[0] * x + m[2] * y + m[4],
    m[1] * x + m[3] * y + m[5],
  ]

  const scaleOf = (m: number[]): number =>
    Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1

  /** Extends the current path bounds with a user-space point. */
  const grow = (x: number, y: number) => {
    const [px, py] = project(ctm, x, y)
    const box = pathState.current
    if (!box) pathState.current = { left: px, bottom: py, right: px, top: py }
    else {
      if (px < box.left) box.left = px
      if (px > box.right) box.right = px
      if (py < box.bottom) box.bottom = py
      if (py > box.top) box.top = py
    }
  }

  const show = (token: Token | undefined, positionOffset: number) => {
    if (!token) return
    const decoder = decoders.get(state.font) ?? fallbackDecoder(1)
    let value = ''
    const start = token.start
    const end = token.end
    if (token.kind === 'string' && token.bytes) {
      value = decoder(token.bytes)
    } else if (token.kind === 'array' && token.strings) {
      value = token.strings.map((item) => decoder(item.bytes)).join('')
    } else return
    const [x, y] = project(ctm, tm[4], tm[5])
    ops.push({
      start,
      end,
      text: value,
      x,
      y,
      size: state.size * scaleOf(tm) * scaleOf(ctm),
      explicit: explicit && positionOffset >= 0,
    })
    explicit = false
  }

  for (const token of tokens) {
    if (token.kind !== 'op') {
      stack.push(token)
      continue
    }
    const op = text.slice(token.start, token.end)
    if (op === 'q') saved.push({ tm, ctm, lineMatrix, size: state.size, leading })
    else if (op === 'Q') {
      const previous = saved.pop()
      if (previous) {
        tm = previous.tm
        ctm = previous.ctm
        lineMatrix = previous.lineMatrix
        state.size = previous.size
        leading = previous.leading
      }
    } else if (op === 'BT') {
      tm = IDENTITY
      lineMatrix = IDENTITY
      explicit = true
    } else if (op === 'ET') {
      // nothing to do
    } else if (op === 'Tf') {
      const name = stack[stack.length - 2]
      if (name?.kind === 'name') state.font = text.slice(name.start + 1, name.end)
      state.size = number(1, 10)
    } else if (op === 'TL') {
      leading = number(1)
    } else if (op === 'Tm') {
      tm = matrix()
      lineMatrix = tm
      explicit = true
    } else if (op === 'Td' || op === 'TD') {
      const tx = number(2)
      const ty = number(1)
      if (op === 'TD') leading = -ty
      lineMatrix = multiply([1, 0, 0, 1, tx, ty], lineMatrix)
      tm = lineMatrix
      explicit = true
    } else if (op === 'T*') {
      lineMatrix = multiply([1, 0, 0, 1, 0, -leading], lineMatrix)
      tm = lineMatrix
      explicit = true
    } else if (op === 'Tj') {
      show(stack[stack.length - 1], explicit ? 1 : -1)
    } else if (op === "'" || op === '"') {
      lineMatrix = multiply([1, 0, 0, 1, 0, -leading], lineMatrix)
      tm = lineMatrix
      show(stack[stack.length - 1], 1)
    } else if (op === 'TJ') {
      show(stack[stack.length - 1], explicit ? 1 : -1)
    } else if (op === 'cm') {
      ctm = multiply(matrix(), ctm)
    } else if (op === 're') {
      const x = number(4)
      const y = number(3)
      const width = number(2)
      const height = number(1)
      grow(x, y)
      grow(x + width, y)
      grow(x, y + height)
      grow(x + width, y + height)
    } else if (op === 'm' || op === 'l') {
      grow(number(2), number(1))
    } else if (op === 'c') {
      grow(number(6), number(5))
      grow(number(4), number(3))
      grow(number(2), number(1))
    } else if (op === 'v' || op === 'y') {
      grow(number(4), number(3))
      grow(number(2), number(1))
    } else if (
      op === 'f' ||
      op === 'F' ||
      op === 'f*' ||
      op === 'B' ||
      op === 'B*' ||
      op === 'b' ||
      op === 'b*' ||
      op === 'S' ||
      op === 's'
    ) {
      const bounds = pathState.current
      if (bounds !== null) {
        paths.push({
          start: token.start,
          end: token.end,
          left: bounds.left,
          bottom: bounds.bottom,
          right: bounds.right,
          top: bounds.top,
          fill: op !== 'S' && op !== 's',
        })
      }
      pathState.current = null
    } else if (op === 'n') {
      pathState.current = null
    }
    stack.length = 0
  }

  const apply = (next: string) => {
    // Content streams are byte-oriented: encode as latin1 so bytes above 0x7f
    // keep their value instead of turning into UTF-8 sequences.
    const bytes = Uint8Array.from(next, (char) => char.charCodeAt(0) & 0xff)
    const stream = doc.context.stream(bytes)
    page.node.set(PDFName.of('Contents'), doc.context.register(stream))
  }

  return { text, ops, paths, apply }
}

/** Replaces the given operator ranges (text by default, paint paths with 'n'). */
export function blankRanges(
  content: string,
  ranges: { start: number; end: number; replacement?: string }[],
): string {
  const sorted = [...ranges].sort((a, b) => b.start - a.start)
  let out = content
  for (const range of sorted) {
    out = `${out.slice(0, range.start)}${range.replacement ?? '()'}${out.slice(range.end)}`
  }
  return out
}

/**
 * Finds thin painted rules that belong to the text itself (underlines,
 * strikethroughs, highlight bars): they sit inside the line box and are no wider
 * than the text, so table frames and cell borders are never touched.
 */
export function textDecorations(
  content: PageContent,
  region: { x: number; y: number; width: number; height: number },
  size: number,
): PaintOp[] {
  const left = region.x
  const right = region.x + region.width
  const bottom = region.y
  return content.paths.filter((path) => {
    const width = path.right - path.left
    const height = path.top - path.bottom
    if (width <= 0.2 || height <= 0.2) return false
    // Wider than the line → a table frame or a cell background.
    if (width > Math.max(4, region.width * 1.08 + 2)) return false
    if (height > Math.max(2.5, Math.min(region.height * 0.6, size * 0.45))) return false
    const overlap = Math.min(path.right, right) - Math.max(path.left, left)
    if (overlap < Math.min(width, region.width) * 0.5) return false
    // Only the lower part of the line, where underline/strike rules live.
    return (
      path.top <= bottom + region.height * 0.6 + 0.5 &&
      path.bottom >= bottom - Math.max(1.5, size * 0.4)
    )
  })
}

export function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** Space-insensitive form used to match a clicked line with its operators. */
export function squash(value: string): string {
  return value.replace(/\s+/g, '')
}

/** Groups operators into visual lines and returns their concatenated text. */
export function groupLines(ops: ShowOp[]): ShowOp[][] {
  const sorted = [...ops].sort((a, b) => (Math.abs(a.y - b.y) > 0.5 ? b.y - a.y : a.x - b.x))
  const lines: ShowOp[][] = []
  for (const op of sorted) {
    const line = lines[lines.length - 1]
    const reference = line?.[line.length - 1]
    if (line && reference && Math.abs(reference.y - op.y) <= Math.max(1, reference.size * 0.35)) {
      line.push(op)
    } else {
      lines.push([op])
    }
  }
  return lines.map((line) => line.sort((a, b) => a.x - b.x))
}

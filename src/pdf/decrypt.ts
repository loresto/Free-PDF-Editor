import { PDFDocument, PDFName, type PDFRef } from '@cantoo/pdf-lib'

/** none: открытый файл · owner: только ограничения · user: нужен пароль на открытие */
export type Protection = 'none' | 'owner' | 'user'

function containsEncryptDictionary(bytes: Uint8Array): boolean {
  // The encryption dictionary is referenced from the trailer in plain text.
  return new TextDecoder('latin1').decode(bytes).includes('/Encrypt')
}

export async function probeProtection(bytes: Uint8Array): Promise<Protection> {
  if (!containsEncryptDictionary(bytes)) return 'none'
  try {
    const doc = await PDFDocument.load(bytes, { password: '', updateMetadata: false })
    return doc.isEncrypted ? 'user' : 'owner'
  } catch {
    return 'user'
  }
}

type LookalikeObject = {
  dict?: { get?: (name: unknown) => unknown }
  sizeInBytes?: () => number
  copyBytesInto?: (buffer: Uint8Array, offset: number) => number
}

/**
 * Drops the encryption dictionary and the stale cross-reference stream that
 * still mentions it. pdf-lib keeps that old stream as an invalid object, and
 * its trailer copy makes readers (and pdf-lib itself) think the saved file is
 * still password protected.
 */
export function stripEncryptionArtifacts(doc: PDFDocument): void {
  const context = doc.context
  const encryptRef = context.trailerInfo.Encrypt
  delete context.trailerInfo.Encrypt
  if (encryptRef) context.delete(encryptRef as unknown as PDFRef)

  for (const [ref, object] of context.enumerateIndirectObjects()) {
    const candidate = object as unknown as LookalikeObject
    const dict = candidate.dict
    if (dict?.get) {
      const type = dict.get(PDFName.of('Type'))
      if (type && String(type) === '/XRef') context.delete(ref)
      continue
    }
    if (!candidate.copyBytesInto || !candidate.sizeInBytes) continue
    const size = candidate.sizeInBytes()
    if (!size) continue
    const bytes = new Uint8Array(size)
    candidate.copyBytesInto(bytes, 0)
    const raw = new TextDecoder('latin1').decode(bytes)
    const looksLikeTrailer = raw.includes('/Encrypt') || /\/Type\s*\/XRef/.test(raw)
    if (looksLikeTrailer) context.delete(ref)
  }
}

/** Saves the document without its encryption dictionary (an unpassworded copy). */
export async function saveWithoutProtection(
  bytes: Uint8Array,
  password?: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, {
    password,
    updateMetadata: false,
  })
  if (doc.isEncrypted)
    throw new Error('Пароль не подошёл. Проверьте раскладку и попробуйте снова.')
  stripEncryptionArtifacts(doc)
  return doc.save({ useObjectStreams: false })
}

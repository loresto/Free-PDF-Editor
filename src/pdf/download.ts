export function savePdf(bytes: Uint8Array, name: string): void {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
    type: 'application/pdf',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function outputName(name: string, suffix: string): string {
  return `${name.replace(/\.pdf$/i, '')}${suffix}.pdf`
}

/** GAN-1: importación local limitada de imágenes en gris, sin etiquetas ni conexión de red.
 * Compatible con CSV pixel_0..pixel_63 (Digits) y pixel_0..pixel_783 (MNIST),
 * con o sin columna label. La etiqueta nunca entra al generador ni al discriminador.
 */
import type { GanDimension } from './architecture.ts'

export const MAX_GAN_FILE_BYTES = 200_000_000
export const MAX_GAN_IMAGES = 2_000
export const MIN_GAN_IMAGES = 100

export interface GanImageDataset {
  name: string
  dimension: GanDimension
  count: number
  pixels: Uint8Array
  originalScale: 16 | 255
  truncated: boolean
  hadLabels: boolean
}

interface Header {
  dimension: GanDimension
  pixelColumns: number[]
  labelColumn: number
  columns: number
}

function parseHeader(text: string): Header {
  const names = text.replace(/^\uFEFF/, '').split(',').map((cell) => cell.trim().replace(/^"|"$/g, '').toLowerCase())
  const labelColumn = names.indexOf('label')
  if (labelColumn !== -1 && labelColumn !== 0 && labelColumn !== names.length - 1) {
    throw new Error('La columna opcional label debe estar al inicio o al final.')
  }
  const pixelColumns: number[] = []
  names.forEach((name, index) => {
    if (index === labelColumn) return
    if (name !== `pixel_${pixelColumns.length}` && name !== `pixel${pixelColumns.length}`) {
      throw new Error('Se requieren columnas pixel_0, pixel_1, ... consecutivas.')
    }
    pixelColumns.push(index)
  })
  const dimension = Math.sqrt(pixelColumns.length)
  if (dimension !== 8 && dimension !== 28) throw new Error('El CSV requiere 64 o 784 píxeles por imagen.')
  return { dimension: dimension as GanDimension, pixelColumns, labelColumn, columns: names.length }
}

/** Acepta también CSV numérico sin encabezado: 64/784 píxeles, o una etiqueta inicial adicional. */
function headerless(text: string): Header | null {
  const values = text.replace(/^\uFEFF/, '').split(',').map((cell) => cell.trim())
  if (![64, 65, 784, 785].includes(values.length)) return null
  if (!values.every((cell) => cell !== '' && Number.isInteger(Number(cell)) && Number(cell) >= 0 && Number(cell) <= 255)) return null
  const labelColumn = [65, 785].includes(values.length) ? 0 : -1
  const imageLength = values.length - (labelColumn === -1 ? 0 : 1)
  return {
    dimension: Math.sqrt(imageLength) as GanDimension,
    pixelColumns: Array.from({ length: imageLength }, (_unused, index) => index + (labelColumn === -1 ? 0 : 1)),
    labelColumn, columns: values.length,
  }
}

/** CSV incremental: retiene como máximo 2 000 imágenes para evitar consumir RAM excesiva. */
export async function loadGanImageCsv(file: File, signal?: AbortSignal, limit = MAX_GAN_IMAGES): Promise<GanImageDataset> {
  if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Selecciona un CSV de imágenes.')
  if (file.size === 0 || file.size > MAX_GAN_FILE_BYTES) throw new Error('El CSV está vacío o supera 200 MB.')
  if (!Number.isInteger(limit) || limit < MIN_GAN_IMAGES || limit > MAX_GAN_IMAGES) throw new Error('Límite de imágenes no permitido.')
  const reader = file.stream().getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  // Estado mutable del encabezado: consume() puede establecerlo durante la lectura.
  const headerState: { current: Header | null } = { current: null }
  let pending = ''
  let lineNumber = 0
  let maximum = 0
  const rows: number[][] = []
  let truncated = false

  function consume(line: string) {
    lineNumber++
    const trimmed = line.trim()
    if (!trimmed) return
    if (!headerState.current) {
      const detected = headerless(trimmed)
      if (detected) headerState.current = detected
      else { headerState.current = parseHeader(trimmed); return }
    }
    const header = headerState.current
    if (!header) throw new Error('CSV inválido: encabezado no detectado.')
    const cells = trimmed.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''))
    if (cells.length !== header.columns) throw new Error(`Fila ${lineNumber}: número de columnas diferente.`)
    const row = header.pixelColumns.map((column) => {
      const cell = cells[column]
      const value = Number(cell)
      if (cell === '' || !Number.isInteger(value) || value < 0 || value > 255) {
        throw new Error(`Fila ${lineNumber}: píxel ${column} inválido (rango 0–255).`)
      }
      maximum = Math.max(maximum, value)
      return value
    })
    rows.push(row)
  }

  try {
    let finished = false
    while (!finished && rows.length < limit) {
      if (signal?.aborted) throw new Error('Importación cancelada.')
      const chunk = await reader.read()
      finished = chunk.done
      pending += finished ? decoder.decode() : decoder.decode(chunk.value, { stream: true })
      if (pending.length > 1_000_000) throw new Error('CSV inválido: línea demasiado extensa.')
      let position = pending.indexOf('\n')
      while (position !== -1 && rows.length < limit) {
        consume(pending.slice(0, position).replace(/\r$/, ''))
        pending = pending.slice(position + 1)
        position = pending.indexOf('\n')
      }
    }
    if (rows.length >= limit) truncated = true
    if (rows.length < limit && pending.trim()) consume(pending.replace(/\r$/, ''))
  } finally { await reader.cancel().catch(() => undefined) }

  const header = headerState.current
  if (!header || rows.length < MIN_GAN_IMAGES) throw new Error(`Necesitas al menos ${MIN_GAN_IMAGES} imágenes para preparar GAN.`)
  const scale: 16 | 255 = header.dimension === 8 && maximum <= 16 ? 16 : 255
  const pixels = new Uint8Array(rows.length * header.dimension * header.dimension)
  rows.forEach((row, imageIndex) => {
    row.forEach((value, pixelIndex) => { pixels[imageIndex * row.length + pixelIndex] = Math.round(value * 255 / scale) })
  })
  return { name: file.name, dimension: header.dimension, count: rows.length, pixels,
    originalScale: scale, truncated, hadLabels: header.labelColumn !== -1 }
}

/** Pequeña muestra determinista del dataset. No genera imágenes sintéticas ni altera datos. */
export function selectGanExamples(dataset: GanImageDataset, max = 8): Array<{ index: number; pixels: Uint8Array }> {
  if (!Number.isInteger(max) || max < 1 || max > 16) throw new Error('Cantidad de ejemplos no permitida.')
  const area = dataset.dimension ** 2
  return Array.from({ length: Math.min(max, dataset.count) }, (_unused, i) => {
    const index = Math.floor(i * dataset.count / Math.min(max, dataset.count))
    return { index, pixels: dataset.pixels.subarray(index * area, (index + 1) * area) }
  })
}

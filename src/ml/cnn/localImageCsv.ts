/**
 * Importación local de imágenes planas representadas como CSV.
 * Lee el archivo de forma incremental y limita la muestra para no retener
 * datasets completos en memoria. No realiza solicitudes de red.
 */
export const MAX_CNN_LOCAL_ROWS = 2_000
export const MAX_CNN_LOCAL_FILE_BYTES = 200_000_000

export interface LocalImageDataset {
  name: string
  width: number
  height: number
  channels: 1
  pixels: Uint8Array
  labels: Uint8Array
  classNames: string[]
  count: number
  originalScale: number
  truncated: boolean
}

export interface LocalImageSample {
  index: number
  label: string
  pixels: Uint8Array
}

const SIZES = new Set([8, 28])

/** Se permiten CSV numéricos simples con encabezados: label,pixel0,... o pixel_0,...,label. */
function parseHeader(raw: string): { labelIndex: number; pixelIndices: number[]; dimension: number } {
  const columns = raw.replace(/^\uFEFF/, '').split(',').map((value) => value.trim().replace(/^"|"$/g, '').toLowerCase())
  const labelIndex = columns.indexOf('label')
  if (labelIndex !== 0 && labelIndex !== columns.length - 1) {
    throw new Error('El CSV debe incluir la columna label al principio o al final.')
  }
  const pixelIndices: number[] = []
  for (let index = 0; index < columns.length; index++) {
    if (index === labelIndex) continue
    const pixel = /^pixel_?(\d+)$/.exec(columns[index])
    if (!pixel) throw new Error(`Columna ${columns[index]} no válida; se esperan pixel_0, pixel_1, etc.`)
    if (Number(pixel[1]) !== pixelIndices.length) throw new Error('Las columnas de píxeles deben estar en orden consecutivo desde pixel_0.')
    pixelIndices.push(index)
  }
  const dimension = Math.sqrt(pixelIndices.length)
  if (!Number.isInteger(dimension) || !SIZES.has(dimension)) {
    throw new Error('CNN local admite por ahora imágenes de 8×8 o 28×28 píxeles en gris.')
  }
  return { labelIndex, pixelIndices, dimension }
}

/** Carga hasta 2 000 filas sin consumir el resto de un CSV MNIST grande. */
export async function loadLocalImageCsv(
  file: File,
  signal?: AbortSignal,
  rowLimit = MAX_CNN_LOCAL_ROWS,
): Promise<LocalImageDataset> {
  if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Selecciona un archivo .csv.')
  if (!file.size || file.size > MAX_CNN_LOCAL_FILE_BYTES) throw new Error('El CSV está vacío o supera el límite de 200 MB.')
  if (!Number.isInteger(rowLimit) || rowLimit < 100 || rowLimit > MAX_CNN_LOCAL_ROWS) throw new Error('Límite de filas no admitido.')

  const reader = file.stream().getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let pending = ''
  let header: ReturnType<typeof parseHeader> | null = null
  const values: number[][] = []
  const rawLabels: string[] = []
  let observedMaximum = 0
  let physicalLine = 0
  let truncated = false

  function acceptLine(line: string) {
    physicalLine++
    const value = line.trim()
    if (!value) return
    if (!header) {
      const firstCells = value.split(',').map((cell) => cell.trim())
      const numericFirstRow = firstCells.length > 1 && firstCells.every((cell) => cell !== '' && Number.isInteger(Number(cell)) && Number(cell) >= 0 && Number(cell) <= 255)
      if (numericFirstRow) {
        // Algunos mirrors de MNIST CSV no tienen encabezado: etiqueta al inicio.
        const dimension = Math.sqrt(firstCells.length - 1)
        if (!Number.isInteger(dimension) || !SIZES.has(dimension)) throw new Error('El CSV sin encabezado debe contener 64 o 784 píxeles, más la etiqueta inicial.')
        header = { labelIndex: 0, pixelIndices: Array.from({ length: firstCells.length - 1 }, (_value, index) => index + 1), dimension }
      } else {
        header = parseHeader(value)
        return
      }
    }
    const cells = value.split(',').map((part) => part.trim().replace(/^"|"$/g, ''))
    if (cells.length !== header.pixelIndices.length + 1) throw new Error(`Fila ${physicalLine}: número de columnas incorrecto.`)
    const label = cells[header.labelIndex]
    if (!label || label.length > 64) throw new Error(`Fila ${physicalLine}: clase vacía o excesivamente larga.`)
    const pixels = header.pixelIndices.map((index) => {
      const cell = cells[index]
      if (!cell) throw new Error(`Fila ${physicalLine}: píxel vacío.`)
      const number = Number(cell)
      if (!Number.isInteger(number) || number < 0 || number > 255) throw new Error(`Fila ${physicalLine}: el píxel ${index} debe estar entre 0 y 255.`)
      observedMaximum = Math.max(observedMaximum, number)
      return number
    })
    values.push(pixels)
    rawLabels.push(label)
  }

  try {
    let done = false
    while (!done && values.length < rowLimit) {
      if (signal?.aborted) throw new Error('Carga cancelada.')
      const chunk = await reader.read()
      done = chunk.done
      pending += done ? decoder.decode() : decoder.decode(chunk.value, { stream: true })
      if (pending.length > 1_000_000) throw new Error('CSV inválido: una línea supera el tamaño permitido.')
      let end = pending.indexOf('\n')
      while (end !== -1 && values.length < rowLimit) {
        acceptLine(pending.slice(0, end).replace(/\r$/, ''))
        pending = pending.slice(end + 1)
        end = pending.indexOf('\n')
      }
    }
    if (values.length === rowLimit) truncated = true
    if (values.length < rowLimit && pending.trim()) acceptLine(pending.replace(/\r$/, ''))
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  if (!header || values.length < 100) throw new Error('Se necesitan al menos 100 imágenes etiquetadas para entrenar.')
  const { dimension } = header
  const classNames = [...new Set(rawLabels)].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  if (classNames.length < 2 || classNames.length > 10) throw new Error('El CSV debe contener de 2 a 10 clases diferentes.')
  const classLookup = new Map(classNames.map((name, index) => [name, index]))
  const labels = new Uint8Array(rawLabels.map((name) => classLookup.get(name)!))
  const classCounts = classNames.map((_name, i) => labels.filter((value) => value === i).length)
  if (classCounts.some((count) => count < 2)) throw new Error('Cada clase necesita al menos dos imágenes para la validación.')
  const originalScale = dimension === 8 && observedMaximum <= 16 ? 16 : 255
  const pixels = new Uint8Array(values.length * dimension * dimension)
  values.forEach((row, i) => row.forEach((value, j) => { pixels[i * row.length + j] = Math.round(value / originalScale * 255) }))
  return { name: file.name, width: dimension, height: dimension, channels: 1, pixels, labels, classNames, count: values.length, originalScale, truncated }
}

/** Galería balanceada a partir de las clases existentes en el CSV. */
export function selectLocalImageGallery(dataset: LocalImageDataset, perClass = 3): LocalImageSample[] {
  const counts = new Array<number>(dataset.classNames.length).fill(0)
  const selected: LocalImageSample[] = []
  const area = dataset.width * dataset.height
  for (let i = 0; i < dataset.count; i++) {
    const label = dataset.labels[i]
    if (counts[label] >= perClass) continue
    selected.push({ index: i, label: dataset.classNames[label], pixels: dataset.pixels.subarray(i * area, (i + 1) * area) })
    counts[label]++
    if (counts.every((count) => count >= perClass)) break
  }
  return selected.sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true }) || a.index - b.index)
}

/** División reproducible, estratificada y sin solapamientos para cualquier número de clases. */
export function splitLocalImageIndices(labels: Uint8Array, classes: number, seed = 42) {
  if (!Number.isInteger(classes) || classes < 2 || classes > 10 || !Number.isInteger(seed)) throw new Error('Clases o semilla inválidas.')
  let state = (seed >>> 0) || 1
  const random = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5
    return (state >>> 0) / 4294967296
  }
  function shuffle(indices: number[]) {
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[indices[i], indices[j]] = [indices[j], indices[i]]
    }
  }
  const train: number[] = []
  const validation: number[] = []
  for (let label = 0; label < classes; label++) {
    const group = Array.from(labels, (item, index) => item === label ? index : -1).filter((index) => index !== -1)
    if (group.length < 2) throw new Error(`La clase ${label} necesita al menos dos imágenes.`)
    shuffle(group)
    const count = Math.max(1, Math.floor(group.length * 0.2))
    validation.push(...group.slice(0, count))
    train.push(...group.slice(count))
  }
  shuffle(train); shuffle(validation)
  return { train, validation }
}

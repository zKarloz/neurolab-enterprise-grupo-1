import type { RawTable } from './types.ts'

/** Estadísticas de columnas sin valores individuales ni filas del CSV. */
export interface CsvSchemaColumn {
  name: string
  type: 'numeric' | 'categorical'
  missingCount: number
}
export interface LocalCsvMetadata {
  name: string
  byteSize: number
  rowCount: number
  fileHash: string
  schema: { columns: CsvSchemaColumn[] }
}

/** Se devuelve un esquema agregado; NO se adjuntan filas ni ejemplos del dataset. */
export function summarizeCsvSchema(table: RawTable): LocalCsvMetadata['schema'] {
  return {
    columns: table.columns.map((name, columnIndex) => {
      const values = table.rows.map((row) => row[columnIndex]?.trim() ?? '')
      const populated = values.filter(Boolean)
      const numeric = populated.length > 0 && populated.every((value) => Number.isFinite(Number(value)))
      return { name, type: numeric ? 'numeric' : 'categorical', missingCount: values.length - populated.length }
    }),
  }
}

/** La huella se calcula localmente; se envía exclusivamente el SHA-256 y los metadatos. */
export async function describeLocalCsv(file: File, table: RawTable): Promise<LocalCsvMetadata> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Se requiere un contexto seguro (HTTPS/localhost) para calcular el SHA-256 del CSV.')
  }
  const bytes = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const fileHash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
  return {
    name: file.name,
    byteSize: file.size,
    rowCount: table.rows.length,
    fileHash,
    schema: summarizeCsvSchema(table),
  }
}

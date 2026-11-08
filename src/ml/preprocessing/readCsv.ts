import Papa from 'papaparse'
import type { RawTable } from './types.ts'

export const MAX_CSV_BYTES = 10 * 1024 * 1024
export const MAX_CSV_ROWS = 50_000
const MAX_CSV_COLUMNS = 100

/** Lectura local por filas con PapaParse: nunca envía el contenido a Supabase. */
export function readLocalCsv(file: File): Promise<RawTable> {
  if (!/\.csv$/i.test(file.name)) return Promise.reject(new Error('Selecciona un archivo con extensión .csv.'))
  if (file.size === 0) return Promise.reject(new Error('El CSV está vacío.'))
  if (file.size > MAX_CSV_BYTES) return Promise.reject(new Error('El CSV supera el límite de 10 MiB.'))

  return new Promise((resolve, reject) => {
    let complete = false
    let columns: string[] | null = null
    const rows: string[][] = []
    function fail(message: string) {
      if (complete) return
      complete = true
      reject(new Error(message))
    }
    Papa.parse<string[]>(file, {
      worker: true,
      header: false,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
      step(results, parser) {
        if (complete) return
        if (results.errors.length) {
          fail(`CSV inválido: ${results.errors[0].message}`)
          parser.abort()
          return
        }
        const fields = results.data.map((field) => String(field))
        if (!columns) {
          columns = fields.map((field) => field.trim())
          if (columns.length < 2 || columns.length > MAX_CSV_COLUMNS ||
              columns.some((name) => !name) || new Set(columns).size !== columns.length) {
            fail('Cabeceras vacías, duplicadas o número de columnas no permitido (2–100).')
            parser.abort()
          }
          return
        }
        if (fields.length !== columns.length) {
          fail(`La fila ${rows.length + 2} tiene un número de columnas diferente al encabezado.`)
          parser.abort()
          return
        }
        if (rows.length >= MAX_CSV_ROWS) {
          fail('El CSV supera el máximo de 50 000 filas de datos.')
          parser.abort()
          return
        }
        rows.push(fields)
      },
      complete() {
        if (complete) return
        complete = true
        if (!columns || !rows.length) reject(new Error('El CSV necesita cabeceras y filas de datos.'))
        else resolve({ columns, rows })
      },
      error(error) { fail(`No se pudo leer el CSV: ${error.message}`) },
    })
  })
}

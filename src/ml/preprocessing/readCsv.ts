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
      // PapaParse con worker:true presenta fallos en builds de producción de Vite 8.
      // La lectura por fragmentos (FileReader) funciona sin el Worker interno.
      worker: false,
      chunkSize: 256 * 1024,
      header: false,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
      step(results, parser) {
        if (complete) return
        try {
          if (results.errors.length) {
            throw new Error(`CSV inválido: ${results.errors[0].message}`)
          }
          // Una respuesta malformada debe provocar un error visible, nunca un spinner infinito.
          if (!Array.isArray(results.data)) {
            throw new Error('El lector CSV devolvió una fila inválida. Vuelve a importar el archivo.')
          }
          const fields = results.data.map((field) => String(field))
          if (!columns) {
            columns = fields.map((field) => field.trim())
            if (columns.length < 2 || columns.length > MAX_CSV_COLUMNS ||
                columns.some((name) => !name) || new Set(columns).size !== columns.length) {
              throw new Error('Cabeceras vacías, duplicadas o número de columnas no permitido (2–100).')
            }
            return
          }
          if (fields.length !== columns.length) {
            throw new Error(`La fila ${rows.length + 2} tiene un número de columnas diferente al encabezado.`)
          }
          if (rows.length >= MAX_CSV_ROWS) {
            throw new Error('El CSV supera el máximo de 50 000 filas de datos.')
          }
          rows.push(fields)
        } catch (cause) {
          fail(cause instanceof Error ? cause.message : 'No se pudo analizar una fila del CSV.')
          parser.abort()
        }
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

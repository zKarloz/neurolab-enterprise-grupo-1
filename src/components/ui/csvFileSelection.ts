/** Contrato compartido de selección local: nunca inspecciona ni envía contenidos a un servidor. */
export type LocalCsvFileLike = Pick<File, 'name'>

export type LocalCsvSelection<T extends LocalCsvFileLike> =
  | { ok: true; file: T }
  | { ok: false; error: string }

/** Valida la extensión de un único CSV, tanto al escogerlo como al soltarlo. */
export function selectLocalCsv<T extends LocalCsvFileLike>(files: readonly T[]): LocalCsvSelection<T> {
  if (files.length === 0) return { ok: false, error: 'Selecciona un archivo CSV.' }
  if (files.length > 1) return { ok: false, error: 'Selecciona o arrastra un solo archivo CSV a la vez.' }
  const file = files[0]
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return { ok: false, error: 'El archivo debe tener extensión .csv.' }
  }
  return { ok: true, file }
}

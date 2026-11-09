/**
 * CSV del reporte: los valores son datos, nunca fórmulas de hoja de cálculo.
 * No incluye filas originales de los datasets ni credenciales.
 */
export function safeCsvCell(value: unknown): string {
  const input = value === null || value === undefined ? '' : String(value)
  // Neutralizar fórmulas incluso si comienzan tras espacios o caracteres de control.
  const sanitized = /^[\s\u0000-\u001f]*[=+\-@]/u.test(input) ? `'${input}` : input
  return `"${sanitized.replace(/"/g, '""')}"`
}

export function toCsv(headers: readonly string[], records: readonly (readonly unknown[])[]): string {
  if (!headers.length || records.some((row) => row.length !== headers.length)) {
    throw new Error('Las columnas del reporte CSV no son consistentes.')
  }
  return '\uFEFF' + [headers, ...records].map((row) => row.map(safeCsvCell).join(',')).join('\r\n') + '\r\n'
}

/** Descarga solo tras confirmación del evento de exportación en Supabase. */
export function saveCsv(filename: string, content: string): void {
  if (!/^[a-zA-Z0-9_.-]+\.csv$/.test(filename)) throw new Error('Nombre de exportación inválido.')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
  } finally {
    // Safari/Firefox pueden necesitar que el navegador complete la descarga
    // antes de revocar el blob; no se guarda el archivo en ningún servidor.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/**
 * NeuroLab Enterprise · Fase 6: consolida el acta de cierre documental.
 *
 * - No edita archivos de aplicación, migraciones ni configuraciones de Supabase.
 * - Añade únicamente un anexo delimitado por marcas al Markdown de Fase 6.
 * - Es idempotente y preserva los saltos de línea LF/CRLF del documento existente.
 * - Si el anexo fue editado previamente, NO lo reemplaza sin revisión humana.
 *
 * Uso: node tools/actualizar-cierre-documental-fase6.mjs [--check]
 */
import { readFile, writeFile, rename, unlink, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DOC = path.join(ROOT, 'docs', 'operations', 'FASE_6_COMPLEMENTOS.md')
const SECTION = path.join(ROOT, 'tools', 'fase6-cierre-documental-section.md')
const START = '<!-- FASE6-CIERRE-DOCUMENTAL-20261109 -->'
const END = '<!-- /FASE6-CIERRE-DOCUMENTAL-20261109 -->'
const LF = (s) => s.replaceAll('\r\n', '\n')
const lines = (s) => (s.includes('\r\n') ? '\r\n' : '\n')

export function integrateDocument(documentText, sectionText) {
  const source = LF(documentText)
  const annex = LF(sectionText).trim()
  if (!annex.startsWith(START) || !annex.endsWith(END) || annex.indexOf(END) !== annex.lastIndexOf(END)) {
    throw new Error('El contenido del anexo no contiene las marcas de inicio/fin esperadas.')
  }
  const a = source.indexOf(START)
  const b = source.indexOf(END)
  if ((a >= 0) !== (b >= 0)) throw new Error('Se encontró una marca de anexo incompleta; revisar el archivo manualmente.')
  if (a >= 0) {
    if (source.indexOf(START, a + 1) >= 0 || source.indexOf(END, b + 1) >= 0 || b < a) {
      throw new Error('Se encontraron marcas de anexo duplicadas o desordenadas.')
    }
    const current = source.slice(a, b + END.length)
    if (current !== annex) throw new Error('El anexo ya existe, pero fue modificado; no se sobrescribirá.')
    return { text: documentText, changed: false }
  }
  if (!source.trim()) throw new Error('El documento de Fase 6 está vacío; se rechaza la sustitución.')
  const newline = lines(documentText)
  const result = source.trimEnd() + '\n\n' + annex + '\n'
  return { text: newline === '\r\n' ? result.replaceAll('\n', '\r\n') : result, changed: true }
}

export async function updateDocument({ check = false } = {}) {
  if (!existsSync(path.join(ROOT, 'package.json')) || !existsSync(path.join(ROOT, '.git'))) {
    throw new Error('Este script debe estar dentro del repositorio Git de NeuroLab (no en NeuroLab-Restore-Local).')
  }
  const [original, section] = await Promise.all([readFile(DOC, 'utf8'), readFile(SECTION, 'utf8')])
  const result = integrateDocument(original, section)
  if (check) {
    return result.changed ? 'OK · Documento compatible: el anexo está listo para incorporar.'
      : 'OK · El anexo de cierre ya existe e íntegro; no se modificará.'
  }
  if (!result.changed) return 'OK · Anexo ya incorporado; no se duplicó contenido.'
  // Escritura atómica dentro del mismo directorio: reduce daños por interrupción.
  const tmp = DOC + '.fase6-cierre-tmp'
  if (existsSync(tmp)) throw new Error('Existe una actualización temporal anterior; revisarla antes de continuar.')
  try {
    await writeFile(tmp, result.text, { flag: 'wx' })
    await rename(tmp, DOC)
  } catch (error) {
    try { await unlink(tmp) } catch {}
    throw error
  }
  return 'OK · Acta de cierre documental añadida al Markdown existente de Fase 6.'
}

// Evitar ejecución al importarse desde los tests.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== '--check')) {
    console.error('ERROR · Argumento no reconocido. Uso: node tools/actualizar-cierre-documental-fase6.mjs [--check]')
    process.exitCode = 2
  } else {
    updateDocument({ check: args.includes('--check') })
      .then((message) => console.log(message))
      .catch((error) => { console.error('ERROR · ' + error.message); process.exitCode = 1 })
  }
}

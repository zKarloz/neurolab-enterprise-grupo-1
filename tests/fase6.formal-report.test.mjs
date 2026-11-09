/** Verificaciones que no requieren servidor, credenciales ni navegador. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const get = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const page = get('src/features/reports/ProjectReportPage.tsx')
const document = get('src/features/reports/FormalReportDocument.tsx')
const css = get('src/features/reports/formalReportPrint.css')

test('PDF utiliza plantilla independiente, sin imprimir el módulo', () => {
  assert.match(page, /<div className="report-screen space-y-6">/)
  assert.match(page, /<FormalReportDocument data=\{data\}/)
  assert.match(page, /import '\.\/formalReportPrint\.css'/)
  assert.match(css, /\.report-screen\s*,/)
  assert.match(css, /display:\s*none\s*!important/)
  assert.match(css, /\.nl-report-paper\s*\{\s*display:\s*block\s*!important/)
})

test('el documento formal no usa cards ni iconos ni controles interactivos', () => {
  assert.doesNotMatch(document, /<Surface|<Button|<Pagination|<svg|<Printer|<Download|<Link\b/)
  assert.match(document, /<article className="nl-report-paper hidden"/)
  assert.match(document, /<header className="nl-paper-header"/)
  assert.match(document, /<footer className="nl-paper-footer"/)
  assert.match(css, /size:\s*A4 portrait/)
})

test('el PDF no se limita a la página visible de 10 ejecuciones', () => {
  assert.match(document, /data\.runs\.map\(/)
  assert.doesNotMatch(document, /pageRuns|\.slice\(/)
  assert.match(document, /200 registros más recientes/)
  assert.match(css, /table-header-group/)
  assert.match(css, /break-inside:\s*avoid/)
})

test('se conservan los permisos de exportación y el CSV previo', () => {
  assert.match(page, /await recordExport\(projectId,/)
  assert.match(page, /window\.print\(\)/)
  assert.match(page, /saveCsv\(/)
  assert.doesNotMatch(document, /supabase\.|from\('auth\.users'\)|service_role/)
})

test('el contenido es un reporte técnico y explicita los límites de los datos', () => {
  for (const heading of ['Descripción del proyecto', 'Resumen general', 'Arquitecturas registradas', 'Datasets registrados', 'Entrenamientos y resultados', 'Alcance y limitaciones']) {
    assert.ok(document.includes(heading), `Falta sección ${heading}`)
  }
  assert.match(document, /no constituyen certificación independiente/)
  assert.match(document, /No se incorporan filas del CSV original/)
})

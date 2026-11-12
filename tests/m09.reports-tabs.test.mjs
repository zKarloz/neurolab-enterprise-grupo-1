/** M09: navegación por pestañas sin alterar permisos, exportaciones ni historial. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/features/reports/ProjectReportPage.tsx', import.meta.url), 'utf8')
const tabs = readFileSync(new URL('../src/components/ui/Tabs.tsx', import.meta.url), 'utf8')

test('M09: reutiliza Tabs y muestra Resumen antes de Historial', () => {
  assert.match(page, /import \{ Tabs \} from '\.\.\/\.\.\/components\/ui\/Tabs'/)
  assert.match(page, /id: 'summary', label: 'Resumen del proyecto'/)
  assert.match(page, /id: 'history', label: 'Historial de entrenamientos'/)
  assert.match(page, /useState<ReportTab>\('summary'\)/)
  assert.match(page, /<Tabs label="Secciones de reportes"/)
})

test('M09: solo monta la pestaña activa con paneles accesibles', () => {
  assert.match(page, /tab === 'summary' && <div id="project-reports-panel-summary" role="tabpanel"/)
  assert.match(page, /tab === 'history' && <div id="project-reports-panel-history" role="tabpanel"/)
  assert.match(page, /aria-labelledby="project-reports-tab-summary"/)
  assert.match(page, /aria-labelledby="project-reports-tab-history"/)
  assert.match(tabs, /role="tablist"/)
  assert.match(tabs, /onKeyDown/)
})

test('M09: conserva ficha de proyecto, indicadores y resumen de arquitectura', () => {
  for (const text of [
    'Ficha de proyecto', 'data.project.name', 'data.project.description',
    'data.project.created_at', 'data.project.status', 'totals.architectures',
    'totals.datasets', 'totals.runs', 'totals.versions', 'Resumen de arquitectura',
    'Entrenamiento y evaluaciones',
  ]) assert.ok(page.includes(text), `Falta ${text}`)
  assert.match(page, /Este proyecto aún no tiene una descripción registrada/)
})

test('M09: conserva cuatro familias, filtros y paginación del historial', () => {
  for (const family of ['feedforward', 'cnn', 'rnn', 'gan']) {
    assert.ok(page.includes(`value:'${family}'`), `Falta ${family}`)
  }
  assert.match(page, /<Pagination page=\{page\} pageSize=\{PAGE_SIZE\} total=\{filteredRuns.length\}/)
  assert.match(page, /setFamily\(event.target.value as FamilyFilter\); setPage\(1\)/)
  assert.match(page, /formatGanReportSummary/)
})

test('M09: exporta con filtro sin perder el documento formal ni las auditorías', () => {
  assert.match(page, /await recordExport\(projectId/)
  assert.match(page, /const rows = filteredRuns.map/)
  assert.match(page, /<FormalReportDocument data=\{data\} familyFilter=\{family\}/)
  assert.match(page, /window.print\(\)/)
  assert.match(page, /ganReportColumns/)
  assert.ok(page.indexOf('<FormalReportDocument') > page.indexOf('tab === \'history\''))
})

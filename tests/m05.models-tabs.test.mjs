/** M05: contratos de pestañas accesibles y limpieza de predictores del registro privado. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/features/models/ModelRegistryPage.tsx', import.meta.url), 'utf8')
const tabs = readFileSync(new URL('../src/components/ui/Tabs.tsx', import.meta.url), 'utf8')

test('M05: reutiliza Tabs compartidas, con las dos secciones solicitadas', () => {
  assert.match(page, /import \{ Tabs \} from '\.\.\/\.\.\/components\/ui\/Tabs'/)
  assert.match(page, /id: 'published', label: 'Versiones publicadas'/)
  assert.match(page, /id: 'reviews', label: 'Revisión y aprobación'/)
  assert.match(page, /useState<RegistryTab>\('published'\)/)
  assert.match(page, /<Tabs label="Secciones de modelos privados"/)
})

test('M05: solo monta la sección activa y conserva la accesibilidad', () => {
  assert.match(page, /role="tabpanel"/)
  assert.match(page, /aria-labelledby=\{`model-registry-tab-\$\{tab\}`\}/)
  assert.match(page, /tab === 'published' \? <>/)
  assert.match(page, /: <ModelReviewsSection projectId=\{projectId\} models=\{models\} versions=\{versions\} \/>/)
  assert.match(tabs, /role="tablist"/)
  assert.match(tabs, /role="tab"/)
  assert.match(tabs, /ArrowRight/)
})

test('M05: al cambiar pestaña cancela cargas y libera pesos TF.js', () => {
  const changeTab = page.split('function changeTab(next: string) {')[1]?.split('\n  async function loadVersion')[0]
  assert.ok(changeTab)
  for (const command of ['loadGeneration.current += 1', 'predictor.current?.dispose()', 'predictor.current = null', 'setSelected(null)', 'setTab(next)']) {
    assert.ok(changeTab.includes(command), `Falta ${command}`)
  }
  assert.match(page, /if \(generation !== loadGeneration\.current\) return/)
})

test('M05: mantiene filtros, paginación, revisión y las cuatro familias', () => {
  for (const item of [
    'SelectField', 'Pagination', 'loadDensePredictor', 'loadCnnPredictor',
    'loadRnnPredictor', 'loadGanGenerator', 'GanRestoredGenerationCard',
    'RnnRestoredPredictionCard', 'CnnRestoredPredictionCard',
    'SessionPredictionCard', 'ModelReviewsSection',
  ]) assert.ok(page.includes(item), `Falta ${item}`)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')
const dataset = read('src/features/datasets/LocalDatasetPage.tsx')
const dense = read('src/features/training/DenseTrainingPanel.tsx')
const projects = read('src/features/projects/ProjectDetailPage.tsx')

test('M03: cambia Dataset local a Feedforward sin cambiar /datos', () => {
  assert.match(projects, /Red feedforward · Dense/)
  assert.match(projects, /Abrir Feedforward/)
  assert.match(projects, /\/proyectos\/\$\{projectId\}\/datos/)
  assert.match(dataset, /Red feedforward \(Dense\)/)
})

test('M03: cinco pestañas accesibles y componentes compartidos', () => {
  for (const label of ['Datos', 'Arquitectura', 'Entrenar', 'Evaluar', 'Predecir']) {
    assert.match(dataset, new RegExp(`label: '${label}'`))
  }
  assert.match(dataset, /<Tabs label="Secciones del módulo Feedforward"/)
  assert.match(dataset, /idPrefix="feedforward"/)
  assert.match(dataset, /role="tabpanel"/)
  assert.match(dense, /role="tabpanel"/)
  assert.match(dataset, /id="feedforward-panel-datos"/)
  for (const id of ['arquitectura', 'entrenar', 'evaluar', 'predecir']) {
    assert.ok(dense.includes(`id="feedforward-panel-${id}"`))
  }
})

test('M03: entrenamiento y predicción sobreviven a cambiar de pestaña', () => {
  assert.match(dataset, /\{prepared && source && <DenseTrainingPanel/)
  assert.doesNotMatch(dataset, /\{tab === 'entrenar' && <DenseTrainingPanel/)
  assert.match(dense, /hidden=\{activeTab !== 'entrenar'\}/)
  assert.match(dense, /hidden=\{activeTab !== 'predecir'\}/)
  assert.match(dense, /session\.current\.predict\(values\)/)
  assert.match(dense, /session\.current\?\.dispose\(\)/)
})

test('M03: importación y objetivos quedan bloqueados mientras se ejecuta o sincroniza', () => {
  assert.match(dataset, /if \(trainingBusy\) return/)
  assert.match(dataset, /disabled=\{busy \|\| trainingBusy\}/)
  assert.match(dataset, /disabled=\{trainingBusy\}/)
  assert.match(dense, /onBusyChange\(active\)/)
  assert.match(dense, /onBusyChange\(false\)/)
})

test('M03: no altera la persistencia existente ni los permisos de ingeniero', () => {
  assert.match(dataset, /membership\.data\?\.role !== 'engineer'/)
  assert.match(dense, /createPersistedRun\(projectId, source, dataset, config\)/)
  assert.match(dense, /persistTestEvaluation\(stream\.id, event\.evaluation\)/)
  assert.match(dense, /saveModelVersion\(runId, modelName, bundle\)/)
  assert.match(dataset, /<RecentTrainingRuns projectId=\{projectId\}/)
})

test('M03: documentación idempotente y sin sobreescritura de secciones anteriores', () => {
  const src = read('scripts/m03-feedforward-documentation.mjs')
  assert.match(src, /if \(!current\.includes\(marker\)\)/)
  assert.match(src, /FASE_3_FEEDFORWARD\.md/)
  assert.doesNotMatch(src, /writeFileSync\(file, section/)
})

/** Garantías estructurales de exportación, Storage privado e integración de GAN-4C. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('GAN-4C: exporta SOLO G sin D y soporta Worker y fallback', () => {
  const engine = source('src/ml/gan/trainEngine.ts')
  const session = source('src/ml/gan/trainingSession.ts')
  const worker = source('src/workers/gan.worker.ts')
  assert.match(engine, /serializeDenseModel\(generator\)/)
  assert.doesNotMatch(engine, /serializeDenseModel\(discriminator\)/)
  assert.ok(engine.includes('discriminator?.dispose()'))
  assert.match(session, /exportModel: \(\) =>/)
  assert.match(session, /pendingExport/)
  assert.match(session, /trained\.exportModel\(\)/)
  assert.match(worker, /command\.type === 'export-model'/)
  assert.match(worker, /\[bundle\.weightData\]/)
})

test('GAN-4C: publicar requiere confirmación de resumen descriptivo GAN-4B', () => {
  const page = source('src/features/gan/GanPage.tsx')
  assert.match(page, /summaryState !== 'confirmed'/)
  assert.match(page, /syncState !== 'confirmed'/)
  assert.match(page, /session\.exportModel\(\)/)
  assert.match(page, /saveModelVersion\(associatedRun, name, bundle\)/)
  assert.match(page, /trainingSession\.current\?\.dispose\(\)/)
  assert.ok(page.indexOf('saveModelVersion(') > page.indexOf('createGanRun('))
})

test('GAN-4C: restauración separa GAN de CNN, RNN y Feedforward', () => {
  const registry = source('src/features/models/ModelRegistryPage.tsx')
  for (const term of ['isGanManifest', 'loadGanGenerator', 'GanRestoredGenerationCard',
    'loadDensePredictor', 'loadCnnPredictor', 'loadRnnPredictor', "value: 'gan'"]) assert.ok(registry.includes(term))
  assert.match(registry, /predictor\.current\?\.dispose\(\)/)
  const predictor = source('src/ml/gan/modelPersistence.ts')
  assert.match(predictor, /validateGeneratorShape/)
  assert.match(predictor, /tf\.loadLayersModel/)
  assert.match(predictor, /model\.dispose\(\)/)
  assert.doesNotMatch(predictor, /supabase|\.storage\./)
})

test('GAN-4C: no añade migración; verificación SQL solo lee versiones y familia real', () => {
  const sql = source('supabase/tests/FASE_7_GAN4C_VERIFICACION.sql')
  const body = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n')
  assert.match(body, /^select\s/i)
  assert.doesNotMatch(body, /\b(insert|delete|update|alter|create|drop|grant|revoke)\b/i)
  assert.match(body, /a\.family\s*=\s*'gan'/)
  assert.match(body, /version_consistente/)
})

test('GAN-4C: documentación repetida no duplica la sección', () => {
  const temp = mkdtempSync(join(tmpdir(), 'gan4c-doc-'))
  mkdirSync(join(temp, 'scripts'), {recursive: true})
  mkdirSync(join(temp, 'docs/operations'), {recursive: true})
  const existing = source('docs/operations/FASE_7_ARQUITECTURAS.md')
  writeFileSync(join(temp, 'docs/operations/FASE_7_ARQUITECTURAS.md'), existing.replace(/\n<!-- GAN4C_INICIO -->[\s\S]*?<!-- GAN4C_FIN -->\n?/g, ''))
  copyFileSync(new URL('../scripts/gan4c-documentation.mjs', import.meta.url), join(temp, 'scripts/gan4c-documentation.mjs'))
  for (let i = 0; i < 2; i++) {
    const run = spawnSync(process.execPath, [join(temp, 'scripts/gan4c-documentation.mjs')], {encoding: 'utf8'})
    assert.equal(run.status, 0, run.stderr)
  }
  const output = readFileSync(join(temp, 'docs/operations/FASE_7_ARQUITECTURAS.md'), 'utf8')
  assert.equal(output.split('## GAN-4C —').length - 1, 1)
})

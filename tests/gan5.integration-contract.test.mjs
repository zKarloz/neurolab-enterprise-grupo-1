/** GAN-5: aislamiento, privacidad y contrato verificable de recuperación de G. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseGanPreprocessingManifest } from '../src/ml/gan/modelManifest.ts'
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const manifest = {
  family: 'gan', kind: 'gan_grayscale_csv_v1', dimension: 8,
  channels: 1, pixelRange: 'zero_to_255', normalization: 'tanh_minus1_plus1',
  latentSize: 32, unconditional: true, trainedImages: 178, seedMode: 'unseeded',
}

test('GAN-5: el manifiesto de recuperación rechaza formatos de otras familias', () => {
  assert.deepEqual(parseGanPreprocessingManifest(manifest), manifest)
  assert.throws(() => parseGanPreprocessingManifest({ ...manifest, family: 'rnn' }))
  assert.throws(() => parseGanPreprocessingManifest({ ...manifest, normalization: 'zero_to_one' }))
  assert.throws(() => parseGanPreprocessingManifest({ ...manifest, dimension: 12 }))
})

test('GAN-5: la exportación y restauración del generador no incluye discriminador', () => {
  const engine = read('src/ml/gan/trainEngine.ts')
  const restore = read('src/ml/gan/modelPersistence.ts')
  assert.match(engine, /serializeDenseModel\(generator\)/)
  assert.match(engine, /generator\?\.dispose\(\)/)
  assert.match(engine, /discriminator\?\.dispose\(\)/)
  assert.match(restore, /loadLayersModel/)
  assert.match(restore, /parseGanPreprocessingManifest/)
  assert.doesNotMatch(restore, /\.insert\(|\.upload\(|service_role/i)
})

test('GAN-5: el flujo de versión utiliza el registro privado compartido', () => {
  const screen = read('src/features/gan/GanPage.tsx')
  const models = read('src/features/models/ModelRegistryPage.tsx')
  const registry = read('src/services/modelRegistry.ts')
  assert.match(screen, /saveModelVersion/)
  assert.match(models, /GanRestoredGenerationCard/)
  assert.match(registry, /model-artifacts/)
  assert.match(registry, /manifest_sha256|manifestSha256/)
  assert.match(registry, /weights_sha256|weightsSha256/)
})

test('GAN-5: historial y reportes identifican familia generativa sin convertirla en clasificación', () => {
  const history = read('src/features/evaluation/TrainingHistoryPage.tsx')
  const report = read('src/features/reports/ProjectReportPage.tsx')
  const pdf = read('src/features/reports/FormalReportDocument.tsx')
  assert.match(history, /GanStoredEvaluationCard/)
  assert.match(history, /GanRunComparison/)
  assert.match(report, /gan/)
  assert.match(pdf, /gan/)
})

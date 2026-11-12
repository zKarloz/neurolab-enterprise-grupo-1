import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8')

test('GAN-2: D y G se entrenan con dos Adam, varList separados y pérdidas distintas', () => {
  const engine = read('../src/ml/gan/trainEngine.ts')
  assert.match(engine, /discriminatorOptimizer = tf\.train\.adam/)
  assert.match(engine, /generatorOptimizer = tf\.train\.adam/)
  assert.match(engine, /discriminatorVariables = discriminator\.trainableWeights\.map/)
  assert.match(engine, /generatorVariables = generator\.trainableWeights\.map/)
  assert.match(engine, /discriminatorOptimizer\.minimize\([\s\S]+?discriminatorVariables/)
  assert.match(engine, /generatorOptimizer\.minimize\([\s\S]+?generatorVariables/)
  assert.match(engine, /function generatorLoss/)
  assert.match(engine, /function discriminatorLoss/)
  assert.match(engine, /tf\.layers\.leakyReLU/)
  assert.match(engine, /tf\.layers\.reshape/)
})

test('GAN-2: Worker transfiere copia, pausa por lote y libera recursos', () => {
  const session = read('../src/ml/gan/trainingSession.ts')
  const worker = read('../src/workers/gan.worker.ts')
  const engine = read('../src/ml/gan/trainEngine.ts')
  assert.match(session, /new Uint8Array\(dataset\.pixels\)/)
  assert.match(session, /copiedPixels\.buffer/)
  assert.match(session, /if \(!started\) runMain\(\)/)
  assert.match(worker, /trainGanModel/)
  assert.match(worker, /controller\?\.abort\(\)/)
  assert.match(engine, /setTimeout\(resolve, 0\)/)
  assert.match(engine, /generator\?\.dispose\(\)/)
  assert.match(engine, /discriminator\?\.dispose\(\)/)
  assert.match(engine, /generatorOptimizer\?\.dispose\(\)/)
  assert.match(engine, /discriminatorOptimizer\?\.dispose\(\)/)
})

test('GAN-2/GAN-4B: UI requiere Ingeniero y reusa controles; persiste solo métricas', () => {
  const page = read('../src/features/gan/GanPage.tsx')
  const panel = read('../src/features/gan/GanTrainingPanel.tsx')
  assert.match(page, /membership\?\.role === 'engineer'/)
  assert.match(page, /startGanTraining\(/)
  assert.match(page, /trainingSession\.current\?\.dispose\(\)/)
  assert.match(page, /GanGenerationPanel/)
  // GAN-4C incorporó versionado privado por servicio; prohibimos escritura directa en UI.
  assert.doesNotMatch(page, /\.rpc\(|\.upload\(|supabase\.storage/)
  assert.match(page, /saveModelVersion/)
  assert.match(page, /queue\.epoch\(event\.metrics\)/)
  assert.match(panel, /<SelectField/)
  assert.match(panel, /<Button/)
  assert.match(panel, /<Spinner/)
  assert.match(panel, /GanMetricsChart/)
})

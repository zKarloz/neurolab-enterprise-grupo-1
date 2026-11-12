/** GAN-3: contratos de ciclo de vida y conexión UI/Worker. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('GAN-3: conserva exclusivamente G tras completar y descarta G en cancelación', () => {
  const engine = read('../src/ml/gan/trainEngine.ts')
  assert.match(engine, /onTrained\(runtime\)/)
  assert.match(engine, /generator = null/)
  assert.match(engine, /generator\?\.dispose\(\); discriminator\?\.dispose\(\)/)
  assert.match(engine, /discriminatorOptimizer\?\.dispose\(\)/)
  assert.match(engine, /if \(cancelled\(\) \|\| signal\.aborted\)/)
  assert.match(engine, /tf\.randomNormal\(\[count, latentSize\]\)/)
  assert.match(engine, /output\.dispose\(\)/)
})

test('GAN-3: Worker genera con pesos guardados localmente y transfiere solo píxeles', () => {
  const worker = read('../src/workers/gan.worker.ts')
  const session = read('../src/ml/gan/trainingSession.ts')
  assert.match(worker, /let trained: TrainedGanGenerator \| null = null/)
  assert.match(worker, /trained\.generate\(command\.count\)/)
  assert.match(worker, /\[batch\.pixels\.buffer\]/)
  assert.match(session, /const pending = new Map/)
  assert.match(session, /rejectPending\(/)
  assert.match(session, /if \(!started\) runMain\(\)/)
  assert.match(session, /trained\?\.dispose\(\)/)
  assert.match(session, /generate: \(count\)/)
})

test('GAN-3/GAN-4C: generación tras entrenar, sin subida directa de PNG; G versionable', () => {
  const page = read('../src/features/gan/GanPage.tsx')
  const panel = read('../src/features/gan/GanGenerationPanel.tsx')
  assert.match(page, /training\.phase === 'completed'/)
  assert.match(page, /session\.generate\(sampleCount\)/)
  assert.match(page, /trainingRequest\.current/)
  assert.match(panel, /GanGrayImage/)
  assert.match(panel, /fileName=/)
  assert.match(panel, /FID, IS ni calidad/)
  // Los pesos se publican únicamente por el servicio compartido, no por la UI.
  assert.doesNotMatch(`${page}${panel}`, /\.rpc\(|\.upload\(|supabase\.storage/)
  assert.match(page, /saveModelVersion/)
  assert.match(page, /queue\.summary\(batch\)/)
})

test('GAN-3: documentación se incorpora una sola vez', () => {
  const script = read('../scripts/gan3-documentation.mjs')
  assert.match(script, /previous\.includes\(heading\)/)
  assert.match(script, /GAN-3/)
})

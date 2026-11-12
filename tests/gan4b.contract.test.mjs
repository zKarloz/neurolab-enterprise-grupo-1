/** Comprobación estructural para que no se filtren CSV, pesos o PNG a RPC. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, copyFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { ganEpochPayload, ganGenerationSummaryPayload } from '../src/ml/gan/persistencePayload.ts'

const source = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('GAN-4B: crea run antes de TF.js y registra runtime, cuatro métricas y final', () => {
  const page = source('src/features/gan/GanPage.tsx')
  assert.ok(page.indexOf('await createGanRun(') < page.indexOf('startGanTraining(currentDataset'))
  for (const action of ['queue.runtime(', 'queue.epoch(', "queue.finish('completed'", 'queue.summary(batch)']) {
    assert.ok(page.includes(action), `Falta ${action}`)
  }
  assert.match(page, /sha256LocalFile\(file, controller\.signal\)/)
  assert.match(page, /queue\.isCompletedConfirmed/)
  assert.match(page, /summaryState === 'confirmed'/)
  assert.match(page, /persistenceLocked=\{locked\}/)
})

test('GAN-4B: servicios no incluyen imágenes ni escritura directa de tablas', () => {
  const service = source('src/services/ganPersistence.ts')
  for (const action of ['create_gan_training_run', 'record_gan_training_epoch',
    'record_gan_generation_summary', 'finish_training_run', 'set_training_runtime']) {
    assert.ok(service.includes(action) || (action === 'set_training_runtime' && service.includes('recordBackend')))
  }
  assert.ok(!/\.from\(/.test(service), 'No debe escribir directamente tablas')
  assert.ok(!/\.storage\./.test(service), 'GAN-4B no sube archivos')
  const summary = ganGenerationSummaryPayload('run', {
    count: 4, dimension: 8, pixels: new Uint8Array(256),
  })
  assert.deepEqual(Object.keys(summary.p_metrics).sort(), [
    'dimension', 'family', 'kind', 'maximumPixel', 'meanIntensity',
    'meanPairwiseDistance', 'minimumPixel', 'sampleCount',
  ].sort())
  assert.equal(JSON.stringify(summary).includes('pixels'), false)
  assert.deepEqual(Object.keys(ganEpochPayload('run', {
    epoch: 1, generatorLoss: 0.8, discriminatorLoss: 1.2, realScore: 0.6, fakeScore: 0.4,
  })).sort(), ['p_run_id','p_epoch','p_generator_loss','p_discriminator_loss','p_real_score','p_fake_score'].sort())
})

test('GAN-4B: verificación SQL es de lectura y agrupa por familia real', () => {
  const sql = source('supabase/tests/FASE_7_GAN4B_VERIFICACION.sql')
  const statements = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n')
  assert.match(statements, /^select\s/i)
  assert.doesNotMatch(statements, /\b(insert|update|delete|alter|create|drop|truncate|grant|revoke)\b/i)
  assert.match(statements, /a\.family\s*=\s*'gan'/)
  assert.match(statements, /4 \* r\.epochs_planned/)
  assert.match(statements, /resumen_solo_agregados/)
})

test('GAN-4B: documentación repetida no duplica la sección', () => {
  const temp = mkdtempSync(join(tmpdir(), 'gan4b-doc-'))
  const destDir = join(temp, 'scripts')
  const docDir = join(temp, 'docs/operations')
  mkdirSync(destDir, {recursive:true}); mkdirSync(docDir, {recursive:true})
  const originalDoc = source('docs/operations/FASE_7_ARQUITECTURAS.md')
  writeFileSync(join(docDir,'FASE_7_ARQUITECTURAS.md'), originalDoc.replace(/\n<!-- GAN4B_INICIO -->[\s\S]*?<!-- GAN4B_FIN -->\n?/,''))
  copyFileSync(new URL('../scripts/gan4b-documentation.mjs',import.meta.url),join(destDir,'gan4b-documentation.mjs'))
  for(let i=0;i<2;i++) {
    const r=spawnSync(process.execPath,[join(destDir,'gan4b-documentation.mjs')],{encoding:'utf8'})
    assert.equal(r.status,0,r.stderr)
  }
  const after=readFileSync(join(docDir,'FASE_7_ARQUITECTURAS.md'),'utf8')
  assert.equal(after.split('## GAN-4B —').length-1,1)
})

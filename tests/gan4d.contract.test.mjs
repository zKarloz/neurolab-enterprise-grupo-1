/** Contrato de integración: filtros, reportes y diagnóstico SQL solo lectura. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('GAN-4D: historial por familia real y 400 métricas en 100 épocas', () => {
  const service = source('src/services/evaluationPersistence.ts')
  assert.match(service, /architectures!inner\(family\)/)
  assert.match(service, /'gan'\]/)
  assert.match(service, /limit\(family === 'gan' \? 420 : 250\)/)
  assert.match(service, /assembleGanHistoryEpochs\(rows\)/)
  assert.match(service, /parseGanStoredEvaluation\(raw\)/)
  const page = source('src/features/evaluation/TrainingHistoryPage.tsx')
  assert.match(page, /value: 'gan', label: 'GAN'/)
  assert.match(page, /GanStoredEvaluationCard/)
  assert.match(page, /GanMetricsChart/)
  assert.match(page, /GanRunComparison/)
})

test('GAN-4D: comparación descriptiva sin equiparar pérdidas a calidad', () => {
  const compare = source('src/features/evaluation/GanRunComparison.tsx')
  assert.match(compare, /ganDimension/)
  assert.match(compare, /dataset[s]?/i)
  assert.match(compare, /Pérdida G/)
  assert.match(compare, /Pérdida D/)
  assert.doesNotMatch(compare, /Gan\s*vs\s*RNN|GAN\s*vs\s*CNN/)
})

test('GAN-4D: exportación CSV y PDF reconoce GAN sin falsos valores test', () => {
  const csv = source('src/features/reports/ProjectReportPage.tsx')
  const pdf = source('src/features/reports/FormalReportDocument.tsx')
  assert.match(csv, /gan_imagenes/)
  assert.match(csv, /gan_diferencia_media/)
  assert.match(csv, /ganReportColumns/)
  assert.match(csv, /formatGanReportSummary/)
  assert.match(pdf, /formatGanReportSummary/)
  assert.match(pdf, /Generativo/)
  assert.match(csv, /totals\.architectures/)
  assert.match(csv, /totals\.runs/)
})

test('GAN-4D: SQL solo lectura y una consulta', () => {
  const sql = source('supabase/tests/FASE_7_GAN4D_VERIFICACION.sql')
  const body = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n').trim()
  assert.match(body, /^SELECT\s/i)
  assert.equal((body.match(/\bSELECT\s/gi) ?? []).length >= 1, true)
  assert.doesNotMatch(body, /\b(insert|update|delete|alter|create|drop|grant|revoke)\b/i)
  assert.match(body, /a\.family = 'gan'/)
  assert.match(body, /entrenamiento_consistente/)
})

test('GAN-4D: documentación se puede ejecutar dos veces sin duplicar', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gan4d-doc-'))
  mkdirSync(join(dir, 'docs/operations'), { recursive: true })
  mkdirSync(join(dir, 'scripts'), { recursive: true })
  writeFileSync(join(dir, 'docs/operations/FASE_7_ARQUITECTURAS.md'), '# Fase 7\n## CNN\n## RNN\n')
  copyFileSync(new URL('../scripts/gan4d-documentation.mjs', import.meta.url), join(dir, 'scripts/gan4d-documentation.mjs'))
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(process.execPath, [join(dir, 'scripts/gan4d-documentation.mjs')], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
  const doc = readFileSync(join(dir, 'docs/operations/FASE_7_ARQUITECTURAS.md'), 'utf8')
  assert.equal(doc.split('<!-- GAN4D_INICIO -->').length - 1, 1)
  assert.match(doc, /## CNN/)
  assert.match(doc, /## RNN/)
})

/** Verifica que la entrega CNN-5 no introduzca migración ni permisos accidentales. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('Diagnóstico CNN-5 usa exclusivamente SELECT y no modifica Supabase', () => {
  const sql = read('supabase/tests/FASE_7_CNN5_AUDITORIA_READONLY.sql')
    .replace(/^--.*$/gm, '') // Se inspecciona el SQL, no sus comentarios explicativos.
  assert.doesNotMatch(sql, /\b(?:insert|update|delete|alter|create|drop|truncate|grant|revoke)\b/i)
  assert.match(sql, /pg_tables/)
  assert.match(sql, /storage\.buckets/)
  assert.match(sql, /pg_proc/)
  assert.match(sql, /training_runs/)
})

test('Prueba en vivo usa JWT de cinco roles y no ejecuta escrituras', () => {
  const source = read('scripts/test-cnn5-live.mjs')
  for (const role of ['admin', 'responsible', 'engineer', 'reviewer', 'reader']) {
    assert.match(source, new RegExp(`role: '${role}'`))
  }
  assert.match(source, /persistSession: false/)
  assert.match(source, /\.storage\.from\('model-artifacts'\)\.download/)
  assert.match(source, /list_project_members/)
  assert.doesNotMatch(source, /\.rpc\('(create_cnn_training_run|record_cnn_training_epoch|record_cnn_test_evaluation|reserve_model_upload|publish_model_version)'/)
  assert.doesNotMatch(source, /\.from\([^)]*\)\.(?:insert|update|delete|upsert)\(/)
  assert.doesNotMatch(source, /\.storage\.from\([^)]*\)\.(?:upload|remove|update|move)\(/)
  assert.doesNotMatch(source.replace(/^ \*.*$/gm, ''), /process\.env\.[A-Z_]*SECRET|service_role/)
})

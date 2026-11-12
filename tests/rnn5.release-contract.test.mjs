/** RNN-5: entrega repetible, auditoría por JWT y SQL exclusivamente de consulta. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('RNN-5: SQL retorna una sola tabla con RLS, RPC, bucket, run y versiones', () => {
  const sql = read('supabase/tests/FASE_7_RNN5_AUDITORIA_READONLY.sql')
  assert.match(sql, /\bwith rls as\s*\(/i)
  assert.match(sql, /join public\.architectures a/)
  assert.match(sql, /a\.family = 'rnn'/)
  assert.match(sql, /model-artifacts/)
  assert.match(sql, /create_rnn_training_run/)
  assert.match(sql, /record_rnn_training_epoch/)
  assert.match(sql, /record_rnn_test_evaluation/)
  assert.match(sql, /completadas_consistentes/)
  assert.match(sql, /versiones_con_hashes_y_rutas/)
  assert.equal((sql.match(/\bselect rls\.tablas as tablas_rls/g) ?? []).length, 1)
  assert.doesNotMatch(sql.replace(/^--.*$/gm, ''), /\b(?:insert|update|delete|truncate|alter|drop|create function|grant|revoke)\s/gi)
})

test('RNN-5: cinco JWT, precondiciones reales, RLS, Storage y hashes dobles', () => {
  const code = read('scripts/test-rnn5-live.mjs')
  for (const role of ['admin', 'responsible', 'engineer', 'reviewer', 'reader']) {
    assert.match(code, new RegExp(`role: '${role}'`))
  }
  assert.match(code, /TEST_RNN5_PROJECT_ID/)
  assert.match(code, /TEST_RNN5_VERSION_ID/)
  assert.match(code, /persistSession: false/)
  assert.match(code, /signInWithPassword/)
  assert.match(code, /list_project_members/)
  assert.match(code, /new Set\(Object\.values\(ids\)\)/)
  assert.match(code, /role === 'admin' \? matches\.length === 0/)
  assert.match(code, /model-artifacts/)
  assert.match(code, /manifest_sha256/)
  assert.match(code, /weights_sha256/)
  assert.match(code, /createHash\('sha256'\)/)
  assert.doesNotMatch(code, /env\.SERVICE_ROLE_KEY|env\.SUPABASE_SERVICE_ROLE_KEY|\.insert\(|\.from\([^)]*\)\.update\(|\.delete\(|\.upload\(|\.remove\(|\.rpc\('(?:create_rnn|record_rnn|finish_training_run)/i)
})

test('RNN-5: documentación se añade sin sustituir las secciones anteriores', () => {
  const code = read('scripts/rnn5-documentation.mjs')
  assert.match(code, /previous\.includes\(heading\)/)
  assert.match(code, /previous\.trimEnd\(\) \+ text/)
  assert.match(code, /FASE_7_ARQUITECTURAS\.md/)
  assert.match(code, /GAN/)
})

/** GAN-5: scripts de solo lectura, cinco JWT reales y documentación idempotente. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('GAN-5: auditoría SQL devuelve una sola tabla e inspecciona las ocho tablas con RLS', () => {
  const sql = read('supabase/tests/FASE_7_GAN5_AUDITORIA_READONLY.sql')
  assert.match(sql, /WITH rls AS/i)
  assert.match(sql, /FROM rls CROSS JOIN rpc CROSS JOIN bucket/i)
  for (const name of ['model_uploads', 'architectures', 'training_runs', 'run_evaluations']) {
    assert.ok(sql.includes(name), `Falta control de ${name}`)
  }
  for (const rpc of ['create_gan_training_run', 'record_gan_training_epoch', 'record_gan_generation_summary']) {
    assert.ok(sql.includes(rpc))
  }
  assert.match(sql, /completadas_consistentes/)
  assert.match(sql, /versiones_con_hashes_y_rutas/)
  assert.match(sql, /resumenes_con_datos_individuales/)
  assert.match(sql, /escrituras_directas_auth/)
  assert.equal((sql.match(/\bSELECT\s+rls\.tablas\s+AS\s+tablas_rls/gi) ?? []).length, 1)
  const uncommented = sql.replace(/^--.*$/gm, '')
  assert.doesNotMatch(uncommented, /\b(?:INSERT INTO|UPDATE\s+public\.|DELETE FROM|TRUNCATE|ALTER TABLE|DROP TABLE|CREATE FUNCTION|GRANT EXECUTE|REVOKE)\b/i)
})

test('GAN-5: cinco usuarios, JWT independientes y admin sin membresía técnica', () => {
  const code = read('scripts/test-gan5-live.mjs')
  for (const role of ['admin', 'responsible', 'engineer', 'reviewer', 'reader']) {
    assert.match(code, new RegExp(`role: '${role}'`))
  }
  assert.match(code, /TEST_GAN5_PROJECT_ID/)
  assert.match(code, /TEST_GAN5_VERSION_ID/)
  assert.match(code, /TEST_F6_ADMIN_EMAIL/)
  assert.match(code, /new Set\(Object\.values\(ids\)\)/)
  assert.match(code, /list_project_members/)
  assert.match(code, /role === 'admin' \? matches\.length === 0/)
  assert.match(code, /persistSession: false/)
  assert.match(code, /\.limit\(450\)/)
  assert.match(code, /signInWithPassword/)
  assert.match(code, /isUuid/)
  // A diferencia del error anterior de RNN-5, se validan los cinco grupos del UUID.
  assert.match(code, /\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}/)
})

test('GAN-5: Storage privado comprueba ambos SHA-256 sin llamadas de escritura', () => {
  const code = read('scripts/test-gan5-live.mjs')
  assert.match(code, /manifest_sha256/)
  assert.match(code, /weights_sha256/)
  assert.match(code, /model\.json/)
  assert.match(code, /weights\.bin/)
  assert.match(code, /storage\.from\('model-artifacts'\)\.download/)
  assert.match(code, /createHash\('sha256'\)/)
  assert.doesNotMatch(code, /env\.SUPABASE_SERVICE_ROLE_KEY|\.insert\(|\.upsert\(|\.upload\(|\.remove\(|\.delete\(|\.from\([^)]*\)\.update\(/)
  assert.doesNotMatch(code, /\.rpc\('(?:create_gan|record_gan|finish_training_run)/)
})

test('GAN-5: documentación se añade una sola vez al Markdown consolidado', () => {
  const script = read('scripts/gan5-documentation.mjs')
  assert.match(script, /previous\.includes\(heading\)/)
  assert.match(script, /previous\.trimEnd\(\) \+ section/)
  assert.match(script, /FASE_7_ARQUITECTURAS\.md/)
  assert.match(script, /GAN-5/)
  assert.match(script, /Fase 6/)
})

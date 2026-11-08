// Contrato estático: las políticas y la RPC están presentes en la migración de F4.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const sql = readFileSync('supabase/migrations/202611080004_test_evaluation.sql', 'utf8')
const code = readFileSync('src/ml/training/trainCore.ts', 'utf8')

test('tabla evaluaciones con RLS, sin permiso directo de escritura', () => {
  assert.match(sql, /create table public\.run_evaluations/)
  assert.match(sql, /alter table public\.run_evaluations enable row level security/)
  assert.match(sql, /revoke all on public\.run_evaluations from public, anon, authenticated/)
  assert.match(sql, /grant select on public\.run_evaluations to authenticated/)
  assert.doesNotMatch(sql, /grant\s+(?:insert|update|delete)\s+on\s+public\.run_evaluations/i)
})

test('RPC exige rol, propietario y run de entrenamiento completo', () => {
  assert.match(sql, /v_run\.created_by is distinct from \(select auth\.uid\(\)\)/)
  assert.match(sql, /private\.can_train_in_project\(v_run\.project_id\)/)
  assert.match(sql, /v_run\.completed_epochs <> v_run\.epochs_planned/)
  assert.match(sql, /grant execute on function public\.record_test_evaluation\(uuid,integer,jsonb\) to authenticated/)
})

test('el test únicamente se evalúa después de fit, sin modificar parámetros', () => {
  assert.ok(code.indexOf('await model.fit(') < code.indexOf('const xTest = tf.tensor2d('))
  assert.ok(code.indexOf("emit({ type: 'evaluation'") < code.indexOf("emit({ type: 'completed'"))
})

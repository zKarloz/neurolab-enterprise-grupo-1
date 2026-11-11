/**
 * CNN-4A: comprobaciones estructurales, SIN conectarse a Supabase ni escribir datos.
 * No sustituye ejecutar SQL en una instancia de prueba con roles reales.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const migration = read('supabase/migrations/202611100012_cnn_multiclass.sql')
const denseMigration = read('supabase/migrations/202611080003_feedforward_persistence.sql')
const modelMigration = read('supabase/migrations/202611080005_private_models.sql')

const rpc = (name) => new RegExp(`create function public\\.${name}\\s*\\(`, 'i')

// Evita el error de introducir restricciones CNN en la antigua RPC Dense.
test('CNN usa RPC específicas y conserva las RPC Feedforward existentes', () => {
  for (const fn of ['create_cnn_training_run', 'record_cnn_training_epoch', 'record_cnn_test_evaluation']) {
    assert.match(migration, rpc(fn))
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}\\s*\\(`, 'i'))
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}\\s*\\(`, 'i'))
  }
  for (const fn of ['create_training_run', 'record_training_epoch', 'record_test_evaluation', 'finish_training_run', 'set_training_runtime']) {
    assert.doesNotMatch(migration, rpc(fn))
    assert.doesNotMatch(migration, new RegExp(`(?:create or replace|drop)\\s+function public\\.${fn}`, 'i'))
  }
  assert.match(denseMigration, rpc('create_training_run'))
  assert.match(modelMigration, rpc('publish_model_version'))
})

test('Migración incremental sin privilegios de escritura ni cambios a Storage', () => {
  assert.match(migration, /begin\s*;/i)
  assert.match(migration, /commit\s*;/i)
  assert.doesNotMatch(migration, /\b(?:drop\s+table|truncate\s+|delete\s+from|update\s+storage\.|create\s+policy)\b/i)
  assert.doesNotMatch(migration, /grant\s+(?:insert|update|delete|all)\s+on\s+(?:public\.|storage\.)/i)
  assert.doesNotMatch(migration, /service_role|supabase_service_role_key/i)
  assert.match(migration, /private\.can_train_in_project\(p_project_id\)/)
  assert.match(migration, /v_run\.created_by is distinct from \(select auth\.uid\(\)\)/)
  assert.match(migration, /'cnn',p_architecture_config/)
})

test('Restricciones preservan los tipos existentes y admiten multiclase', () => {
  assert.match(migration, /family in \('feedforward', 'cnn'\)/)
  assert.equal((migration.match(/problem_type in \('binary', 'regression', 'multiclass'\)/g) ?? []).length, 3)
  assert.match(migration, /byte_size between 1 and 200000000/)
  assert.match(denseMigration, /p_byte_size not between 1 and 10485760/)
  assert.match(migration, /p_byte_size not between 1 and 200000000/)
  assert.match(migration, /p_file_hash.*\^\[0-9a-f\]\{64\}/)
})

test('Metadatos agregados sin ejemplos o imágenes y evaluación coherente', () => {
  assert.match(migration, /p_schema_json - array\[/)
  assert.match(migration, /p_preprocessing_json - array\[/)
  assert.match(migration, /p_metrics - array\[/)
  assert.match(migration, /v_total <> p_sample_count/)
  assert.match(migration, /v_run\.completed_epochs <> v_run\.epochs_planned/)
  assert.match(migration, /v_run\.status <> 'running'/)
  assert.match(migration, /p_epoch <> v_run\.completed_epochs \+ 1/)
  assert.match(migration, /v_parameters > 2000000/)
})

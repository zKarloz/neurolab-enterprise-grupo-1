/** Regresion estatica: evita SQL ambiguo (-> combinado con - sin agrupar). */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/migrations/202611100013_fix_cnn_json_precedence.sql', import.meta.url), 'utf8')

test('Corrige precedencia de JSON y no reejecuta la migracion 012', () => {
  assert.match(sql, /create or replace function public\.create_cnn_training_run\(/i)
  assert.match(sql, /\(p_preprocessing_json->'split'\) - array\['strategy','trainCount','validationCount','testCount'\]::text\[\]/)
  assert.doesNotMatch(sql, /or p_preprocessing_json->'split' - array/)
  assert.doesNotMatch(sql, /\balter table\b|\bdrop table\b|\bdelete from\b/ig)
  assert.equal((sql.match(/create or replace function /gi) ?? []).length, 1)
})

test('Conserva clausula SECURITY DEFINER y autorizaciones de RPC', () => {
  assert.match(sql, /returns uuid language plpgsql security definer set search_path = ''/)
  assert.match(sql, /private\.can_train_in_project\(p_project_id\)/)
  assert.match(sql, /revoke all on function public\.create_cnn_training_run\(/)
  assert.match(sql, /to authenticated;/)
  assert.match(sql, /^(?:--[^\n]*\n)*begin;/mi)
  assert.match(sql, /commit;/)
})

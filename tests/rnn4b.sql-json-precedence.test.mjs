/** Regresión de la migración 015: el ajuste de precedencia no altera la lógica de RNN. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')
const original = read('supabase/migrations/202611100014_rnn_temporal.sql')
const corrective = read('supabase/migrations/202611120015_fix_rnn_json_precedence.sql')
const diagnostic = read('supabase/tests/FASE_7_RNN4B_FIX_JSON_VERIFICACION.sql')

function extractOriginalCreate(sql) {
  const start = sql.indexOf('create function public.create_rnn_training_run(')
  assert.ok(start >= 0, 'La migración 014 debe tener la RPC original')
  const end = sql.indexOf('\n$$;', start)
  assert.ok(end >= 0)
  return sql.slice(start, end + '\n$$;'.length)
}
function extractReplacement(sql) {
  const start = sql.indexOf('create or replace function public.create_rnn_training_run(')
  assert.ok(start >= 0, 'La migración 015 debe reemplazar la RPC')
  const end = sql.indexOf('\n$$;', start)
  assert.ok(end >= 0)
  return sql.slice(start, end + '\n$$;'.length)
}

const hazardous = "or (p_architecture_config->'input' - array['steps','features','classes','problemType']::text[]) <> '{}'::jsonb"
const corrected = "or ((p_architecture_config->'input') - array['steps','features','classes','problemType']::text[]) <> '{}'::jsonb"

test('RNN-4B fix: la extracción JSONB se ejecuta antes de restar claves', () => {
  assert.ok(original.includes(hazardous), 'Se reproduce el problema de 014')
  assert.ok(corrective.includes(corrected), '015 incluye los paréntesis necesarios')
  assert.ok(!corrective.includes(hazardous), '015 no conserva la expresión defectuosa')
})

test('RNN-4B fix: 015 mantiene idéntico contrato y cambia solo la precedencia', () => {
  const expected = extractOriginalCreate(original)
    .replace('create function public.create_rnn_training_run(', 'create or replace function public.create_rnn_training_run(')
    .replace(hazardous, corrected)
  assert.equal(extractReplacement(corrective), expected,
    'No se alteran validaciones, permisos dentro de la función ni columnas')
})

test('RNN-4B fix: script transaccional sin cambios de tablas, privilegios ni datos', () => {
  assert.match(corrective, /\bbegin;\s*\n/)
  assert.match(corrective, /\bcommit;\s*$/)
  assert.match(corrective, /security definer set search_path = ''/)
  assert.doesNotMatch(corrective, /^\s*(?:alter\s+table|drop\s+|grant\s+|revoke\s+|create\s+policy|update\s+|delete\s+|truncate\s+)/im)
  assert.equal((corrective.match(/\bcreate or replace function\b/gi) ?? []).length, 1)
})

test('RNN-4B fix: diagnóstico es de lectura y comprueba RLS y privilegios', () => {
  assert.match(diagnostic, /has_function_privilege\('anon'/)
  assert.match(diagnostic, /has_function_privilege\('authenticated'/)
  assert.match(diagnostic, /rowsecurity/)
  assert.match(diagnostic, /json_parentheses_correct/)
  assert.doesNotMatch(diagnostic, /^\s*(?:update|insert|delete|alter|create|drop|grant|revoke)\b/im)
})

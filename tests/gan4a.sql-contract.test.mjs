/** GAN-4A: pruebas de contrato del DDL, sin suplantar una ejecución en Supabase. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/migrations/202611120016_gan_adversarial.sql',import.meta.url),'utf8')
const verify = readFileSync(new URL('../supabase/tests/FASE_7_GAN4A_VERIFICACION.sql',import.meta.url),'utf8')

test('GAN-4A: tres RPC independientes, SECURITY DEFINER y search_path fijo', () => {
  for(const name of ['create_gan_training_run','record_gan_training_epoch','record_gan_generation_summary']) {
    assert.match(sql,new RegExp(`create function public\\.${name}\\(`,'i'))
    assert.match(sql,new RegExp(`revoke all on function public\\.${name}\\(`,'i'))
    assert.match(sql,new RegExp(`grant execute on function public\\.${name}\\(`,'i'))
  }
  assert.equal((sql.match(/security definer set search_path = ''/gi) ?? []).length,3)
  assert.doesNotMatch(sql,/grant\s+(insert|update|delete|all)\s+on\s+(table|public\.)/i)
})

test('GAN-4A: generative no se confunde con binary o multiclass; hasta 100 épocas', () => {
  assert.match(sql,/check \(family in \('feedforward','cnn','rnn','gan'\)\)/)
  assert.equal((sql.match(/problem_type in \('binary','regression','multiclass','generative'\)/g)??[]).length,3)
  assert.match(sql,/epochs_planned between 1 and 100/)
  assert.match(sql,/epoch between 1 and 100/)
  for(const key of ['generator_loss','discriminator_loss','d_real','d_fake']) assert.ok(sql.includes(key))
})

test('GAN-4A: bloqueo de píxeles, chequeo del ingeniero y orden por época', () => {
  assert.match(sql,/private\.can_train_in_project\(p_project_id\)/)
  assert.match(sql,/v_run\.created_by is distinct from \(select auth\.uid\(\)\)/)
  assert.match(sql,/p_epoch <> v_run\.completed_epochs \+ 1/)
  assert.match(sql,/array\['kind','dimension','pixelCount','imageCount','originalScale','hadLabels','truncated'\]/)
  assert.match(sql,/p_seed is distinct from 0/)
  assert.match(sql,/record_gan_generation_summary[\s\S]+?descriptive_only/)
  assert.match(sql,/from public\.run_evaluations e where e\.run_id = p_run_id/)
})

test('GAN-4A: diagnóstico único de RLS, RPC, 100 épocas y permisos directos', () => {
  assert.match(verify,/cross join rpc cross join checks cross join direct_grants/)
  assert.match(verify,/sin_escritura_directa/)
  assert.match(verify,/funciones_gan/)
  assert.match(verify,/rls_correcto/)
  assert.match(verify,/epocas_100_correctas/)
  assert.match(verify,/cuatro_metricas_gan/)
  assert.equal((verify.match(/\bselect\b/gi)??[]).length>3,true) // CTE + SELECT final, una sola consulta.
  assert.doesNotMatch(verify,/\b(update|insert|delete|alter|drop)\s+(?:table|into|from|public\.)/i)
})

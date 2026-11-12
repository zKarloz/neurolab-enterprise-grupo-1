import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const sql = readFileSync(new URL('../supabase/migrations/202611100014_rnn_temporal.sql',import.meta.url),'utf8')

test('RNN-4A: RPC dedicadas protegidas y família en arquitectura, nunca inferida por problema', () => {
  assert.match(sql,/check \(family in \('feedforward', 'cnn', 'rnn'\)\)/)
  for(const name of ['create_rnn_training_run','record_rnn_training_epoch','record_rnn_test_evaluation']) {
    assert.match(sql,new RegExp(`create function public\\.${name}\\(`))
    assert.match(sql,new RegExp(`grant execute on function public\\.${name}\\(`))
    assert.match(sql,new RegExp(`revoke all on function public\\.${name}\\(`))
  }
  assert.match(sql,/private\.can_train_in_project/)
  assert.match(sql,/a\.family = 'rnn'/)
  assert.match(sql,/for update/)
  assert.match(sql,/p_run_id uuid, p_epoch integer/)
  assert.match(sql,/v_run\.completed_epochs \+ 1/)
  assert.match(sql,/p_sample_count is distinct from.*split/)
  assert.doesNotMatch(sql,/create policy|disable row level security|grant\s+(insert|update|delete)/i)
})

test('RNN-4A: RPC de evaluación excluye filas y matrices de sensores',()=>{
  assert.match(sql,/p_metrics - array\['family','problemType','sampleCount','mse'/)
  assert.match(sql,/p_metrics - array\['family','problemType','sampleCount','accuracy'/)
  assert.doesNotMatch(sql,/insert into public\.training_samples|insert into public\.prediction_examples/)
})

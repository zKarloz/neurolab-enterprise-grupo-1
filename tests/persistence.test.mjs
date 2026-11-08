import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { summarizeCsvSchema } from '../src/ml/preprocessing/fileMetadata.ts'

const migration = readFileSync(new URL('../supabase/migrations/202611080003_feedforward_persistence.sql', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/features/training/DenseTrainingPanel.tsx', import.meta.url), 'utf8')
const service = readFileSync(new URL('../src/services/trainingPersistence.ts', import.meta.url), 'utf8')

test('el esquema registra solo metadatos agregados, no filas ni valores del CSV', () => {
  const raw = { columns: ['edad', 'categoria', 'objetivo'], rows: [
    ['42', 'A_PRIVADO', '1'], ['33', 'B_PRIVADO', '0'], ['', 'A_PRIVADO', '1'],
  ] }
  const schema = summarizeCsvSchema(raw)
  assert.deepEqual(schema, { columns: [
    { name: 'edad', type: 'numeric', missingCount: 1 },
    { name: 'categoria', type: 'categorical', missingCount: 0 },
    { name: 'objetivo', type: 'numeric', missingCount: 0 },
  ] })
  assert.equal(JSON.stringify(schema).includes('A_PRIVADO'), false)
})

test('las cuatro tablas privadas exigen RLS, y solo otorgan SELECT a authenticated', () => {
  for (const name of ['architectures', 'datasets', 'training_runs', 'training_metrics']) {
    assert.match(migration, new RegExp(`alter table public\\.${name} enable row level security;`))
    assert.match(migration, new RegExp(`on public\\.${name} for select to authenticated`))
  }
  assert.match(migration, /grant select on public\.architectures, public\.datasets, public\.training_runs, public\.training_metrics to authenticated/)
  assert.doesNotMatch(migration, /grant\s+(?:insert|update|delete|all)\s+on public\.training_runs\s+to authenticated/i)
})

test('las RPC controlan identidad del creador, membresía de Ingeniero y orden de épocas', () => {
  assert.match(migration, /private\.has_project_role\(p_project_id, array\['engineer'\]/)
  assert.match(migration, /v_run\.created_by is distinct from \(select auth\.uid\(\)\)/)
  assert.match(migration, /p_epoch <> v_run\.completed_epochs \+ 1/)
  assert.match(migration, /v_run\.completed_epochs <> v_run\.epochs_planned/)
  assert.match(migration, /set search_path = ''/)
  assert.match(migration, /revoke all on function public\.create_training_run/)
})

test('persistencia en orden: se actualiza contador solo tras confirmación de Supabase', () => {
  assert.match(panel, /stream\.chain = stream\.chain\.then/)
  assert.match(panel, /await recordEpoch\(stream\.id, event\.metrics\)/)
  assert.match(panel, /setSavedEpochs\(event\.metrics\.epoch\)/)
  assert.match(panel, /queueFinish\(stream, 'completed', event\.summary\)/)
})

test('servicio no envía filas de CSV ni matrices X/Y a RPC', () => {
  assert.match(service, /p_schema_json: csv\.schema/)
  assert.match(service, /p_preprocessing_json: dataset\.manifest/)
  assert.doesNotMatch(service, /p_(?:rows|csv|train_x|train_y):/)
})

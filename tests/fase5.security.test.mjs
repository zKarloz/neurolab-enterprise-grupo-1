import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const sql = readFileSync(new URL('../supabase/migrations/202611080005_private_models.sql', import.meta.url),'utf8').toLowerCase()
const service = readFileSync(new URL('../src/services/modelRegistry.ts',import.meta.url),'utf8')
const types = readFileSync(new URL('../src/ml/training/types.ts',import.meta.url),'utf8')
const worker = readFileSync(new URL('../src/workers/training.worker.ts',import.meta.url),'utf8')

test('RLS habilitado en modelos, reservas y versiones', () => {
  for (const name of ['models','model_uploads','model_versions']) assert.match(sql, new RegExp(`alter table public\\.${name} enable row level security`))
})
test('versiones sin permisos de actualización ni borrado directos', () => {
  assert.match(sql, /revoke all on public\.models, public\.model_uploads, public\.model_versions/)
  assert.match(sql, /grant select on public\.models, public\.model_versions to authenticated/)
  assert.doesNotMatch(sql, /grant (update|delete|all) on public\.model_versions to authenticated/)
})
test('Storage privado solo permite INSERT y SELECT a rutas comprobadas', () => {
  assert.match(sql, /'model-artifacts', 'model-artifacts', false/)
  assert.match(sql, /for insert to authenticated[\s\S]*private\.can_upload_model_object\(name\)/)
  assert.match(sql, /for select to authenticated[\s\S]*private\.can_read_model_object\(name\)/)
  assert.doesNotMatch(sql, /create policy[^;]*on storage\.objects\s+for (update|delete)/)
  assert.match(service, /upsert: false/g)
  assert.doesNotMatch(service, /getPublicUrl|createSignedUrl/)
})
test('Administrador no recibe acceso técnico por privilegio global', () => {
  assert.match(sql,/private\.has_project_role\(v\.project_id/)
  assert.match(sql,/private\.can_train_in_project\(v_run\.project_id\)/)
  assert.doesNotMatch(sql,/private\.is_platform_admin\(\)/)
})
test('se requieren ambos archivos antes de confirmar la versión', () => {
  assert.match(sql, /v_json\.id is null or v_weights\.id is null/)
  assert.match(sql, /insert into public\.model_versions/)
  assert.match(sql, /from public\.run_evaluations/)
})
test('contratos completos entre Worker, navegador y núcleo TensorFlow.js', () => {
  assert.match(types, /type: 'export'; requestId: number/)
  assert.match(types, /type: 'artifacts'; requestId: number/)
  assert.match(types, /exportArtifacts: \(\) => Promise<ModelArtifactBundle>/)
  assert.match(worker, /case 'export'/)
})

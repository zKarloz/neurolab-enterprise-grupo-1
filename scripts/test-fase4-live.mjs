// Prueba F4 con DOS cuentas reales y clave pública. Realiza entrenamiento TF.js CPU, no inventa métricas.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as tf from '@tensorflow/tfjs'
import { createClient } from '@supabase/supabase-js'
import { evaluateBinary } from '../src/ml/evaluation/metrics.ts'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const adminEmail = process.env.TEST_F2_ADMIN_EMAIL
const adminPassword = process.env.TEST_F2_ADMIN_PASSWORD
const engineerEmail = process.env.TEST_F2_READER_EMAIL
const engineerPassword = process.env.TEST_F2_READER_PASSWORD
if (![url, key, adminEmail, adminPassword, engineerEmail, engineerPassword].every(Boolean)) {
  throw new Error('Configura las dos cuentas en .env.test.local, como en Fase 2. Nunca compartas contraseñas.')
}
if (!key.startsWith('sb_publishable_')) throw new Error('La prueba usa solo clave pública.')

async function session(email, password) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}
const admin = await session(adminEmail, adminPassword)
const engineer = await session(engineerEmail, engineerPassword)
let projectId = ''

try {
  const created = await admin.rpc('create_project', { p_name: `Prueba F4 ${Date.now()}`, p_description: 'Prueba temporal de evaluación real/RLS' })
  if (created.error) throw created.error
  projectId = created.data
  const added = await admin.rpc('add_project_member', { p_project_id: projectId, p_email: engineerEmail, p_role: 'reader' })
  if (added.error) throw added.error

  const fixture = 'x,target\n0,0\n1,0\n2,0\n3,0\n4,1\n5,1\n6,1\n7,1\n'
  const args = {
    p_dataset_name: 'fixture-fase4.csv',
    p_schema_json: { columns: [
      { name: 'x', type: 'numeric', missingCount: 0 }, { name: 'target', type: 'numeric', missingCount: 0 },
    ] },
    p_target_column: 'target', p_problem_type: 'binary', p_row_count: 8,
    p_byte_size: Buffer.byteLength(fixture), p_file_hash: createHash('sha256').update(fixture).digest('hex'),
    p_preprocessing_json: { schemaVersion: 1, targetColumn: 'target', problemType: 'binary', seed: 42 },
    p_architecture_config: { family: 'feedforward', inputFeatures: 1, outputUnits: 1, outputActivation: 'sigmoid', hiddenLayers: [{ units: 4, activation: 'relu' }] },
    p_hyperparameters_json: { epochs: 2, batchSize: 4, optimizer: 'adam', learningRate: 0.01, seed: 42 },
    p_seed: 42, p_app_version: '0.1.0',
  }
  const denied = await engineer.rpc('create_training_run', { p_project_id: projectId, ...args })
  assert.ok(denied.error, 'Un lector no puede crear entrenamiento')

  const members = await admin.rpc('list_project_members', { p_project_id: projectId })
  if (members.error) throw members.error
  const member = members.data.find((row) => row.email.toLowerCase() === engineerEmail.toLowerCase())
  assert.ok(member)
  const promoted = await admin.rpc('change_project_member_role', { p_project_id: projectId, p_user_id: member.user_id, p_role: 'engineer' })
  if (promoted.error) throw promoted.error

  const started = await engineer.rpc('create_training_run', { p_project_id: projectId, ...args })
  if (started.error) throw started.error
  const runId = started.data
  const backend = await engineer.rpc('set_training_runtime', { p_run_id: runId, p_backend: 'cpu', p_context: 'main', p_tfjs_version: tf.version.tfjs })
  if (backend.error) throw backend.error
  const direct = await engineer.from('run_evaluations').insert({
    run_id: runId, project_id: projectId, problem_type: 'binary', sample_count: 2, metrics_json: {},
  })
  assert.ok(direct.error, 'Inserción directa debe denegarse incluso a ingeniero')

  await tf.setBackend('cpu')
  await tf.ready()
  const model = tf.sequential()
  model.add(tf.layers.dense({ inputShape: [1], units: 4, activation: 'relu' }))
  model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }))
  model.compile({ optimizer: tf.train.adam(0.01), loss: 'binaryCrossentropy', metrics: ['accuracy'] })
  const xTrain = tf.tensor2d([[0], [1], [4], [5]], [4, 1])
  const yTrain = tf.tensor2d([[0], [0], [1], [1]], [4, 1])
  const xValidation = tf.tensor2d([[2], [6]], [2, 1])
  const yValidation = tf.tensor2d([[0], [1]], [2, 1])
  const xTest = tf.tensor2d([[3], [7]], [2, 1])
  let prediction = null
  const epochs = []
  let evaluation
  try {
    await model.fit(xTrain, yTrain, { epochs: 2, batchSize: 4, verbose: 0, shuffle: false,
      validationData: [xValidation, yValidation],
      callbacks: { onEpochEnd(epoch, logs) {
        epochs.push({ epoch: epoch + 1, loss: Number(logs.loss), validationLoss: Number(logs.val_loss),
          metric: Number(logs.acc ?? logs.accuracy), validationMetric: Number(logs.val_acc ?? logs.val_accuracy) })
      } },
    })
    prediction = model.predict(xTest)
    evaluation = evaluateBinary([0, 1], Array.from(await prediction.data()))
  } finally {
    prediction?.dispose()
    xTrain.dispose(); yTrain.dispose(); xValidation.dispose(); yValidation.dispose(); xTest.dispose(); model.dispose()
  }
  assert.equal(epochs.length, 2)
  for (const epoch of epochs) {
    assert.ok([epoch.loss, epoch.validationLoss, epoch.metric, epoch.validationMetric].every(Number.isFinite))
    const saved = await engineer.rpc('record_training_epoch', {
      p_run_id: runId, p_epoch: epoch.epoch, p_loss: epoch.loss,
      p_validation_loss: epoch.validationLoss, p_metric: epoch.metric, p_validation_metric: epoch.validationMetric,
    })
    if (saved.error) throw saved.error
  }
  const wrongAuthor = await admin.rpc('record_test_evaluation', { p_run_id: runId, p_sample_count: evaluation.samples, p_metrics: evaluation })
  assert.ok(wrongAuthor.error, 'No se puede registrar evaluación de otro ingeniero')
  const savedEvaluation = await engineer.rpc('record_test_evaluation', {
    p_run_id: runId, p_sample_count: evaluation.samples, p_metrics: evaluation,
  })
  if (savedEvaluation.error) throw savedEvaluation.error
  const duplicate = await engineer.rpc('record_test_evaluation', {
    p_run_id: runId, p_sample_count: evaluation.samples, p_metrics: evaluation,
  })
  assert.ok(duplicate.error, 'Una evaluación no puede sobrescribirse')
  const finished = await engineer.rpc('finish_training_run', { p_run_id: runId, p_status: 'completed', p_duration_ms: 0 })
  if (finished.error) throw finished.error
  const stored = await engineer.from('run_evaluations').select('run_id, metrics_json').eq('run_id', runId).single()
  if (stored.error) throw stored.error
  assert.equal(stored.data.run_id, runId)
  assert.equal(stored.data.metrics_json.samples, evaluation.samples)
  const illegalUpdate = await engineer.from('run_evaluations').update({ sample_count: 1 }).eq('run_id', runId)
  assert.ok(illegalUpdate.error, 'No se puede editar evaluación histórica')

  const revoked = await admin.rpc('remove_project_member', { p_project_id: projectId, p_user_id: member.user_id })
  if (revoked.error) throw revoked.error
  const hidden = await engineer.from('run_evaluations').select('run_id').eq('run_id', runId)
  if (hidden.error) throw hidden.error
  assert.equal(hidden.data.length, 0, 'RLS oculta evaluación tras revocación')
  console.log('OK F4: evaluación TF.js real, RPC protegida, unicidad, sin UPDATE y revocación RLS inmediata.')
} finally {
  if (projectId) {
    const archived = await admin.rpc('archive_project', { p_project_id: projectId })
    if (archived.error) console.warn(`Archivar proyecto de prueba manualmente: ${projectId} (${archived.error.message})`)
    else console.log(`Proyecto de prueba archivado: ${projectId}`)
  }
  await admin.auth.signOut({ scope: 'local' })
  await engineer.auth.signOut({ scope: 'local' })
}

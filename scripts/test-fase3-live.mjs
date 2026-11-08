// Ejecutar contra un proyecto Supabase de pruebas y DOS cuentas reales, jamás service_role.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as tf from '@tensorflow/tfjs'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const adminEmail = process.env.TEST_F2_ADMIN_EMAIL
const adminPassword = process.env.TEST_F2_ADMIN_PASSWORD
const engineerEmail = process.env.TEST_F2_READER_EMAIL
const engineerPassword = process.env.TEST_F2_READER_PASSWORD
if (![url, key, adminEmail, adminPassword, engineerEmail, engineerPassword].every(Boolean)) {
  throw new Error('Configura .env.test.local con credenciales de dos cuentas existentes, como en la prueba F2.')
}
if (!key.startsWith('sb_publishable_')) throw new Error('Solo se admite la clave publicable; nunca service_role.')

async function session(email, password) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}
const admin = await session(adminEmail, adminPassword)
const engineer = await session(engineerEmail, engineerPassword)
const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e5)}`
let projectId = ''
// Dataset de prueba controlado: la huella corresponde a los bytes reales del fixture.
const fixture = 'x,target\n0,0\n1,0\n2,0\n3,0\n4,1\n5,1\n6,1\n7,1\n'
const args = {
  p_dataset_name: 'fixture.csv',
  p_schema_json: { columns: [
    { name: 'x', type: 'numeric', missingCount: 0 },
    { name: 'target', type: 'numeric', missingCount: 0 },
  ] },
  p_target_column: 'target', p_problem_type: 'binary', p_row_count: 8,
  p_byte_size: Buffer.byteLength(fixture), p_file_hash: createHash('sha256').update(fixture).digest('hex'),
  p_preprocessing_json: { schemaVersion: 1, targetColumn: 'target', problemType: 'binary', seed: 42 },
  p_architecture_config: { family: 'feedforward', inputFeatures: 1, outputUnits: 1, outputActivation: 'sigmoid', hiddenLayers: [{ units: 4, activation: 'relu' }] },
  p_hyperparameters_json: { epochs: 2, batchSize: 4, optimizer: 'adam', learningRate: 0.01, seed: 42 },
  p_seed: 42, p_app_version: '0.1.0',
}
try {
  const created = await admin.rpc('create_project', {
    p_name: `Prueba F3 ${suffix}`, p_description: 'Proyecto desechable para RLS',
  })
  if (created.error) throw created.error
  projectId = created.data
  const add = await admin.rpc('add_project_member', { p_project_id: projectId, p_email: engineerEmail, p_role: 'reader' })
  if (add.error) throw add.error

  // Ni el administrador global Responsable ni un Lector pueden escribir entrenamiento.
  for (const [name, client] of [['Administrador sin rol Ingeniero', admin], ['Lector', engineer]]) {
    const attempt = await client.rpc('create_training_run', { p_project_id: projectId, ...args })
    assert.ok(attempt.error, `${name} no debe iniciar entrenamientos`)
  }

  const members = await admin.rpc('list_project_members', { p_project_id: projectId })
  if (members.error) throw members.error
  const user = members.data.find((item) => item.email.toLowerCase() === engineerEmail.toLowerCase())
  assert.ok(user)
  const promote = await admin.rpc('change_project_member_role', {
    p_project_id: projectId, p_user_id: user.user_id, p_role: 'engineer',
  })
  if (promote.error) throw promote.error

  const createdRun = await engineer.rpc('create_training_run', { p_project_id: projectId, ...args })
  if (createdRun.error) throw createdRun.error
  const runId = createdRun.data
  assert.ok(runId)

  const directChange = await engineer.from('training_runs').update({ status: 'completed' }).eq('id', runId)
  assert.ok(directChange.error, 'No se admite UPDATE directo en training_runs')
  const backend = await engineer.rpc('set_training_runtime', {
    p_run_id: runId, p_backend: 'cpu', p_context: 'main', p_tfjs_version: tf.version.tfjs,
  })
  if (backend.error) throw backend.error
  const foreignWrite = await admin.rpc('record_training_epoch', {
    p_run_id: runId, p_epoch: 1, p_loss: 0.5, p_validation_loss: 0.6,
    p_metric: 0.8, p_validation_metric: 0.7,
  })
  assert.ok(foreignWrite.error, 'El Administrador sin rol Ingeniero no puede registrar métricas')
  // No insertar números ficticios: entrenar realmente con TensorFlow.js CPU.
  await tf.setBackend('cpu')
  await tf.ready()
  const model = tf.sequential()
  model.add(tf.layers.dense({ inputShape: [1], units: 4, activation: 'relu' }))
  model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }))
  model.compile({ optimizer: tf.train.adam(0.01), loss: 'binaryCrossentropy', metrics: ['accuracy'] })
  const trainX = tf.tensor2d([[0], [1], [2], [4], [5], [6]], [6, 1])
  const trainY = tf.tensor2d([[0], [0], [0], [1], [1], [1]], [6, 1])
  const valX = tf.tensor2d([[3], [7]], [2, 1])
  const valY = tf.tensor2d([[0], [1]], [2, 1])
  const actualEpochs = []
  try {
    await model.fit(trainX, trainY, {
      epochs: 2, batchSize: 2, shuffle: false, verbose: 0,
      validationData: [valX, valY],
      callbacks: { onEpochEnd(index, logs) {
        actualEpochs.push({
          epoch: index + 1,
          loss: Number(logs.loss), validationLoss: Number(logs.val_loss),
          metric: Number(logs.acc ?? logs.accuracy),
          validationMetric: Number(logs.val_acc ?? logs.val_accuracy),
        })
      } },
    })
  } finally {
    trainX.dispose(); trainY.dispose(); valX.dispose(); valY.dispose(); model.dispose()
  }
  assert.equal(actualEpochs.length, 2)
  for (const epoch of actualEpochs) {
    assert.ok([epoch.loss, epoch.validationLoss, epoch.metric, epoch.validationMetric].every(Number.isFinite))
    const metric = await engineer.rpc('record_training_epoch', {
      p_run_id: runId, p_epoch: epoch.epoch, p_loss: epoch.loss,
      p_validation_loss: epoch.validationLoss,
      p_metric: epoch.metric, p_validation_metric: epoch.validationMetric,
    })
    if (metric.error) throw metric.error
  }
  const duplicate = await engineer.rpc('record_training_epoch', {
    p_run_id: runId, p_epoch: 2, p_loss: 0.2, p_validation_loss: 0.2,
    p_metric: 0.9, p_validation_metric: 0.9,
  })
  assert.ok(duplicate.error, 'No se puede reescribir una época')
  const finished = await engineer.rpc('finish_training_run', {
    p_run_id: runId, p_status: 'completed', p_duration_ms: 420,
  })
  if (finished.error) throw finished.error
  const visible = await engineer.from('training_runs').select('status,completed_epochs').eq('id', runId).single()
  if (visible.error) throw visible.error
  assert.equal(visible.data.status, 'completed')
  assert.equal(visible.data.completed_epochs, 2)
  const metrics = await engineer.from('training_metrics').select('epoch,split,metric_name,metric_value').eq('run_id', runId)
  if (metrics.error) throw metrics.error
  assert.equal(metrics.data.length, 8)

  const revoke = await admin.rpc('remove_project_member', { p_project_id: projectId, p_user_id: user.user_id })
  if (revoke.error) throw revoke.error
  const afterRevoke = await engineer.from('training_metrics').select('run_id').eq('run_id', runId)
  if (afterRevoke.error) throw afterRevoke.error
  assert.equal(afterRevoke.data.length, 0, 'La revocación debe ser inmediata')
  console.log('OK: permisos, RPC protegidas, épocas reales registrables y revocación inmediata.')
} finally {
  if (projectId) {
    const archived = await admin.rpc('archive_project', { p_project_id: projectId })
    if (archived.error) console.warn(`ATENCIÓN: archiva manualmente el proyecto de prueba ${projectId}: ${archived.error.message}`)
    else console.log(`Proyecto de prueba archivado: ${projectId}`)
  }
  await admin.auth.signOut({ scope: 'local' })
  await engineer.auth.signOut({ scope: 'local' })
}

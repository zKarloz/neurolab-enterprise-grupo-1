/**
 * NeuroLab RNN-5 — Auditoría en vivo con cinco identidades REALES (SOLO LECTURA).
 * No utiliza service_role, SQL administrativo, RPC de escritura, uploads ni URLs públicas.
 * Reutiliza las cuentas de prueba Fase 6 en un proyecto con una versión RNN publicada.
 * Ejecutar: node --env-file=.env.test.local scripts/test-rnn5-live.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

const env = process.env
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
const projectId = env.TEST_RNN5_PROJECT_ID ?? env.TEST_F6_PROJECT_ID
const versionId = env.TEST_RNN5_VERSION_ID || null
const isUuid = (value) => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const identities = [
  { role: 'admin', email: env.TEST_F6_ADMIN_EMAIL ?? env.TEST_F2_ADMIN_EMAIL,
    password: env.TEST_F6_ADMIN_PASSWORD ?? env.TEST_F2_ADMIN_PASSWORD },
  { role: 'responsible', email: env.TEST_F6_RESPONSIBLE_EMAIL, password: env.TEST_F6_RESPONSIBLE_PASSWORD },
  { role: 'engineer', email: env.TEST_F6_ENGINEER_EMAIL, password: env.TEST_F6_ENGINEER_PASSWORD },
  { role: 'reviewer', email: env.TEST_F6_REVIEWER_EMAIL, password: env.TEST_F6_REVIEWER_PASSWORD },
  { role: 'reader', email: env.TEST_F6_READER_EMAIL ?? env.TEST_F2_READER_EMAIL,
    password: env.TEST_F6_READER_PASSWORD ?? env.TEST_F2_READER_PASSWORD },
]

// No imprimir jamás contraseñas, tokens, claves ni datos personales.
if (!url?.startsWith('https://') || !key?.startsWith('sb_publishable_') || !isUuid(projectId) ||
    (versionId && !isUuid(versionId)) || identities.some((identity) => !identity.email || !identity.password)) {
  console.error('RNN-5: faltan URL HTTPS, clave publicable, UUID de proyecto o credenciales de cinco cuentas en .env.test.local.')
  process.exit(2)
}

const results = []
function check(label, passed) {
  const valid = Boolean(passed)
  results.push({ label, passed: valid })
  console.log(`${valid ? 'OK' : 'ERROR'}: ${label}`)
}
function rowsOrThrow(response, description) {
  if (response.error) throw new Error(`${description}: ${response.error.code ?? 'error de lectura'}`)
  if (!Array.isArray(response.data)) throw new Error(`${description}: respuesta no tabular`)
  return response.data
}
function single(response, description) {
  return rowsOrThrow(response, description)[0] ?? null
}
function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}
function nonNegative(value) { return finiteNumber(value) && value >= 0 }
function validStoredEvaluation(report, run) {
  const metrics = report?.metrics_json
  const expected = run.preprocessing_json?.split?.testCount
  if (report?.problem_type !== run.problem_type ||
      !Number.isSafeInteger(expected) || expected < 1 ||
      report.sample_count !== expected || metrics?.sampleCount !== expected ||
      metrics?.family !== 'rnn' || metrics?.problemType !== run.problem_type) return false
  // Las RPC solo admiten resúmenes. Se vuelven a revisar los datos efectivamente almacenados.
  if (/"(?:examples|rows|seriesId|targets|predictions|samples|windows|xTrain|yTrain)"\s*:/i.test(JSON.stringify(metrics))) return false
  if (run.problem_type === 'regression') {
    return nonNegative(metrics.mse) && nonNegative(metrics.rmse) && nonNegative(metrics.mae) &&
      (metrics.r2 === null || (finiteNumber(metrics.r2) && metrics.r2 <= 1)) &&
      Math.abs(metrics.rmse ** 2 - metrics.mse) <= Math.max(0.001, metrics.mse * 0.001) &&
      Object.keys(metrics).every((k) => ['family', 'problemType', 'sampleCount', 'mse', 'rmse', 'mae', 'r2'].includes(k))
  }
  const names = metrics.classNames
  const n = names?.length
  const matrix = metrics.matrix
  if (!Array.isArray(names) || (run.problem_type === 'binary' ? n !== 2 :
      run.problem_type === 'multiclass' ? n < 3 || n > 10 : true) ||
      !names.every((name) => typeof name === 'string' && name.trim()) ||
      JSON.stringify(names) !== JSON.stringify(run.preprocessing_json?.classNames) ||
      !Array.isArray(matrix) || matrix.length !== n ||
      !matrix.every((row) => Array.isArray(row) && row.length === n &&
        row.every((cell) => Number.isSafeInteger(cell) && cell >= 0))) return false
  const total = matrix.flat().reduce((sum, n) => sum + n, 0)
  const accurate = matrix.reduce((sum, row, i) => sum + row[i], 0) / total
  return total === expected && Math.abs(accurate - metrics.accuracy) <= 1e-6 &&
    [metrics.accuracy, metrics.macroPrecision, metrics.macroRecall, metrics.macroF1]
      .every((value) => finiteNumber(value) && value >= 0 && value <= 1) &&
    Object.keys(metrics).every((k) => ['family', 'problemType', 'sampleCount', 'accuracy',
      'macroPrecision', 'macroRecall', 'macroF1', 'classNames', 'matrix'].includes(k))
}

const clients = {}
const ids = {}
const members = ['responsible', 'engineer', 'reviewer', 'reader']
try {
  // La prueba usa cinco sesiones independientes, no un JWT de administrador para todo.
  for (const identity of identities) {
    const client = createClient(url, key, { auth: {
      persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
    } })
    clients[identity.role] = client
    const login = await client.auth.signInWithPassword({ email: identity.email, password: identity.password })
    if (login.error || !login.data.user) throw new Error(`No se autenticó la identidad de prueba ${identity.role}.`)
    ids[identity.role] = login.data.user.id
    const profile = single(await client.from('app_users')
      .select('id,status,is_platform_admin').eq('id', ids[identity.role]).limit(1), `Perfil ${identity.role}`)
    check(`${identity.role}: perfil activo y alcance global esperado`,
      profile?.status === 'active' && Boolean(profile?.is_platform_admin) === (identity.role === 'admin'))
  }
  check('Cinco identidades distintas', new Set(Object.values(ids)).size === 5)

  const memberRows = rowsOrThrow(await clients.responsible.rpc('list_project_members', {
    p_project_id: projectId,
  }), 'Membresías del proyecto')
  for (const role of members) {
    check(`Rol real de proyecto: ${role}`, memberRows.some((r) => r.user_id === ids[role] && r.role === role))
  }
  check('Admin global sin membresía técnica del proyecto', !memberRows.some((r) => r.user_id === ids.admin))
  if (results.some((r) => !r.passed)) throw new Error('Precondiciones de roles fallidas; se detiene la auditoría de recursos.')

  // Se requiere una versión REAL, publicada y vinculada a una ejecución completada.
  let query = clients.engineer.from('model_versions')
    .select('id,project_id,model_id,run_id,preprocessing_manifest,manifest_path,weights_path,manifest_sha256,weights_sha256,version')
    .eq('project_id', projectId)
  query = versionId ? query.eq('id', versionId) : query.order('created_at', { ascending: false }).limit(150)
  const versions = rowsOrThrow(await query, 'Versiones del proyecto')
  const version = versions.find((v) => v.preprocessing_manifest?.family === 'rnn' &&
    v.preprocessing_manifest?.kind === 'rnn_temporal_csv_v1')
  if (!version) throw new Error('No hay versión RNN publicada y visible. Opcional: TEST_RNN5_VERSION_ID.')

  const run = single(await clients.engineer.from('training_runs')
    .select('id,project_id,architecture_id,dataset_id,created_by,status,problem_type,epochs_planned,completed_epochs,backend,execution_context,tfjs_version,preprocessing_json')
    .eq('id', version.run_id).eq('project_id', projectId).limit(1), 'Ejecución RNN')
  if (!run) throw new Error('La versión RNN no tiene una ejecución de entrenamiento visible.')
  check('Versión RNN vinculada a entrenamiento completado',
    run.status === 'completed' && run.epochs_planned > 0 &&
    run.completed_epochs === run.epochs_planned &&
    ['regression', 'binary', 'multiclass'].includes(run.problem_type))
  const architecture = single(await clients.engineer.from('architectures')
    .select('id,project_id,family').eq('id', run.architecture_id).limit(1), 'Arquitectura RNN')
  check('Familia real comprobada desde architectures', architecture?.family === 'rnn' && architecture.project_id === projectId)
  const manifest = version.preprocessing_manifest
  check('Manifiesto temporal coherente con el run original',
    JSON.stringify(manifest) === JSON.stringify(run.preprocessing_json) &&
    [4, 8, 16, 32].includes(manifest?.steps) && Array.isArray(manifest?.features) &&
    manifest.features.length >= 1 && manifest.features.length <= 16 &&
    manifest.problemType === run.problem_type &&
    Number.isSafeInteger(manifest.split?.testCount) && manifest.split.testCount > 0)
  check('Backend y contexto de ejecución registrados',
    ['cpu', 'webgl', 'wasm'].includes(run.backend) && ['worker', 'main'].includes(run.execution_context) &&
    typeof run.tfjs_version === 'string' && run.tfjs_version.length > 0)
  if (results.some((r) => !r.passed)) throw new Error('Versión/ejecución inválida; se detiene comprobación de permisos.')

  // Se pregunta por el UUID exacto; RLS debe ocultar datos al admin sin membresía.
  const targets = [
    ['training_runs', 'id', run.id], ['architectures', 'id', run.architecture_id],
    ['datasets', 'id', run.dataset_id], ['models', 'id', version.model_id],
    ['model_versions', 'id', version.id], ['run_evaluations', 'run_id', run.id],
    ['training_metrics', 'run_id', run.id],
  ]
  for (const [table, field, value] of targets) {
    for (const role of [...members, 'admin']) {
      const matches = rowsOrThrow(await clients[role].from(table)
        .select(field).eq(field, value).limit(1), `${table}/${role}`)
      check(`${role}: aislamiento RLS de ${table}`, role === 'admin' ? matches.length === 0 : matches.length === 1)
    }
  }

  const metricRows = rowsOrThrow(await clients.engineer.from('training_metrics')
    .select('epoch,split,metric_name,metric_value').eq('run_id', run.id).limit(250), 'Métricas por época')
  const actualMetric = run.problem_type === 'regression' ? 'mae' : 'accuracy'
  const byEpoch = new Map()
  for (const row of metricRows) {
    const list = byEpoch.get(row.epoch) ?? []
    list.push(`${row.split}:${row.metric_name}`)
    byEpoch.set(row.epoch, list)
  }
  const expected = ['train:loss', `train:${actualMetric}`, 'validation:loss', `validation:${actualMetric}`]
  check('Cuatro métricas reales por época; sin períodos faltantes ni duplicados',
    metricRows.length === run.epochs_planned * 4 && byEpoch.size === run.epochs_planned &&
    Array.from({ length: run.epochs_planned }, (_, i) => i + 1).every((epoch) => {
      const list = byEpoch.get(epoch)
      return list?.length === 4 && new Set(list).size === 4 && expected.every((item) => list.includes(item))
    }) && metricRows.every((m) => nonNegative(m.metric_value) &&
      (m.metric_name !== 'accuracy' || m.metric_value <= 1)))

  const evaluations = rowsOrThrow(await clients.engineer.from('run_evaluations')
    .select('problem_type,sample_count,metrics_json').eq('run_id', run.id).limit(3), 'Evaluación de test')
  check('Exactamente una evaluación agregada y test temporal consistente',
    evaluations.length === 1 && validStoredEvaluation(evaluations[0], run))

  // Revisar manifiesto y pesos con el JWT de cada usuario, NO con service_role.
  for (const [path, hashColumn, label] of [
    [version.manifest_path, 'manifest_sha256', 'model.json'],
    [version.weights_path, 'weights_sha256', 'weights.bin'],
  ]) {
    for (const role of [...members, 'admin']) {
      const download = await clients[role].storage.from('model-artifacts').download(path)
      check(`${role}: acceso privado a ${label}`,
        role === 'admin' ? Boolean(download.error) : !download.error && Boolean(download.data))
      if (role === 'engineer' && !download.error && download.data) {
        const buffer = Buffer.from(await download.data.arrayBuffer())
        check(`SHA-256 ${label} coincide con PostgreSQL`,
          /^[a-f0-9]{64}$/.test(version[hashColumn]) &&
          createHash('sha256').update(buffer).digest('hex') === version[hashColumn])
      }
    }
  }
  const passed = results.filter(({ passed }) => passed).length
  console.log(`RNN-5 RLS/Storage: ${passed}/${results.length} comprobaciones correctas.`)
  if (passed !== results.length) process.exitCode = 1
} catch (error) {
  // No exponer mensajes de backend que podrían contener datos sensibles del proyecto.
  console.error('RNN-5: auditoría incompleta:', error instanceof Error ? error.message : 'error desconocido')
  process.exitCode = 1
}

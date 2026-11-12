/**
 * NeuroLab Enterprise · GAN-5 · Auditoría RLS + Storage con cinco JWT reales.
 * Solo lee tablas y descarga artefactos privados; no escribe ni modifica membresías.
 * Ejecutar: node --env-file=.env.test.local scripts/test-gan5-live.mjs
 * Requiere una versión GAN publicada y una ejecución completada con resumen confirmado.
 */
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

const env = process.env
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
const projectId = env.TEST_GAN5_PROJECT_ID ?? env.TEST_F6_PROJECT_ID
const versionId = env.TEST_GAN5_VERSION_ID || null
// UUID completo: cinco grupos 8-4-4-4-12 (evita el fallo anterior de RNN-5).
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

// Nunca imprimir secretos ni el contenido de los archivos privados.
if (!url?.startsWith('https://') || !key?.startsWith('sb_publishable_') || !isUuid(projectId) ||
    (versionId && !isUuid(versionId)) || identities.some((person) => !person.email || !person.password)) {
  console.error('GAN-5: configuración incompleta. Comprueba URL HTTPS, clave publicable, UUID y las cinco cuentas TEST_F6_* en .env.test.local.')
  process.exit(2)
}

const results = []
function check(label, truth) {
  const passed = Boolean(truth)
  results.push({ label, passed })
  console.log(`${passed ? 'OK' : 'ERROR'}: ${label}`)
}
function rowsOrThrow(response, description) {
  if (response.error) throw new Error(`${description}: ${response.error.code ?? 'error de lectura'}`)
  if (!Array.isArray(response.data)) throw new Error(`${description}: respuesta no tabular`)
  return response.data
}
function first(response, description) { return rowsOrThrow(response, description)[0] ?? null }
function finite(value) { return typeof value === 'number' && Number.isFinite(value) }
function within(value, min, max) { return finite(value) && value >= min && value <= max }
function isExactKeys(value, allowed) {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every((key) => allowed.includes(key))
}

/** GAN-4B guarda un resumen descriptivo, nunca un test supervisado ni píxeles. */
function validGanSummary(report, run) {
  const m = report?.metrics_json
  const dim = run.preprocessing_json?.dimension
  const keys = ['family', 'kind', 'sampleCount', 'dimension', 'meanIntensity',
    'meanPairwiseDistance', 'minimumPixel', 'maximumPixel']
  return report?.problem_type === 'generative' && [4, 8, 16].includes(report.sample_count) &&
    isExactKeys(m, keys) && Object.keys(m).length === keys.length &&
    m.family === 'gan' && m.kind === 'descriptive_only' &&
    m.sampleCount === report.sample_count && m.dimension === dim && [8, 28].includes(dim) &&
    within(m.meanIntensity, 0, 255) && within(m.meanPairwiseDistance, 0, 255) &&
    Number.isInteger(m.minimumPixel) && Number.isInteger(m.maximumPixel) &&
    within(m.minimumPixel, 0, 255) && within(m.maximumPixel, 0, 255) &&
    m.minimumPixel <= m.meanIntensity && m.meanIntensity <= m.maximumPixel
}

function validGanEpochs(rows, expectedEpochs) {
  if (rows.length !== expectedEpochs * 4 || expectedEpochs < 1 || expectedEpochs > 100) return false
  const expected = ['generator_loss', 'discriminator_loss', 'd_real', 'd_fake']
  const byEpoch = new Map()
  for (const row of rows) {
    if (!Number.isSafeInteger(row.epoch) || row.epoch < 1 || row.epoch > expectedEpochs ||
        row.split !== 'train' || !expected.includes(row.metric_name) ||
        !within(row.metric_value, 0, ['d_real', 'd_fake'].includes(row.metric_name) ? 1 : 1e12)) return false
    const list = byEpoch.get(row.epoch) ?? []
    list.push(row.metric_name)
    byEpoch.set(row.epoch, list)
  }
  return byEpoch.size === expectedEpochs && Array.from({ length: expectedEpochs }, (_, index) => index + 1)
    .every((epoch) => {
      const names = byEpoch.get(epoch) ?? []
      return names.length === 4 && new Set(names).size === 4 && expected.every((name) => names.includes(name))
    })
}

const clients = {}
const ids = {}
const members = ['responsible', 'engineer', 'reviewer', 'reader']
try {
  // Cada rol tiene una sesión Supabase diferente; no se usa service_role.
  for (const identity of identities) {
    const client = createClient(url, key, { auth: {
      persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
    } })
    clients[identity.role] = client
    const login = await client.auth.signInWithPassword({
      email: identity.email, password: identity.password,
    })
    if (login.error || !login.data.user) throw new Error(`No se autenticó la cuenta de prueba ${identity.role}.`)
    ids[identity.role] = login.data.user.id
    const profile = first(await client.from('app_users')
      .select('id,status,is_platform_admin').eq('id', ids[identity.role]).limit(1), `Perfil ${identity.role}`)
    check(`${identity.role}: perfil activo y alcance global esperado`,
      profile?.status === 'active' && Boolean(profile?.is_platform_admin) === (identity.role === 'admin'))
  }
  check('Cinco identidades distintas', new Set(Object.values(ids)).size === 5)

  const membership = rowsOrThrow(await clients.responsible.rpc('list_project_members', {
    p_project_id: projectId,
  }), 'Membresías del proyecto')
  for (const role of members) {
    check(`Rol real de proyecto: ${role}`,
      membership.some((row) => row.user_id === ids[role] && row.role === role))
  }
  check('Admin global sin membresía técnica del proyecto',
    !membership.some((row) => row.user_id === ids.admin))
  if (results.some((r) => !r.passed)) throw new Error('Precondiciones de roles no superadas.')

  // Buscar versión publicada, no una exportación temporal local.
  let query = clients.engineer.from('model_versions')
    .select('id,project_id,model_id,run_id,preprocessing_manifest,manifest_path,weights_path,manifest_sha256,weights_sha256,version')
    .eq('project_id', projectId)
  query = versionId ? query.eq('id', versionId) : query.order('created_at', { ascending: false }).limit(150)
  const versions = rowsOrThrow(await query, 'Versiones del proyecto')
  const version = versions.find((v) => v.preprocessing_manifest?.family === 'gan' &&
    v.preprocessing_manifest?.kind === 'gan_grayscale_csv_v1')
  if (!version) throw new Error('No hay versión GAN publicada; define TEST_GAN5_VERSION_ID o publica G desde GAN-4C.')

  const run = first(await clients.engineer.from('training_runs')
    .select('id,project_id,architecture_id,dataset_id,created_by,status,problem_type,epochs_planned,completed_epochs,backend,execution_context,tfjs_version,preprocessing_json,dataset_hash')
    .eq('id', version.run_id).eq('project_id', projectId).limit(1), 'Entrenamiento GAN')
  if (!run) throw new Error('No se puede leer la ejecución vinculada a la versión GAN.')
  check('Versión GAN vinculada a entrenamiento completado',
    run.status === 'completed' && run.problem_type === 'generative' &&
    Number.isInteger(run.epochs_planned) && run.epochs_planned >= 1 && run.epochs_planned <= 100 &&
    run.completed_epochs === run.epochs_planned)

  const architecture = first(await clients.engineer.from('architectures')
    .select('id,project_id,family,config_json').eq('id', run.architecture_id).limit(1), 'Arquitectura GAN')
  check('Familia real comprobada desde architectures',
    architecture?.family === 'gan' && architecture.project_id === projectId &&
    architecture.config_json?.kind === 'dense_unconditional_v1')

  const dataset = first(await clients.engineer.from('datasets')
    .select('id,project_id,problem_type,file_hash,row_count,schema_json')
    .eq('id', run.dataset_id).limit(1), 'Dataset GAN')
  check('Dataset GAN solo con metadatos y hash',
    dataset?.project_id === projectId && dataset.problem_type === 'generative' &&
    dataset.file_hash === run.dataset_hash && Number.isInteger(dataset.row_count) &&
    dataset.row_count >= 100 && dataset.row_count <= 2000 &&
    dataset.schema_json?.kind === 'gan_grayscale_csv_v1' &&
    isExactKeys(dataset.schema_json, ['kind', 'dimension', 'pixelCount', 'imageCount',
      'originalScale', 'hadLabels', 'truncated']))

  const manifest = version.preprocessing_manifest
  check('Manifiesto GAN coherente con el run y sin imágenes',
    JSON.stringify(manifest) === JSON.stringify(run.preprocessing_json) &&
    isExactKeys(manifest, ['family', 'kind', 'dimension', 'channels', 'pixelRange',
      'normalization', 'latentSize', 'unconditional', 'trainedImages', 'seedMode']) &&
    [8, 28].includes(manifest?.dimension) && [16, 32, 64].includes(manifest?.latentSize) &&
    manifest.channels === 1 && manifest.pixelRange === 'zero_to_255' &&
    manifest.normalization === 'tanh_minus1_plus1' && manifest.unconditional === true &&
    manifest.trainedImages === dataset?.row_count && manifest.seedMode === 'unseeded')
  check('Backend y contexto de ejecución reales',
    ['cpu', 'webgl', 'wasm'].includes(run.backend) &&
    ['worker', 'main'].includes(run.execution_context) &&
    typeof run.tfjs_version === 'string' && run.tfjs_version.length > 0)
  if (results.some((r) => !r.passed)) throw new Error('Versión GAN inconsistente; se detienen las lecturas por rol.')

  // Consultar el ID exacto en siete recursos. Un Admin global sin membresía NO ve datos técnicos.
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
      check(`${role}: aislamiento RLS de ${table}`,
        role === 'admin' ? matches.length === 0 : matches.length === 1)
    }
  }

  // 100 épocas x 4 métricas = 400 filas. El límite de 450 impide truncar el test.
  const metrics = rowsOrThrow(await clients.engineer.from('training_metrics')
    .select('epoch,split,metric_name,metric_value').eq('run_id', run.id)
    .order('epoch', { ascending: true }).limit(450), 'Métricas GAN')
  check('Cuatro métricas GAN por época; hasta 400 filas completas',
    validGanEpochs(metrics, run.epochs_planned))

  const evaluations = rowsOrThrow(await clients.engineer.from('run_evaluations')
    .select('problem_type,sample_count,metrics_json').eq('run_id', run.id).limit(3), 'Resumen de generación')
  check('Exactamente un resumen descriptivo y ningún píxel guardado',
    evaluations.length === 1 && validGanSummary(evaluations[0], run))

  // Archivos recuperados con JWT de usuario: validar denegación al Admin fuera del proyecto.
  for (const [path, shaColumn, label] of [
    [version.manifest_path, 'manifest_sha256', 'model.json'],
    [version.weights_path, 'weights_sha256', 'weights.bin'],
  ]) {
    for (const role of [...members, 'admin']) {
      const response = await clients[role].storage.from('model-artifacts').download(path)
      check(`${role}: acceso privado a ${label}`,
        role === 'admin' ? Boolean(response.error) : !response.error && Boolean(response.data))
      if (role === 'engineer' && !response.error && response.data) {
        const content = Buffer.from(await response.data.arrayBuffer())
        check(`SHA-256 ${label} coincide con PostgreSQL`,
          typeof version[shaColumn] === 'string' && /^[0-9a-f]{64}$/.test(version[shaColumn]) &&
          createHash('sha256').update(content).digest('hex') === version[shaColumn])
      }
    }
  }

  const passed = results.filter((entry) => entry.passed).length
  console.log(`GAN-5 RLS/Storage: ${passed}/${results.length} comprobaciones correctas.`)
  if (passed !== results.length) process.exitCode = 1
} catch (error) {
  // Solo se devuelven etiquetas de fase y códigos; nunca contraseñas/tokens.
  console.error('GAN-5: auditoría incompleta:', error instanceof Error ? error.message : 'error desconocido')
  process.exitCode = 1
}

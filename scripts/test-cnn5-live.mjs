/**
 * CNN-5 — Auditoría funcional de lectura RLS/Storage con CINCO cuentas reales.
 *
 * SOLO LECTURA: no invoca RPC de escritura, no crea proyectos, no modifica roles,
 * no carga objetos y no usa service_role. El SQL Editor de Supabase NO equivale
 * a estas pruebas porque normalmente ejecuta consultas con privilegios de dueño.
 *
 * Entradas: .env.test.local (ignorado por Git) y TEST_CNN5_PROJECT_ID.
 * Opcionales: TEST_CNN5_VERSION_ID para elegir una versión CNN concreta.
 * Execute: node --env-file=.env.test.local scripts/test-cnn5-live.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

const env = process.env
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
const projectId = env.TEST_CNN5_PROJECT_ID ?? env.TEST_F6_PROJECT_ID
const targetVersionId = env.TEST_CNN5_VERSION_ID || null
const isUuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const identities = [
  { role: 'admin', email: env.TEST_F6_ADMIN_EMAIL ?? env.TEST_F2_ADMIN_EMAIL,
    password: env.TEST_F6_ADMIN_PASSWORD ?? env.TEST_F2_ADMIN_PASSWORD },
  { role: 'responsible', email: env.TEST_F6_RESPONSIBLE_EMAIL, password: env.TEST_F6_RESPONSIBLE_PASSWORD },
  { role: 'engineer', email: env.TEST_F6_ENGINEER_EMAIL, password: env.TEST_F6_ENGINEER_PASSWORD },
  { role: 'reviewer', email: env.TEST_F6_REVIEWER_EMAIL, password: env.TEST_F6_REVIEWER_PASSWORD },
  { role: 'reader', email: env.TEST_F6_READER_EMAIL ?? env.TEST_F2_READER_EMAIL,
    password: env.TEST_F6_READER_PASSWORD ?? env.TEST_F2_READER_PASSWORD },
]

if (!url?.startsWith('https://') || !key?.startsWith('sb_publishable_') || !isUuid(projectId) ||
    (targetVersionId && !isUuid(targetVersionId)) ||
    identities.some((identity) => !identity.email || !identity.password)) {
  console.error('CNN-5: revisa .env.test.local. Se requiere URL HTTPS, clave PUBLICABLE, UUID de proyecto y 5 identidades de prueba.');
  process.exit(2)
}

const results = []
function check(label, passed, details = '') {
  results.push({ label, passed })
  console.log(`${passed ? 'OK' : 'ERROR'}: ${label}${passed || !details ? '' : ` (${details})`}`)
}
function failOnDb(response, description) {
  if (response.error) throw new Error(`${description}: ${response.error.code ?? 'error sin código'}`)
  return response.data
}
function oneRow(response, description) {
  const rows = failOnDb(response, description)
  return rows?.[0] ?? null
}
const clients = {}
const ids = {}
const versionLimit = 150
const roles = ['responsible', 'engineer', 'reviewer', 'reader']

try {
  // Los cinco JWT son distintos; se excluye la validación engañosa con un único rol.
  for (const identity of identities) {
    const client = createClient(url, key, { auth: {
      persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
    } })
    clients[identity.role] = client
    const login = await client.auth.signInWithPassword({ email: identity.email, password: identity.password })
    if (login.error || !login.data.user) throw new Error(`Autenticación fallida para rol ${identity.role}.`)
    ids[identity.role] = login.data.user.id
    const profile = oneRow(await client.from('app_users')
      .select('id,status,is_platform_admin').eq('id', ids[identity.role]).limit(1), `Perfil ${identity.role}`)
    check(`${identity.role}: perfil activo y administrador global esperado`,
      profile?.status === 'active' && Boolean(profile?.is_platform_admin) === (identity.role === 'admin'))
  }
  if (new Set(Object.values(ids)).size !== 5) throw new Error('Las cinco cuentas deben representar cinco usuarios distintos.')

  const memberRows = failOnDb(await clients.responsible.rpc('list_project_members', { p_project_id: projectId }), 'Miembros proyecto')
  const memberships = Array.isArray(memberRows) ? memberRows : []
  for (const role of roles) {
    check(`Rol de proyecto real: ${role}`, memberships.some((m) => m.user_id === ids[role] && m.role === role))
  }
  check('Admin global sin membresía técnica en este proyecto', !memberships.some((m) => m.user_id === ids.admin))
  if (results.some(({ passed }) => !passed)) throw new Error('Precondiciones de identidad/roles incorrectas; no se consultarán artefactos.')

  // Debe existir una versión real CNN publicada. No se generan datos de prueba ficticios.
  const versionRows = failOnDb(await clients.engineer.from('model_versions')
    .select('id,project_id,model_id,run_id,preprocessing_manifest,manifest_path,weights_path,manifest_sha256,weights_sha256,version')
    .eq('project_id', projectId).order('created_at', { ascending: false }).limit(versionLimit), 'Versiones publicadas')
  const version = versionRows.find((item) => item.preprocessing_manifest?.family === 'cnn' &&
    (!targetVersionId || item.id === targetVersionId))
  if (!version) throw new Error(`No se encontró una versión CNN publicada entre las últimas ${versionLimit}. Indica TEST_CNN5_VERSION_ID o usa un proyecto de prueba con CNN publicada.`)
  const run = oneRow(await clients.engineer.from('training_runs')
    .select('id,project_id,architecture_id,dataset_id,created_by,status,problem_type,epochs_planned,completed_epochs')
    .eq('project_id', projectId).eq('id', version.run_id).limit(1), 'Ejecución CNN')
  check('Versión CNN vinculada a ejecución completada', run?.problem_type === 'multiclass' &&
    run?.status === 'completed' && run?.epochs_planned === run?.completed_epochs && run?.completed_epochs > 0)
  if (!run) throw new Error('La versión CNN seleccionada no tiene ejecución visible.')

  // La autorización debe comprobarse incluso si se conoce el UUID exacto del recurso.
  const targets = [
    ['training_runs', 'id', run.id], ['architectures', 'id', run.architecture_id],
    ['datasets', 'id', run.dataset_id], ['models', 'id', version.model_id],
    ['model_versions', 'id', version.id], ['run_evaluations', 'run_id', run.id],
    ['training_metrics', 'run_id', run.id],
  ]
  for (const [table, field, id] of targets) {
    for (const role of [...roles, 'admin']) {
      const rows = failOnDb(await clients[role].from(table)
        .select(field).eq(field, id).limit(1), `${role}/${table}`)
      check(`${role}: lectura RLS de ${table}`, role === 'admin' ? rows.length === 0 : rows.length === 1)
    }
  }

  const epochs = failOnDb(await clients.engineer.from('training_metrics')
    .select('epoch,split,metric_name,metric_value').eq('run_id', run.id).limit(250), 'Métricas CNN')
  const epochGroups = new Map()
  for (const metric of epochs) {
    const group = epochGroups.get(metric.epoch) ?? new Set()
    group.add(`${metric.split}:${metric.metric_name}`)
    epochGroups.set(metric.epoch, group)
  }
  const required = ['train:loss', 'train:accuracy', 'validation:loss', 'validation:accuracy']
  check('Cuatro métricas finitas por época, sin épocas faltantes',
    epochGroups.size === run.epochs_planned && epochs.length === run.epochs_planned * 4 &&
    Array.from({ length: run.epochs_planned }, (_, n) => n + 1).every((n) =>
      required.every((metric) => epochGroups.get(n)?.has(metric))) &&
    epochs.every((row) => Number.isFinite(row.metric_value)))

  const report = oneRow(await clients.engineer.from('run_evaluations')
    .select('problem_type,sample_count,metrics_json').eq('run_id', run.id).limit(1), 'Evaluación CNN')
  const matrix = report?.metrics_json?.matrix
  const classNames = report?.metrics_json?.classNames
  const sum = Array.isArray(matrix) ? matrix.flat().reduce((acc, n) => acc + n, 0) : 0
  const noExamples = !/(?:"pixels"|"examples"|"probabilities"|"images"|"xTrain"|"yTrain")/i.test(JSON.stringify(report?.metrics_json ?? {}))
  check('Evaluación multiclase agregada, consistente y sin píxeles',
    report?.problem_type === 'multiclass' && Array.isArray(classNames) &&
    classNames.length >= 2 && classNames.length <= 10 &&
    Array.isArray(matrix) && matrix.length === classNames.length &&
    matrix.every((row) => Array.isArray(row) && row.length === classNames.length &&
      row.every((number) => Number.isInteger(number) && number >= 0)) &&
    sum === report.sample_count && report.metrics_json.sampleCount === report.sample_count && noExamples)

  // Descarga auténtica de Storage con JWT de cada identidad, SIN crear URLs públicas.
  for (const role of [...roles, 'admin']) {
    const result = await clients[role].storage.from('model-artifacts').download(version.manifest_path)
    const allowed = role !== 'admin'
    check(`${role}: acceso privado a model.json`, allowed ? !result.error && Boolean(result.data) : Boolean(result.error))
    if (role === 'engineer' && !result.error && result.data) {
      const bytes = Buffer.from(await result.data.arrayBuffer())
      check('SHA-256 de model.json coincide con PostgreSQL',
        createHash('sha256').update(bytes).digest('hex') === version.manifest_sha256)
    }
  }

  console.log(`CNN-5 RLS/Storage: ${results.filter((x) => x.passed).length}/${results.length} comprobaciones correctas.`)
  if (results.some(({ passed }) => !passed)) process.exitCode = 1
} catch (error) {
  console.error('CNN-5: prueba incompleta:', error instanceof Error ? error.message : 'error desconocido')
  process.exitCode = 1
} finally {
  // persistSession:false y autoRefreshToken:false: los JWT quedan solo en memoria.
  // No se hace logout remoto ni se modifica ninguna tabla u objeto Storage.
}

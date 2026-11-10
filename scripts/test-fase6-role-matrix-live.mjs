/**
 * NeuroLab Enterprise — Matriz de roles en Supabase REAL.
 *
 * Requiere un proyecto de pruebas ACTIVO con cuatro cuentas distintas (responsible,
 * engineer, reviewer, reader) y un Administrador global activo, idealmente sin
 * membresía en el proyecto. Nunca modifica datos: las llamadas de escritura
 * llevan valores que la migración rechaza antes de realizar operaciones.
 *
 * No imprime identidades, claves ni JWT. Las pruebas sin una muestra suficiente
 * se indican como OMITIDAS y NO cuentan como aprobadas.
 *
 * Ejecutar: node --env-file=.env.test.local scripts/test-fase6-role-matrix-live.mjs
 */
import { createClient } from '@supabase/supabase-js'

const {
  VITE_SUPABASE_URL: url,
  VITE_SUPABASE_PUBLISHABLE_KEY: key,
  TEST_F6_PROJECT_ID: projectId,
} = process.env

const identities = [
  { role: 'admin', email: process.env.TEST_F6_ADMIN_EMAIL ?? process.env.TEST_F2_ADMIN_EMAIL,
    password: process.env.TEST_F6_ADMIN_PASSWORD ?? process.env.TEST_F2_ADMIN_PASSWORD },
  { role: 'responsible', email: process.env.TEST_F6_RESPONSIBLE_EMAIL, password: process.env.TEST_F6_RESPONSIBLE_PASSWORD },
  { role: 'engineer', email: process.env.TEST_F6_ENGINEER_EMAIL, password: process.env.TEST_F6_ENGINEER_PASSWORD },
  { role: 'reviewer', email: process.env.TEST_F6_REVIEWER_EMAIL, password: process.env.TEST_F6_REVIEWER_PASSWORD },
  { role: 'reader', email: process.env.TEST_F6_READER_EMAIL ?? process.env.TEST_F2_READER_EMAIL,
    password: process.env.TEST_F6_READER_PASSWORD ?? process.env.TEST_F2_READER_PASSWORD },
]

if (![url, key, projectId].every(Boolean) || identities.some(({ email, password }) => !email || !password)) {
  console.error('Faltan variables. Consulta INSTRUCCIONES_FASE6_ROLES.md: TEST_F6_PROJECT_ID y cinco cuentas de prueba.')
  process.exit(2)
}
if (!/^https:\/\//.test(url) || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(projectId) || /(?:service_role|sb_secret_)/i.test(key)) {
  console.error('Usa una URL HTTPS, un UUID de proyecto válido y exclusivamente la clave pública de Supabase.')
  process.exit(2)
}

const results = []
function record(role, label, status, reason = '') {
  results.push({ role, label, status, reason })
  console.log(`${status} · ${role} · ${label}${reason ? ` — ${reason}` : ''}`)
}
function verify(role, label, condition, reason) { record(role, label, condition ? 'OK' : 'ERROR', condition ? '' : reason) }
function skipped(role, label, reason) { record(role, label, 'OMITIDA', reason) }
function ensureNoError(response, context) {
  if (response.error) throw new Error(`${context}: ${response.error.code ?? 'sin código'} (HTTP ${response.status ?? 'no indicado'})`)
  return response.data
}
function makeClient() {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}
function pgCode(error) { return error?.code ?? '' }

/**
 * Distingue autorización de validación para pruebas NO DESTRUCTIVAS.
 * 42501 = denegado por rol; 22023 = rol autorizado, entrada inválida.
 * Ambas rutas terminan en excepción ANTES de INSERT/UPDATE en la RPC.
 */
function authProbe(role, label, response, shouldAuthorize) {
  const code = pgCode(response.error)
  const expected = shouldAuthorize ? '22023' : '42501'
  verify(role, label, Boolean(response.error) && code === expected,
    `Se esperaba error PostgreSQL ${expected} (sin escrituras); se recibió ${code || 'sin código'}.`)
}

const clients = Object.fromEntries(identities.map(({ role }) => [role, makeClient()]))
const userIds = {}
let canProceed = true

try {
  // Validar credenciales y rol efectivo en la base, nunca desde JWT editable.
  for (const { role, email, password } of identities) {
    const client = clients[role]
    const auth = await client.auth.signInWithPassword({ email, password })
    if (auth.error || !auth.data.user) {
      record(role, 'Autenticación de prueba', 'ERROR', `Credenciales inválidas o conexión fallida (${auth.error?.code ?? 'sin código'}).`)
      canProceed = false
      continue
    }
    userIds[role] = auth.data.user.id
    const profile = await client.from('app_users').select('id,status,is_platform_admin').eq('id', auth.data.user.id).single()
    if (profile.error) { record(role, 'Perfil', 'ERROR', `Consulta fallida (${profile.error.code}).`); canProceed = false; continue }
    verify(role, 'Cuenta activa y alcance global correcto', profile.data?.status === 'active' &&
      Boolean(profile.data?.is_platform_admin) === (role === 'admin'), 'El perfil no corresponde al rol esperado.')
  }
  const validUsers = Object.values(userIds)
  if (validUsers.length !== identities.length || new Set(validUsers).size !== identities.length) {
    record('general', 'Cinco identidades distintas', 'ERROR', 'Las cuentas no son distintas o falló el inicio de sesión.')
    canProceed = false
  } else record('general', 'Cinco identidades distintas', 'OK')

  if (canProceed) {
    const metadata = ensureNoError(await clients.admin.from('projects')
      .select('id,status,owner_id').eq('id', projectId).maybeSingle(), 'Proyecto de prueba')
    verify('general', 'Proyecto de prueba activo', Boolean(metadata && metadata.status === 'active'),
      'Se necesita un proyecto activo y visible al Administrador.')
    if (!metadata || metadata.status !== 'active') canProceed = false
  }

  if (canProceed) {
    for (const role of ['responsible', 'engineer', 'reviewer', 'reader']) {
      const membership = ensureNoError(await clients[role].from('project_members')
        .select('role').eq('project_id', projectId).eq('user_id', userIds[role]).maybeSingle(), `Membresía ${role}`)
      verify(role, 'Membresía con rol esperado', membership?.role === role, 'La cuenta no tiene ese rol en el proyecto de prueba.')
      if (membership?.role !== role) canProceed = false
    }
  }

  if (canProceed) {
    const adminMember = ensureNoError(await clients.admin.from('project_members')
      .select('role').eq('project_id', projectId).eq('user_id', userIds.admin).maybeSingle(), 'Membresía Admin')
    const isolatedAdmin = !adminMember
    if (!isolatedAdmin) skipped('admin', 'Aislamiento sin membresía',
      'Admin forma parte del proyecto de prueba; utiliza otro proyecto en el que no sea integrante.')

    // Lectura administrativa: Admin ve metadatos, todos los miembros ven su proyecto.
    for (const { role } of identities) {
      const client = clients[role]
      const item = ensureNoError(await client.from('projects').select('id')
        .eq('id', projectId).maybeSingle(), `${role}/proyecto`)
      verify(role, 'Leer metadatos del proyecto', item?.id === projectId, 'No devolvió el proyecto autorizado.')
      const members = ensureNoError(await client.rpc('list_project_members', { p_project_id: projectId }), `${role}/integrantes`)
      verify(role, 'Consultar integrantes', Array.isArray(members) && members.length >= 4,
        'No se pudieron listar los cuatro integrantes de prueba.')
    }

    // La muestra debe existir: una tabla vacía no demuestra una política RLS correcta.
    const sampleRuns = ensureNoError(await clients.engineer.from('training_runs').select('id')
      .eq('project_id', projectId).limit(1), 'Ejemplo de ejecución')
    const sampleVersions = ensureNoError(await clients.engineer.from('model_versions')
      .select('id,manifest_path,created_by').eq('project_id', projectId).limit(1), 'Ejemplo de modelo')
    const technicalTables = ['architectures', 'datasets', 'training_runs', 'model_versions', 'model_review_events']
    for (const table of technicalTables) {
      const baseline = ensureNoError(await clients.engineer.from(table).select('id')
        .eq('project_id', projectId).limit(1), `Muestra ${table}`)
      if (baseline.length === 0) {
        skipped('general', `Lectura RLS de ${table}`, 'No existen registros de muestra; no se afirma acceso válido.')
        continue
      }
      for (const role of ['responsible', 'engineer', 'reviewer', 'reader']) {
        const data = ensureNoError(await clients[role].from(table).select('id')
          .eq('project_id', projectId).eq('id', baseline[0].id).limit(1), `${role}/${table}`)
        verify(role, `Leer ${table} del proyecto`, data?.length === 1, 'No pudo leer un registro visible al Ingeniero.')
      }
      if (isolatedAdmin) {
        const data = ensureNoError(await clients.admin.from(table).select('id')
          .eq('project_id', projectId).eq('id', baseline[0].id).limit(1), `admin/${table}`)
        verify('admin', `Sin lectura técnica de ${table}`, data.length === 0, 'Admin sin membresía pudo leer datos privados.')
      }
    }
    if (isolatedAdmin && !sampleRuns.length && !sampleVersions.length) skipped('admin', 'Aislamiento técnico',
      'Se necesita una ejecución o versión publicada en el proyecto de prueba.')

    // Las RPC validan permisos ANTES de validar el payload. No pueden escribir con estos datos.
    for (const { role } of identities) {
      const client = clients[role]
      const manager = role === 'admin' || role === 'responsible'
      const create = await client.rpc('create_project', { p_name: '', p_description: '' })
      authProbe(role, 'RPC crear proyecto (sin cambios)', create, manager)
      const edit = await client.rpc('update_project', {
        p_project_id: projectId, p_name: '', p_description: '',
      })
      authProbe(role, 'RPC editar proyecto (sin cambios)', edit, manager)
      const add = await client.rpc('add_project_member', {
        p_project_id: projectId, p_email: '', p_role: '__ROL_INVALIDO__',
      })
      authProbe(role, 'RPC asignar roles (sin cambios)', add, manager)
      const training = await client.rpc('create_training_run', {
        p_project_id: projectId, p_dataset_name: 'solo-prueba-autorizacion',
        p_schema_json: {}, p_target_column: 'objetivo', p_problem_type: 'binary',
        p_row_count: 0, p_byte_size: 0, p_file_hash: '0'.repeat(64),
        p_preprocessing_json: {}, p_architecture_config: {}, p_hyperparameters_json: {},
        p_seed: 42, p_app_version: 'f6-roles-test',
      })
      authProbe(role, 'RPC iniciar entrenamiento (sin cambios)', training, role === 'engineer' || (role === 'admin' && adminMember?.role === 'engineer'))
    }

    // Edge Function: el resto de los roles NO pueden listar cuentas globales.
    for (const { role } of identities) {
      const response = await clients[role].functions.invoke('admin-users', { body: { action: 'list', page: 1 } })
      if (role === 'admin') verify(role, 'Listar cuentas de la plataforma', !response.error && Array.isArray(response.data?.users),
        `Error de Edge Function (HTTP ${response.error?.context?.status ?? 'desconocido'}).`)
      else verify(role, 'No administrar cuentas globales', Boolean(response.error) &&
        [401, 403].includes(Number(response.error.context?.status)),
        `Se esperaba denegación HTTP 401/403; se recibió ${response.error?.context?.status ?? 'ningún error'}.`)
    }

    // Auditoría: comprobar contra un evento presente para evitar falsos positivos.
    const sampleTechnicalAudit = ensureNoError(await clients.responsible.from('audit_events')
      .select('id,action').eq('project_id', projectId).in('action',
        ['training_started', 'training_completed', 'training_evaluated', 'model_published']).limit(1), 'Muestra auditoría técnica')
    if (!sampleTechnicalAudit.length) skipped('general', 'Aislamiento de auditoría técnica', 'No hay eventos técnicos verificables.')
    else {
      for (const role of ['engineer', 'reviewer', 'reader', ...(isolatedAdmin ? ['admin'] : [])]) {
        const item = ensureNoError(await clients[role].from('audit_events').select('id')
          .eq('id', sampleTechnicalAudit[0].id).limit(1), `Auditoría ${role}`)
        verify(role, 'Sin acceso a auditoría técnica', item.length === 0, 'Se expuso un evento técnico.')
      }
      record('responsible', 'Puede leer auditoría técnica de su proyecto', 'OK')
    }
    const globalEvents = ensureNoError(await clients.admin.from('audit_events').select('id').is('project_id', null).limit(1), 'Muestra auditoría global')
    if (!globalEvents.length) skipped('general', 'Auditoría global', 'No hay eventos globales de muestra.')
    else for (const { role } of identities) {
      const seen = ensureNoError(await clients[role].from('audit_events').select('id').eq('id', globalEvents[0].id).limit(1), `${role}/auditoría global`)
      verify(role, role === 'admin' ? 'Leer auditoría global' : 'No leer auditoría global',
        role === 'admin' ? seen.length === 1 : seen.length === 0, 'Visibilidad inesperada.')
    }

    // Al menos una versión terminal (rechazada o retirada), creada por otra cuenta,
    // permitiría comprobar permisos de revisión sin producir un evento nuevo.
    const reviews = ensureNoError(await clients.reviewer.from('model_review_events')
      .select('model_version_id,resulting_status').eq('project_id', projectId)
      .in('resulting_status', ['rejected','retired']).order('id', { ascending: false }).limit(25), 'Muestra de revisión final')
    let terminalVersionId = null
    for (const event of reviews) {
      const model = ensureNoError(await clients.reviewer.from('model_versions')
        .select('id,created_by,model_id,run_id').eq('id', event.model_version_id).maybeSingle(), 'Versión para prueba')
      if (!model || model.created_by === userIds.reviewer) continue
      const run = ensureNoError(await clients.reviewer.from('training_runs')
        .select('created_by').eq('id', model.run_id).maybeSingle(), 'Autor de entrenamiento')
      const logical = ensureNoError(await clients.reviewer.from('models')
        .select('created_by').eq('id', model.model_id).maybeSingle(), 'Autor de modelo')
      if (run?.created_by !== userIds.reviewer && logical?.created_by !== userIds.reviewer) {
        terminalVersionId = model.id
        break
      }
    }
    if (!terminalVersionId) skipped('general', 'RPC aprobar/rechazar por rol',
      'No existe versión terminal ajena al Revisor; no se ejecutan decisiones que puedan cambiar el estado.')
    else for (const { role } of identities) {
      if (role === 'admin' && adminMember?.role === 'reviewer') {
        skipped(role, 'RPC revisión de versión terminal (sin cambios)',
          'Admin también es Revisor: se necesita verificar además que no sea autor, entrenador o publicador de esa versión.')
        continue
      }
      const response = await clients[role].rpc('decide_model_review', {
        p_version_id: terminalVersionId, p_decision: 'reviewed', p_note: '',
      })
      authProbe(role, 'RPC revisión de versión terminal (sin cambios)', response, role === 'reviewer')
    }

    // Descargar una ruta pública solo como comprobación negativa, sin almacenar pesos.
    if (sampleVersions.length) {
      const anon = makeClient()
      const download = await anon.storage.from('model-artifacts').download(sampleVersions[0].manifest_path)
      verify('anónimo', 'Sin descarga de artefacto privado', Boolean(download.error) && !download.data,
        'La ruta de un artefacto privado pudo descargarse sin iniciar sesión.')
    } else skipped('anónimo', 'Sin descarga de artefacto privado', 'No existe una versión publicada de muestra.')

    // No se ejecutan acciones positivas de escritura: entrenamiento real, altas, aprobaciones
    // o exportaciones permitidas requerirían mutar datos. Se validan manualmente en un fixture.
    skipped('general', 'Operaciones positivas con escritura',
      'No se crean ni modifican datos reales. Validar flujos positivos en el proyecto de pruebas y su auditoría.')
  }
} catch (error) {
  record('general', 'Ejecución de matriz', 'ERROR',
    error instanceof Error ? error.message.slice(0, 180) : 'Error desconocido')
}

const totals = {
  ok: results.filter((result) => result.status === 'OK').length,
  omitted: results.filter((result) => result.status === 'OMITIDA').length,
  errors: results.filter((result) => result.status === 'ERROR').length,
}
console.log(`\nMatriz F6 · ${totals.ok} correctas · ${totals.omitted} omitidas · ${totals.errors} errores.`)
if (totals.errors) process.exitCode = 1

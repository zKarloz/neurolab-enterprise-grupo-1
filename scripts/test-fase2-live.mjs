/**
 * Prueba real de aislamiento y permisos de Fase 2.
 * Usa dos cuentas normales de Auth y la clave pública; NUNCA service_role.
 * Deja un proyecto de prueba ARCHIVADO (no elimina físicamente datos).
 * Ejecutar solo con permiso de utilizar el proyecto Supabase indicado.
 */
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const adminEmail = process.env.TEST_F2_ADMIN_EMAIL
const adminPassword = process.env.TEST_F2_ADMIN_PASSWORD
const readerEmail = process.env.TEST_F2_READER_EMAIL
const readerPassword = process.env.TEST_F2_READER_PASSWORD

if (![url, key, adminEmail, adminPassword, readerEmail, readerPassword].every(Boolean)) {
  throw new Error('Completa las seis variables de .env.test.local antes de ejecutar la prueba.')
}

function newClient() {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

const admin = newClient()
const reader = newClient()
const adminLogin = await admin.auth.signInWithPassword({ email: adminEmail, password: adminPassword })
const readerLogin = await reader.auth.signInWithPassword({ email: readerEmail, password: readerPassword })
assert.ifError(adminLogin.error)
assert.ifError(readerLogin.error)
assert.notEqual(adminLogin.data.user?.id, readerLogin.data.user?.id)

// La cuenta de prueba debe ser un usuario normal sin privilegio global.
const profileResult = await reader.from('app_users').select('is_platform_admin').single()
assert.ifError(profileResult.error)
assert.equal(profileResult.data?.is_platform_admin, false)

const name = `F2 Prueba de RLS ${new Date().toISOString()}`
let projectId
try {
  const created = await admin.rpc('create_project', { p_name: name, p_description: 'Prueba automatizada; no contiene datos sensibles.' })
  assert.ifError(created.error)
  projectId = created.data
  assert.match(projectId, /^[0-9a-f-]{36}$/i)

  // El no integrante no puede observar el proyecto.
  let response = await reader.from('projects').select('id').eq('id', projectId)
  assert.ifError(response.error)
  assert.equal(response.data?.length, 0, 'Un usuario sin membresía leyó un proyecto ajeno')

  // Tampoco puede modificar la tabla directamente aunque esté autenticado.
  response = await reader.from('projects').update({ name: 'Ataque' }).eq('id', projectId).select('id')
  assert.ok(response.error || response.data?.length === 0, 'Un usuario escribió directamente en projects')

  const denied = await reader.rpc('add_project_member', { p_project_id: projectId, p_email: readerEmail, p_role: 'responsible' })
  assert.ok(denied.error, 'Un no integrante se concedió membresía')

  // Ni siquiera el administrador puede agregarse a sí mismo utilizando el RPC.
  const self = await admin.rpc('add_project_member', { p_project_id: projectId, p_email: adminEmail, p_role: 'engineer' })
  assert.ok(self.error, 'Se permitió la modificación de membresía propia')

  const member = await admin.rpc('add_project_member', { p_project_id: projectId, p_email: readerEmail, p_role: 'reader' })
  assert.ifError(member.error)
  response = await reader.from('projects').select('id').eq('id', projectId)
  assert.ifError(response.error)
  assert.equal(response.data?.length, 1, 'El lector miembro no pudo consultar su proyecto')

  const changeDenied = await reader.rpc('change_project_member_role', {
    p_project_id: projectId, p_user_id: readerLogin.data.user.id, p_role: 'responsible',
  })
  assert.ok(changeDenied.error, 'Lector consiguió cambiar su propio rol')

  const readerCreateDenied = await reader.rpc('create_project', { p_name: 'No permitido', p_description: '' })
  if (!readerCreateDenied.error) {
    throw new Error('La cuenta lectora pudo crear proyectos. Utiliza una cuenta de prueba sin roles Responsable previos.')
  }

  const list = await admin.rpc('list_project_members', { p_project_id: projectId })
  assert.ifError(list.error)
  assert.equal(list.data?.length, 2)

  const remove = await admin.rpc('remove_project_member', { p_project_id: projectId, p_user_id: readerLogin.data.user.id })
  assert.ifError(remove.error)
  response = await reader.from('projects').select('id').eq('id', projectId)
  assert.ifError(response.error)
  assert.equal(response.data?.length, 0, 'El usuario conservó acceso tras revocar membresía')
  console.log('OK: aislamiento, permisos de lectura, RPC de membresías y revocación inmediatos.')
} finally {
  if (projectId) {
    // Los proyectos se archivan por política; la auditoría y trazabilidad permanecen.
    const archive = await admin.rpc('archive_project', { p_project_id: projectId })
    if (archive.error) console.error('ATENCIÓN: archiva manualmente el proyecto de prueba.', projectId)
    else console.log('Proyecto de prueba archivado.', projectId)
  }
  await admin.auth.signOut()
  await reader.auth.signOut()
}

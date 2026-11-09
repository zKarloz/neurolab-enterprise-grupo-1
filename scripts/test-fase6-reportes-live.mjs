/**
 * Prueba de autorización REAL, solo lecturas y RPC denegadas.
 * No registra exportaciones exitosas ni modifica usuarios/proyectos.
 * Requiere .env.test.local con credenciales Admin/Lector existentes.
 */
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key,
  TEST_F2_ADMIN_EMAIL: adminEmail, TEST_F2_ADMIN_PASSWORD: adminPassword,
  TEST_F2_READER_EMAIL: readerEmail, TEST_F2_READER_PASSWORD: readerPassword } = process.env
if (![url,key,adminEmail,adminPassword,readerEmail,readerPassword].every(Boolean)) {
  throw new Error('Faltan variables en .env.test.local (no publicar secretos).')
}
async function login(email, password) {
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await db.auth.signInWithPassword({ email, password })
  assert.ifError(error)
  return db
}
const admin = await login(adminEmail, adminPassword)
const reader = await login(readerEmail, readerPassword)
try {
  const visible = await admin.from('audit_events').select('id,action').in('action', [
    'admin_user_created','admin_user_activated','admin_user_deactivated','admin_password_reset',
  ]).limit(3)
  assert.ifError(visible.error)
  const denied = await reader.from('audit_events').select('id,action').is('project_id', null).limit(3)
  assert.ifError(denied.error)
  assert.equal(denied.data?.length, 0, 'Lector accedió a auditoría global.')
  const readerExport = await reader.rpc('record_report_export', { p_project_id: null, p_kind: 'audit_csv' })
  assert.ok(readerExport.error, 'Lector obtuvo permiso de exportación global.')
  const adminTechnical = await admin.rpc('record_report_export', { p_project_id: null, p_kind: 'report_csv' })
  assert.ok(adminTechnical.error, 'Admin pudo exportar reporte técnico sin proyecto.')
  console.log('OK F6 M09/M10: auditoría global protegida y exportaciones indebidas rechazadas.')
} finally {
  await admin.auth.signOut({ scope: 'local' })
  await reader.auth.signOut({ scope: 'local' })
}

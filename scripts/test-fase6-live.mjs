// Comprobación de permisos reales sin crear usuarios ni cambiar contraseñas.
// Usa las credenciales de DOS cuentas de prueba existentes en .env.test.local.
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const {VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:key,
  TEST_F2_ADMIN_EMAIL:adminEmail,TEST_F2_ADMIN_PASSWORD:adminPassword,
  TEST_F2_READER_EMAIL:readerEmail,TEST_F2_READER_PASSWORD:readerPassword} = process.env
if (![url,key,adminEmail,adminPassword,readerEmail,readerPassword].every(Boolean)) {
  throw new Error('Faltan variables en .env.test.local. No incluyas secretos en Git.')
}

async function signIn(email,password) {
  const client = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  const {error} = await client.auth.signInWithPassword({email,password})
  if (error) throw new Error('No fue posible autenticar una cuenta de prueba.')
  return client
}
async function invoke(client,body) {
  const {data,error} = await client.functions.invoke('admin-users',{body})
  return {data,error}
}

const admin = await signIn(adminEmail,adminPassword)
const reader = await signIn(readerEmail,readerPassword)
try {
  const allowed = await invoke(admin,{action:'list',page:1})
  assert.equal(allowed.error,null, 'Admin activo debe listar cuentas (Edge Function desplegada).')
  assert.ok(Array.isArray(allowed.data?.users))
  const denied = await invoke(reader,{action:'list',page:1})
  assert.ok(denied.error,'Lector no debe listar usuarios globales')
  const {data: adminIdentity} = await admin.auth.getUser()
  const selfStatus = await invoke(admin,{action:'set_status',user_id:adminIdentity.user.id,status:'inactive'})
  assert.ok(selfStatus.error,'Admin no puede desactivarse a sí mismo')
  const selfReset = await invoke(admin,{action:'reset_password',user_id:adminIdentity.user.id})
  assert.ok(selfReset.error,'Admin no puede restablecerse a sí mismo desde UI')
  console.log('OK F6: listado admin, bloqueo lector, autodesactivación y auto-reset denegados.')
} finally {
  await admin.auth.signOut({scope:'local'})
  await reader.auth.signOut({scope:'local'})
}

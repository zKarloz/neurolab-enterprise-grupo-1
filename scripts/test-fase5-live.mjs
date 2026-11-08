// Pruebas reales F5 con dos cuentas existentes, solo clave pública; no publican artefactos falsos.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const adminEmail = process.env.TEST_F2_ADMIN_EMAIL
const adminPassword = process.env.TEST_F2_ADMIN_PASSWORD
const readerEmail = process.env.TEST_F2_READER_EMAIL
const readerPassword = process.env.TEST_F2_READER_PASSWORD
if (![url,key,adminEmail,adminPassword,readerEmail,readerPassword].every(Boolean) || !key.startsWith('sb_publishable_')) {
  throw new Error('Se requieren dos cuentas de prueba y clave pública en .env.test.local.')
}
async function login(email,password) {
  const client = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  const {error} = await client.auth.signInWithPassword({email,password})
  if (error) throw error
  return client
}
const admin = await login(adminEmail,adminPassword)
const reader = await login(readerEmail,readerPassword)
let projectId
try {
  const created = await admin.rpc('create_project',{p_name:`F5 permisos ${Date.now()}`,p_description:'Prueba temporal, sin archivos de modelo'})
  if (created.error) throw created.error
  projectId = created.data
  const added = await admin.rpc('add_project_member',{p_project_id:projectId,p_email:readerEmail,p_role:'reader'})
  if (added.error) throw added.error
  const models = await reader.from('models').select('id').eq('project_id',projectId)
  if (models.error) throw models.error
  assert.equal(models.data.length,0)

  for (const [actor,client] of [['lector',reader],['administrador global sin rol Ingeniero',admin]]) {
    const reserved = await client.rpc('reserve_model_upload',{p_run_id:randomUUID(),p_name:'No autorizado'})
    assert.ok(reserved.error, `${actor} no debe poder reservar una versión sin ejecución propia`)
    const direct = await client.from('models').insert({project_id:projectId,name:'Directo',created_by:randomUUID()})
    assert.ok(direct.error,`${actor} no puede saltar el protocolo de reserva mediante INSERT`)
    const altered = await client.from('model_versions').update({ version: 2 }).eq('id',randomUUID())
    assert.ok(altered.error,`${actor} no puede modificar modelos inmutables`)
  }
  const objectPath = `${projectId}/${randomUUID()}/${randomUUID()}/model.json`
  const unauthorizedUpload = await reader.storage.from('model-artifacts').upload(objectPath,
    new Blob(['{}'],{type:'application/json'}),{contentType:'application/json',upsert:false})
  assert.ok(unauthorizedUpload.error,'Un Lector no puede subir artefactos directamente a Storage')

  const memberList = await admin.rpc('list_project_members',{p_project_id:projectId})
  if (memberList.error) throw memberList.error
  const member = memberList.data.find((m)=>m.email.toLowerCase()===readerEmail.toLowerCase())
  assert.ok(member)
  const revoked = await admin.rpc('remove_project_member',{p_project_id:projectId,p_user_id:member.user_id})
  if (revoked.error) throw revoked.error
  const hidden = await reader.from('models').select('id').eq('project_id',projectId)
  if (hidden.error) throw hidden.error
  assert.equal(hidden.data.length,0)
  console.log('OK F5: roles, sin escritura directa, bucket privado, no sobrescritura y revocación inmediata.')
} finally {
  if (projectId) {
    const archived = await admin.rpc('archive_project',{p_project_id:projectId})
    if (archived.error) console.warn('Archivar proyecto temporal:',projectId,archived.error.message)
  }
  await admin.auth.signOut({scope:'local'})
  await reader.auth.signOut({scope:'local'})
}

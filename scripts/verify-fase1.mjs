/**
 * Verificación de integración real de la Fase 1 contra Supabase.
 *
 * Solo usa la clave publicable y el login de usuarios de prueba. No crea ni modifica
 * datos en producción. Las credenciales se reciben por variables del proceso y
 * nunca se imprimen. Requiere Node 22+ y npm install previo.
 *
 * Uso en Git Bash:
 *   node --env-file=.env.local scripts/verify-fase1.mjs
 * Variables temporales necesarias: TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD.
 * Opcionales: TEST_OTHER_EMAIL, TEST_OTHER_PASSWORD (aislamiento entre cuentas).
 */
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const {
  VITE_SUPABASE_URL: url,
  VITE_SUPABASE_PUBLISHABLE_KEY: key,
  TEST_ADMIN_EMAIL: adminEmail,
  TEST_ADMIN_PASSWORD: adminPassword,
  TEST_OTHER_EMAIL: otherEmail,
  TEST_OTHER_PASSWORD: otherPassword,
} = process.env

function requireConfig() {
  assert.ok(url, 'Falta VITE_SUPABASE_URL')
  const endpoint = new URL(url)
  assert.equal(endpoint.protocol, 'https:', 'Supabase URL debe utilizar HTTPS')
  assert.match(endpoint.hostname, /^[a-z0-9-]+\.supabase\.co$/, 'El host de Supabase no es válido')
  assert.ok(key?.startsWith('sb_publishable_'), 'Falta clave publicable de Supabase')
  assert.ok(adminEmail && adminPassword, 'Faltan TEST_ADMIN_EMAIL y TEST_ADMIN_PASSWORD')
  assert.equal(Boolean(otherEmail), Boolean(otherPassword), 'Define juntas TEST_OTHER_EMAIL y TEST_OTHER_PASSWORD')
}

function client() {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

const logPass = (message) => console.log(`✓ ${message}`)

async function signIn(instance, email, password) {
  const { data, error } = await instance.auth.signInWithPassword({ email, password })
  assert.ifError(error)
  assert.ok(data.user?.id, 'El login no devolvió identidad')
  return data.user.id
}

async function readOwnProfile(instance, id) {
  const { data, error } = await instance.from('app_users')
    .select('id,status,is_platform_admin').eq('id', id).maybeSingle()
  assert.ifError(error)
  assert.ok(data, 'No existe perfil legible para esta cuenta activa')
  assert.equal(data.id, id)
  assert.equal(data.status, 'active')
  return data
}

async function verify() {
  requireConfig()
  const visitor = client()
  const admin = client()
  const other = otherEmail ? client() : null

  try {
    // Un anónimo puede recibir 401/403 o simplemente una lista vacía, nunca filas.
    const guestRead = await visitor.from('app_users').select('id').limit(2)
    assert.ok(guestRead.error || guestRead.data?.length === 0, 'Se filtraron perfiles a un usuario anónimo')
    logPass('Un visitante anónimo no puede leer perfiles')

    const adminId = await signIn(admin, adminEmail, adminPassword)
    const adminProfile = await readOwnProfile(admin, adminId)
    assert.equal(adminProfile.is_platform_admin, true, 'La cuenta indicada no tiene rol global de Administrador')
    logPass('Administrador autenticado y perfil activo con privilegio global')

    const { data: adminVisible, error: adminListError } = await admin
      .from('app_users').select('id')
    assert.ifError(adminListError)
    assert.deepEqual(adminVisible.map((row) => row.id).sort(), [adminId])
    logPass('El Administrador solo puede listar su propio perfil (RLS de Fase 1)')

    if (other) {
      const otherId = await signIn(other, otherEmail, otherPassword)
      assert.notEqual(otherId, adminId, 'Utiliza dos cuentas diferentes')
      const otherProfile = await readOwnProfile(other, otherId)
      assert.equal(otherProfile.is_platform_admin, false, 'El segundo usuario debe ser una cuenta no administrativa')
      logPass('La segunda cuenta accede únicamente a su perfil activo')

      const { data: hiddenOther, error: hiddenOtherError } = await admin
        .from('app_users').select('id').eq('id', otherId)
      assert.ifError(hiddenOtherError)
      assert.deepEqual(hiddenOther, [], 'El Administrador leyó un perfil ajeno')
      const { data: hiddenAdmin, error: hiddenAdminError } = await other
        .from('app_users').select('id').eq('id', adminId)
      assert.ifError(hiddenAdminError)
      assert.deepEqual(hiddenAdmin, [], 'La segunda cuenta leyó el perfil del Administrador')
      logPass('Aislamiento bidireccional entre cuentas confirmado')
    } else {
      console.log('↷ Aislamiento entre dos cuentas: OMITIDO (faltan credenciales del usuario de prueba)')
    }

    console.log('\nResultado: comprobaciones de lectura RLS correctas.')
    console.log('Pendiente por hacer manualmente: denegación de UPDATE, cuenta inactiva, login/logout y cambio de contraseña desde la interfaz.')
  } finally {
    // Cerrar explícitamente las sesiones temporales; no se guardan en disco.
    await Promise.allSettled([admin, other].filter(Boolean).map((instance) => instance.auth.signOut()))
  }
}

verify().catch((error) => {
  console.error(`✗ Verificación fallida: ${error instanceof Error ? error.message : 'error desconocido'}`)
  process.exitCode = 1
})

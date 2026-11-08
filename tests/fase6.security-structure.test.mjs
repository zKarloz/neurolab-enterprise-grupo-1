import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (file) => readFileSync(new URL(file, import.meta.url),'utf8')
const fn = read('../supabase/functions/admin-users/index.ts')
const migration = read('../supabase/migrations/202611080006_global_account_audit.sql')
const app = read('../src/app/App.tsx')
const ui = read('../src/features/administration/AdminUsersPage.tsx')
const supabaseClient = read('../src/lib/supabase.ts')

test('Edge Function comprueba JWT y privilegio desde BD ANTES de procesar acciones', () => {
  assert.match(fn,/auth\.getUser\(token\)/)
  assert.match(fn,/\.from\('app_users'\)/)
  assert.match(fn,/isActivePlatformAdmin\(actor\)/)
  assert.ok(fn.indexOf('isActivePlatformAdmin(actor)') < fn.indexOf('request.json()'))
  assert.match(fn,/mayManageUser\(actorId, target\)/)
  assert.match(fn,/auth\.admin\.createUser/)
  assert.match(fn,/auth\.admin\.updateUserById/)
  assert.doesNotMatch(fn,/Deno\.env\.get\('VITE_/)
})

test('se conserva verify_jwt y las contraseñas no se guardan en perfiles ni auditoría',()=>{
  assert.match(read('../supabase/config.toml'),/verify_jwt\s*=\s*true/)
  assert.doesNotMatch(fn,/console\.(log|error)/)
  assert.match(fn,/crypto\.getRandomValues/)
  assert.match(fn,/email_confirm:\s*true/)
  assert.match(fn,/email_verified_by_admin\s*!==\s*true/)
  assert.doesNotMatch(migration,/create\s+policy.+insert.+app_users/i)
  assert.match(migration,/revoke insert, update, delete on public\.app_users/)
})

test('no se autoconceden privilegios y se protege último responsable activo',()=>{
  assert.match(fn,/!mayManageUser|mayManageUser/)
  assert.doesNotMatch(fn,/is_platform_admin:\s*true/)
  assert.match(migration,/guard_last_responsible_status/)
  assert.match(migration,/last_responsible_status_before_update/)
  assert.match(migration,/private\.has_project_role/)
  assert.match(migration,/admin_user_created/)
  assert.match(migration,/admin_password_reset/)
})

test('ruta global visible solo para Admin y ninguna clave secreta en frontend',()=>{
  assert.match(app,/AdminRoute/)
  assert.match(app,/profile\.is_platform_admin/)
  assert.match(ui,/Proyectos → Integrantes/)
  assert.doesNotMatch(ui,/service_role|sb_secret_/)
  assert.doesNotMatch(supabaseClient,/SUPABASE_SERVICE_ROLE_KEY/)
})

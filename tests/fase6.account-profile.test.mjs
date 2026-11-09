import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { normalizeDisplayName } from '../src/features/auth/profileValidation.ts'

const page = readFileSync(new URL('../src/features/auth/AccountPage.tsx', import.meta.url), 'utf8')
const sql = readFileSync(new URL('../supabase/migrations/202611090008_profile_display_name.sql', import.meta.url), 'utf8')

test('nombre visible: permite Unicode y elimina espacios exteriores', () => {
  assert.equal(normalizeDisplayName('  María José  '), 'María José')
  assert.equal(normalizeDisplayName('  👩🏽‍💻 Ana  '), '👩🏽‍💻 Ana')
})

test('nombre visible: rechaza cadenas vacías, cortas, largas y caracteres de control', () => {
  for (const value of ['', ' ', 'a', ' '.repeat(10), 'x'.repeat(81), 'Ana\nAdmin', 'Ana\u007f']) {
    assert.equal(normalizeDisplayName(value), null, JSON.stringify(value))
  }
  assert.equal(normalizeDisplayName('a'.repeat(80)), 'a'.repeat(80))
})

test('Mi cuenta reutiliza Modal y mantiene contraseña en Supabase Auth', () => {
  assert.match(page, /import\s*\{\s*Modal\s*\}/)
  assert.match(page, /<Modal\s+open=\{passwordModalOpen\}/)
  assert.match(page, /auth\.updateUser\(\{ password \}\)/)
})

test('El cambio de nombre usa el RPC, refresca el proveedor y no cambia roles', () => {
  assert.match(page, /supabase\.rpc\('update_my_display_name',\s*\{\s*p_display_name:\s*nextName\s*\}\)/)
  assert.match(page, /await refresh\(\)/)
  assert.doesNotMatch(page, /\.from\(['"]app_users['"]\)\.update/)
})

test('RPC valida estado activo, identidad y modifica solamente nombre y fecha', () => {
  assert.match(sql, /security definer/i)
  assert.match(sql, /set search_path = ''/i)
  assert.match(sql, /where id = \(select auth\.uid\(\)\)/i)
  assert.match(sql, /and status = 'active'/i)
  assert.match(sql, /set display_name = v_name,\s*updated_at = now\(\)/i)
  assert.doesNotMatch(sql, /set\s+(?:status|is_platform_admin|email)\s*=/i)
})

test('RPC no amplía permisos de tablas ni concede acceso a anon', () => {
  assert.match(sql, /revoke all on function public\.update_my_display_name\(text\) from public, anon, authenticated/i)
  assert.match(sql, /grant execute on function public\.update_my_display_name\(text\) to authenticated/i)
  assert.doesNotMatch(sql, /grant\s+update\b/i)
  assert.doesNotMatch(sql, /disable row level security/i)
})

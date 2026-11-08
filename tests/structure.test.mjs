import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (file) => readFileSync(join(root, file), 'utf8')

test('Las dependencias de Fase 1 están fijadas sin rangos automáticos', () => {
  const pkg = JSON.parse(read('package.json'))
  for (const version of Object.values({ ...pkg.dependencies, ...pkg.devDependencies })) {
    assert.match(version, /^\d+\.\d+\.\d+$/)
  }
})

test('No se expone service_role ni existe signup público en el frontend', () => {
  const files = [
    'src/lib/supabase.ts', 'src/features/auth/LoginPage.tsx',
    'src/features/auth/AuthProvider.tsx', 'src/app/App.tsx',
  ]
  for (const file of files) {
    const code = read(file)
    assert.doesNotMatch(code, /auth\.signUp\s*\(/)
    assert.doesNotMatch(code, /createClient\s*\([^)]*service_role/s)
  }
})

test('Existe migración RLS e infraestructura mínima de rutas', () => {
  const sql = read('supabase/migrations/202611070001_init_app_users.sql')
  assert.match(sql, /enable row level security/i)
  assert.match(sql, /auth\.uid\(\)/)
  assert.ok(existsSync(join(root,'src/app/App.tsx')))
  assert.ok(existsSync(join(root,'vercel.json')))
})

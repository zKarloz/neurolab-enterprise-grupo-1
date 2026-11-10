/** Matriz F6: contrato de roles, interfaz y carácter no destructivo de las pruebas. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getRolePermissions, permissionStateLabels } from '../src/security/rolePermissions.ts'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const item = (role, key, status = 'active') => getRolePermissions(role, status).find((entry) => entry.key === key)

test('Matriz completa de once permisos para cinco roles', () => {
  for (const role of ['admin', 'responsible', 'engineer', 'reviewer', 'reader']) {
    const entries = getRolePermissions(role)
    assert.equal(entries.length, 11)
    assert.equal(new Set(entries.map((entry) => entry.key)).size, 11)
    for (const entry of entries) assert.ok(permissionStateLabels[entry.state])
  }
})

test('Admin global no hereda datos técnicos ni aprobación', () => {
  assert.equal(item('admin', 'global_users').state, 'allowed')
  assert.equal(item('admin', 'manage_project').state, 'allowed')
  assert.equal(item('admin', 'read_technical').state, 'conditional')
  assert.equal(item('admin', 'train_publish').state, 'conditional')
  assert.equal(item('admin', 'review_versions').state, 'conditional')
})

test('Responsable gestiona integrantes y auditoría sin autoentrenar', () => {
  assert.equal(item('responsible', 'manage_members').state, 'allowed')
  assert.equal(item('responsible', 'project_audit').state, 'allowed')
  assert.equal(item('responsible', 'train_publish').state, 'denied')
  assert.equal(item('responsible', 'review_versions').state, 'denied')
  assert.equal(item('responsible', 'create_project').state, 'conditional')
})

test('Ingeniero entrena; Revisor decide con condiciones; Lector no escribe', () => {
  assert.equal(item('engineer', 'train_publish').state, 'allowed')
  assert.equal(item('engineer', 'review_versions').state, 'denied')
  assert.equal(item('reviewer', 'review_versions').state, 'conditional')
  assert.equal(item('reviewer', 'train_publish').state, 'denied')
  assert.equal(item('reader', 'export_reports').state, 'allowed')
  assert.equal(item('reader', 'manage_members').state, 'denied')
  assert.equal(item('reader', 'global_users').state, 'denied')
})

test('Proyecto archivado bloquea acciones técnicas de escritura', () => {
  for (const role of ['admin', 'responsible', 'engineer', 'reviewer', 'reader']) {
    assert.equal(item(role, 'train_publish', 'archived').state, 'denied')
    assert.equal(item(role, 'review_versions', 'archived').state, 'denied')
    assert.equal(item(role, 'manage_members', 'archived').state, 'denied')
  }
})

test('Integración reutiliza Modal y agrega exactamente una columna Permisos', () => {
  const page = read('../src/features/projects/ProjectDetailPage.tsx')
  const modal = read('../src/features/projects/MemberPermissionsModal.tsx')
  assert.equal(page.match(/>Permisos<\/th>/g)?.length, 1)
  assert.match(page, /setMemberForPermissions\(member\)/)
  assert.match(page, /<MemberPermissionsModal/)
  assert.match(modal, /<Modal open=/)
  assert.match(modal, /getRolePermissions\(role, projectStatus\)/)
  assert.match(modal, /no indica que este integrante sea Administrador/)
})

test('El script exige cinco identidades y no utiliza una clave privilegiada', () => {
  const script = read('../scripts/test-fase6-role-matrix-live.mjs')
  for (const role of ['RESPONSIBLE', 'ENGINEER', 'REVIEWER', 'READER', 'ADMIN']) {
    assert.match(script, new RegExp(`TEST_F6_${role}_EMAIL`))
  }
  assert.match(script, /persistSession: false/)
  assert.doesNotMatch(script, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/)
})

test('Los RPC de prueba reciben datos inválidos y no realizan altas o cambios', () => {
  const script = read('../scripts/test-fase6-role-matrix-live.mjs')
  assert.match(script, /p_name: ''/)
  assert.match(script, /p_role: '__ROL_INVALIDO__'/)
  assert.match(script, /p_row_count: 0, p_byte_size: 0/)
  assert.match(script, /\['rejected','retired'\]/)
  assert.match(script, /p_decision: 'reviewed'/)
  assert.doesNotMatch(script, /\.rpc\('record_report_export'/)
  assert.match(script, /\.rpc\('create_project'/)
  assert.doesNotMatch(script, /\.from\([^)]+\)\.(insert|update|delete|upsert)\(/)
})

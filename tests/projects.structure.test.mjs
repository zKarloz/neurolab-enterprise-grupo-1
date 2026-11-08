import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const read = (path) => readFileSync(join(root, path), 'utf8')
const sql = read('supabase/migrations/202611070002_projects_members_audit.sql')

test('Tablas de proyectos, miembros y auditoría están protegidas con RLS', () => {
  for (const name of ['projects', 'project_members', 'audit_events']) {
    assert.match(sql, new RegExp(`create table public\\.${name}`, 'i'))
    assert.match(sql, new RegExp(`alter table public\\.${name} enable row level security`, 'i'))
  }
  assert.match(sql, /revoke all on public\.projects, public\.project_members, public\.audit_events from public, anon, authenticated/i)
  assert.doesNotMatch(sql, /grant (?:all|insert|update|delete) on public\.(?:projects|project_members|audit_events) to authenticated/i)
})

test('Las RPC verifican permisos y no existe una escalada directa de roles', () => {
  for (const rpc of ['create_project', 'update_project', 'archive_project', 'add_project_member', 'change_project_member_role', 'remove_project_member']) {
    assert.match(sql, new RegExp(`create function public\\.${rpc}\\(`, 'i'))
  }
  assert.match(sql, /v_target = \(select auth\.uid\(\)\)/)
  assert.match(sql, /p_user_id = \(select auth\.uid\(\)\)/)
  assert.match(sql, /Debe permanecer un Responsable activo/)
  assert.match(sql, /private\.has_project_role/)
  assert.match(sql, /security definer set search_path = ''/i)
})

test('La interfaz tiene rutas, modales y paginación compartidos', () => {
  for (const path of [
    'src/features/projects/ProjectsPage.tsx', 'src/features/projects/ProjectDetailPage.tsx',
    'src/components/ui/Modal.tsx', 'src/components/ui/Pagination.tsx',
  ]) assert.equal(existsSync(join(root, path)), true, path)
  assert.match(read('src/app/App.tsx'), /path="\/proyectos\/\:projectId"/)
  assert.match(read('src/services/projects.ts'), /rpc\('create_project'/)
})

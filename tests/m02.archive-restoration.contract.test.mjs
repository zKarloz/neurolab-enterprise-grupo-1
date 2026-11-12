// Contratos de restauración: solo SQL/RPC para escribir y UI autorizada.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (path) => readFileSync(path, 'utf8')
const sql = read('supabase/migrations/202611120017_restore_archived_projects.sql')
const screen = read('src/features/projects/ProjectsPage.tsx')
const service = read('src/services/projects.ts')
const reporting = read('src/services/reporting.ts')

test('M02: el archivo es un cambio lógico, no eliminación', () => {
  const baseline = read('supabase/migrations/202611070002_projects_members_audit.sql')
  assert.match(baseline, /UPDATE public\.projects SET status = 'archived'/i)
  assert.match(sql, /UPDATE public\.projects SET status = 'active'/i)
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+public\.(projects|training_runs|model_versions)/i)
})
test('M02: restauración por RPC restringida y transaccional', () => {
  assert.match(sql, /BEGIN;/i)
  assert.match(sql, /COMMIT;/i)
  assert.match(sql, /private\.can_manage_project\(p_project_id\)/)
  assert.match(sql, /WHERE id = p_project_id AND status = 'archived'/)
  assert.match(sql, /m\.role = 'responsible' AND u\.status = 'active'/)
  assert.match(sql, /SECURITY DEFINER SET search_path = ''/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.restore_project\(uuid\) FROM PUBLIC, anon, authenticated/i)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.restore_project\(uuid\) TO authenticated/i)
  assert.doesNotMatch(sql, /GRANT (INSERT|UPDATE|DELETE) ON public\.projects/i)
})
test('M02: evento de restauración auditable y filtrado administrativo', () => {
  assert.match(sql, /audit_events_action_check[\s\S]*project_restored/)
  assert.match(sql, /ALTER POLICY "Auditoria por rol y alcance"/)
  assert.match(sql, /'project_restored', 'project'/)
  assert.match(reporting, /project_restored: 'Proyecto restaurado'/)
  assert.match(reporting, /ADMIN_AUDIT_ACTIONS = \[[\s\S]*'project_restored'/)
})
test('M02: acceso Archivados, restauración controlada, modal y paginación', () => {
  assert.match(screen, /Archivados \(\{archivedCount\}\)/)
  assert.match(screen, /restoring \!== null/)
  assert.match(screen, /<Pagination/)
  assert.match(screen, /<Modal/)
  assert.match(screen, /project\.status === 'archived' && \(platformAdmin \|\| responsibleIds\.includes\(project\.id\)\)/)
  assert.match(screen, /await restoreProject\(selected\.id\)/)
  assert.match(service, /rpc\('restore_project', \{ p_project_id: id \}\)/)
})
test('M02: diagnóstico de solo lectura muestra una fila', () => {
  const diagnostic = read('supabase/tests/M02_RESTAURACION_PROYECTOS_READONLY.sql')
  assert.match(diagnostic, /rpc_presente/)
  assert.match(diagnostic, /auditoria_global_ajustada/)
  assert.doesNotMatch(diagnostic, /\b(UPDATE|INSERT|DELETE|CREATE|DROP|ALTER)\s+(?:TABLE|FUNCTION|POLICY|ON|INTO|FROM|public\.)/i)
})

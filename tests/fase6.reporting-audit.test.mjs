import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { toCsv, safeCsvCell } from '../src/ml/reports/csv.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('CSV neutraliza fórmulas, incluidos inicios con espacios y tabulaciones', () => {
  for (const dangerous of ['=1+1', '+CMD', '-2+3', '@SUM(1,1)', '  =HYPERLINK(1)', '\t@cmd']) {
    assert.ok(safeCsvCell(dangerous).startsWith('"\''), dangerous)
  }
  assert.equal(safeCsvCell('normal'), '"normal"')
  assert.equal(safeCsvCell('a"b'), '"a""b"')
})

test('CSV incluye BOM, CRLF y valida ancho de columnas', () => {
  const csv = toCsv(['A','B'], [['á', 0], ['dato', null]])
  assert.ok(csv.startsWith('\uFEFF'))
  assert.ok(csv.includes('\r\n'))
  assert.throws(() => toCsv(['A','B'], [['falta']]))
})

test('el reporte exige membresía técnica real y no descarga CSV de origen', () => {
  const service = read('src/services/reporting.ts')
  assert.match(service, /from\('project_members'\)/)
  assert.match(service, /await requireProjectMember\(projectId, userId\)/)
  assert.match(service, /from\('run_evaluations'\)/)
  assert.doesNotMatch(service, /\.storage\.|service_role|original_csv/i)
})

test('auditoría usa paginación en BD, filtro administrativo y limitación de exportación', () => {
  const service = read('src/services/reporting.ts')
  assert.match(service, /AUDIT_PAGE_SIZE = 15/)
  assert.match(service, /EXPORT_LIMIT = 200/)
  assert.match(service, /query\.in\('action', \[\.\.\.ADMIN_AUDIT_ACTIONS\]\)/)
  assert.match(service, /\.range\(start, start \+ limit - 1\)/)
  assert.match(read('src/features/administration/AuditEventsPage.tsx'), /role !== 'responsible'/)
})

test('la migración no altera RLS ni da escritura directa al navegador', () => {
  const sql = read('supabase/migrations/202611090010_reports_audit_exports.sql')
  assert.match(sql, /SECURITY DEFINER SET search_path = ''/i)
  assert.match(sql, /private\.has_project_role\(p_project_id/i)
  assert.match(sql, /private\.is_platform_admin\(\)/i)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.record_report_export/i)
  assert.doesNotMatch(sql, /DISABLE ROW LEVEL SECURITY|GRANT (INSERT|UPDATE|DELETE) ON public\.(audit_events|training_runs)/i)
})

test('PDF usa impresión del navegador y no publica un documento externo', () => {
  const page = read('src/features/reports/ProjectReportPage.tsx')
  assert.match(page, /window\.print\(\)/)
  assert.match(page, /await recordExport\(projectId/)
  assert.match(page, /print:hidden|report-no-print/)
})

test('integrador contiene rutas y navegación para las dos vistas con permisos distintos', () => {
  const installer = read('tools/instalar-reportes-auditoria.mjs')
  assert.match(installer, /\/proyectos\/:projectId\/reportes/)
  assert.match(installer, /\/proyectos\/:projectId\/auditoria/)
  assert.match(installer, /\/administracion\/auditoria/)
  assert.match(installer, /--check/)
  assert.match(installer, /INCOMPATIBLE: no se ha modificado ningún archivo/)
})

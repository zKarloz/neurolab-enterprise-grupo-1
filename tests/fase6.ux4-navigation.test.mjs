/**
 * Regresión UX4: navegación contextual y sidebar móvil.
 * No consume Supabase, claves ni servicios externos.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getBackDestination } from '../src/components/layout/backNavigation.ts'

const read = (path) => readFileSync(path, 'utf8')
const shell = read('src/components/layout/AppShell.tsx')
const audit = read('src/features/administration/AuditEventsPage.tsx')
const button = read('src/components/layout/BackButton.tsx')

test('retroceso contextual de auditoría de proyecto regresa a su detalle', () => {
  assert.deepEqual(getBackDestination('/proyectos/proyecto-123/auditoria'), {
    to: '/proyectos/proyecto-123', label: 'Volver al proyecto',
  })
  assert.deepEqual(getBackDestination('/proyectos/proyecto-123/auditoria/'), {
    to: '/proyectos/proyecto-123', label: 'Volver al proyecto',
  })
})

test('auditoría global no presenta retroceso de proyecto', () => {
  assert.equal(getBackDestination('/administracion/auditoria'), null)
})

test('otras rutas del proyecto conservan destinos originales', () => {
  assert.deepEqual(getBackDestination('/proyectos/proyecto-123'), {
    to: '/proyectos', label: 'Volver a proyectos',
  })
  for (const moduleName of ['datos', 'historial', 'modelos', 'reportes']) {
    assert.equal(getBackDestination(`/proyectos/proyecto-123/${moduleName}`)?.to, '/proyectos/proyecto-123')
  }
})

test('no se muestra BackButton en el topbar móvil', () => {
  const headerStart = shell.indexOf('<header className="sticky top-0')
  const headerEnd = shell.indexOf('</header>', headerStart)
  assert.ok(headerStart >= 0 && headerEnd > headerStart)
  const header = shell.slice(headerStart, headerEnd)
  assert.doesNotMatch(header, /<BackButton\b/)
  assert.match(shell, /className="fixed top-\[136px\] z-20 hidden lg:grid"/)
  assert.match(shell, /destination=\{backDestination\}/)
  assert.match(button, /print:hidden/)
})

test('sidebar móvil tiene un solo botón X, al pie del menú', () => {
  assert.doesNotMatch(shell, /\{mobile && <button/)
  const closeButtons = [...shell.matchAll(/aria-label="Cerrar menú"/g)]
  assert.equal(closeButtons.length, 0) // Cerrar menú al pie es etiqueta visible, no X adicional en cabecera.
  assert.match(shell, /<X size=\{19\} aria-hidden="true" \/> Cerrar menú/)
  assert.match(shell, /aria-label="Cerrar menú lateral"/)
})

test('Auditoría ya no duplica enlace Volver al proyecto', () => {
  assert.doesNotMatch(audit, /<Link\b|\bArrowLeft\b|Volver al proyecto/)
  assert.match(audit, /export function AuditEventsPage/)
  assert.match(audit, /recordExport\(scope, 'audit_csv'\)/)
  assert.match(audit, /scope \? 'Eventos del proyecto/)
})

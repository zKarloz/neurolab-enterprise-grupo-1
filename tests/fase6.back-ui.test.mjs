import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { getBackDestination } from '../src/components/layout/backNavigation.ts'

const src = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('proyectos: volver al listado, sin depender de history(-1)', () => {
  assert.deepEqual(getBackDestination('/proyectos/abc-123'), { to: '/proyectos', label: 'Volver a proyectos' })
  assert.deepEqual(getBackDestination('/proyectos/abc-123/'), { to: '/proyectos', label: 'Volver a proyectos' })
})

test('submódulos conocidos vuelven directamente al detalle de su proyecto', () => {
  for (const moduleName of ['datos', 'historial', 'modelos', 'reportes']) {
    assert.deepEqual(getBackDestination(`/proyectos/abc-123/${moduleName}`), {
      to: '/proyectos/abc-123', label: 'Volver al proyecto',
    })
  }
})

test('las rutas globales y rutas desconocidas no muestran retroceso indebido', () => {
  for (const route of ['/inicio', '/cuenta', '/proyectos', '/administracion/usuarios',
    '/administracion/auditoria', '/proyectos/abc-123/extra/desconocido', '/proyectos/abc-123/otro']) {
    assert.equal(getBackDestination(route), null, route)
  }
})

test('el botón es compartido, accesible y no se imprime en el PDF formal', () => {
  const code = src('src/components/layout/BackButton.tsx')
  assert.match(code, /export function BackButton/)
  assert.match(code, /<Link\s/)
  assert.match(code, /aria-label=\{destination\.label\}/)
  assert.match(code, /print:hidden/)
  assert.match(code, /ArrowLeft/)
})

test('retroceso fijo bajo el topbar en escritorio y en el topbar para móvil', () => {
  const code = src('src/components/layout/AppShell.tsx')
  assert.match(code, /getBackDestination\(location\.pathname\)/)
  assert.match(code, /className="shrink-0 lg:hidden"/)
  assert.match(code, /className="fixed top-\[136px\] z-20 hidden lg:grid"/)
  assert.match(code, /<BackButton[\s\S]*?destination=\{backDestination\}/)
})

test('menú de usuario: cierre por opacidad y traslación, sin escala', () => {
  const code = src('src/components/layout/UserMenu.tsx')
  assert.match(code, /transition-\[opacity,transform,visibility\] duration-150/)
  assert.match(code, /motion-reduce:transition-none/)
  assert.doesNotMatch(code, /scale-95|scale-100/)
  assert.match(code, /onPointerDown/)
  assert.match(code, /onKeyDown/)
  assert.match(code, /UserRound size=\{17\}/)
})

test('no se conservan botones de regreso redundantes en los cinco módulos', () => {
  for (const file of [
    'src/features/projects/ProjectDetailPage.tsx',
    'src/features/datasets/LocalDatasetPage.tsx',
    'src/features/models/ModelRegistryPage.tsx',
    'src/features/evaluation/TrainingHistoryPage.tsx',
    'src/features/reports/ProjectReportPage.tsx',
  ]) {
    const code = src(file)
    assert.doesNotMatch(code, /ArrowLeft|Volver al proyecto|Volver a proyectos|> Volver</, file)
  }
})

test('registro, predicción, historial y exportación mantienen sus operaciones', () => {
  assert.match(src('src/features/models/ModelRegistryPage.tsx'), /loadDensePredictor/)
  assert.match(src('src/features/evaluation/TrainingHistoryPage.tsx'), /RunComparison/)
  assert.match(src('src/features/datasets/LocalDatasetPage.tsx'), /readLocalCsv/)
  assert.match(src('src/features/reports/ProjectReportPage.tsx'), /FormalReportDocument/)
  assert.match(src('src/features/projects/ProjectDetailPage.tsx'), /archiveProject/)
})

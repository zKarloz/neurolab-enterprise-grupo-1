/**
 * Regresión de navegación contextual para las familias recurrente y generativa.
 * No requiere sesión, conexión a Supabase ni dependencias del navegador.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getBackDestination } from '../src/components/layout/backNavigation.ts'

const projectId = 'proyecto-de-prueba'

for (const family of ['rnn', 'gan']) {
  test(`M07: ${family.toUpperCase()} muestra Volver al proyecto`, () => {
    const expected = {
      to: `/proyectos/${projectId}`,
      label: 'Volver al proyecto',
    }
    assert.deepEqual(getBackDestination(`/proyectos/${projectId}/${family}`), expected)
    assert.deepEqual(getBackDestination(`/proyectos/${projectId}/${family}/`), expected)
  })
}

test('no altera los destinos para Proyectos, CNN ni los demás módulos', () => {
  assert.deepEqual(getBackDestination(`/proyectos/${projectId}`), {
    to: '/proyectos', label: 'Volver a proyectos',
  })
  for (const moduleName of ['cnn', 'datos', 'historial', 'modelos', 'reportes', 'auditoria']) {
    assert.equal(getBackDestination(`/proyectos/${projectId}/${moduleName}`)?.to, `/proyectos/${projectId}`)
  }
})

test('rutas globales o desconocidas permanecen sin botón de retroceso', () => {
  for (const pathname of ['/inicio', '/proyectos', '/administracion/auditoria',
    `/proyectos/${projectId}/no-existe`, `/proyectos/${projectId}/rnn/otra-ruta`]) {
    assert.equal(getBackDestination(pathname), null, pathname)
  }
})

/** Regresión visual: archivados se filtra desde Estado, no desde un botón duplicado. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/features/projects/ProjectsPage.tsx', import.meta.url), 'utf8')

test('el encabezado no muestra el acceso redundante Archivados', () => {
  const header = source.match(/<header\b[\s\S]*?<\/header>/)?.[0]
  assert.ok(header, 'No se encontró el encabezado de Proyectos.')
  assert.doesNotMatch(header, /Archivados|archivedCount|aria-pressed/)
  assert.match(header, /Nuevo proyecto/)
})

test('el filtro Estado conserva las tres opciones', () => {
  assert.match(source, /value: 'active', label: 'Activos'/)
  assert.match(source, /value: 'archived', label: 'Archivados'/)
  assert.match(source, /value: 'all', label: 'Todos'/)
  assert.match(source, /project\.status === filter/)
})

test('no queda un contador o icono exclusivo del botón retirado', () => {
  assert.doesNotMatch(source, /const archivedCount\s*=/)
  assert.doesNotMatch(source, /\bArchive,\s*ArchiveRestore\b/)
  assert.doesNotMatch(source, /<Archive\s/)
})

test('restauración, confirmación y autorización permanecen disponibles', () => {
  assert.match(source, /restoreProject\(selected\.id\)/)
  assert.match(source, /const canRestore = \(project: Project\)/)
  assert.match(source, /setRestoring\(project\)/)
  assert.match(source, /Confirmar restauración/)
})

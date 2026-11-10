/** Pruebas ligeras de regresión de la experiencia visual de Fase 6, sin red ni credenciales. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const read = (file) => readFileSync(file, 'utf8')
const layout = read('src/components/layout/AppShell.tsx')
const menu = read('src/components/layout/UserMenu.tsx')
const motion = read('src/components/layout/userMenuMotion.css')
const back = read('src/components/layout/BackButton.tsx')

test('sidebar: conserva enlaces de trabajo y elimina Mi cuenta de la navegación lateral', () => {
  assert.match(layout, /to: '\/inicio'/)
  assert.match(layout, /to: '\/proyectos'/)
  assert.doesNotMatch(layout, /to: '\/cuenta'/)
  assert.match(menu, /to="\/cuenta"/)
  assert.match(layout, /Configuración personal.*Mi cuenta/)
})

test('sidebar: alterna anchos, conserva preferencia, ofrece botón accesible', () => {
  assert.match(layout, /neurolab:sidebar-collapsed/)
  assert.match(layout, /'76px'\s*:\s*'264px'/)
  assert.match(layout, /aria-label=\{compact \? 'Expandir menú' : 'Contraer menú'\}/)
  assert.match(layout, /localStorage\.setItem\(SIDEBAR_KEY/)
  assert.match(layout, /lg:pl-\[var\(--nl-sidebar-width\)\]/)
})

test('sidebar móvil: mantiene texto y no depende del estado contraído', () => {
  assert.match(layout, /const compact = !mobile && collapsed/)
  assert.match(layout, /renderSidebar\(true\)/)
  assert.match(layout, /aria-label=\{label\}/)
  assert.match(layout, /sr-only/)
})

test('navegación administrativa mantiene sus dos enlaces y protección visual', () => {
  assert.match(layout, /\/administracion\/usuarios/)
  assert.match(layout, /\/administracion\/auditoria/)
  assert.match(layout, /isPlatformAdmin &&/)
})

test('botón contextual: reserva margen y cambia posición con el sidebar', () => {
  assert.match(layout, /lg:pl-24/)
  assert.match(layout, /left: collapsed \?/)
  assert.match(layout, /top-\[136px\]/)
  assert.match(back, /transition-\[left,background-color,box-shadow\]/)
  assert.match(back, /print:hidden/)
})

test('menú: entrada ligera y salida exclusiva por opacidad', () => {
  assert.match(menu, /userMenuMotion\.css/)
  assert.match(menu, /nl-user-menu-opening/)
  assert.match(menu, /nl-user-menu-closing/)
  assert.match(motion, /@keyframes nl-user-menu-enter/)
  assert.match(motion, /translateY\(-4px\)/)
  const closing = motion.match(/\.nl-user-menu-closing\s*\{([^}]+)\}/)?.[1] ?? ''
  assert.match(closing, /opacity 110ms/)
  assert.doesNotMatch(closing, /transform|scale|translate/)
  assert.match(motion, /prefers-reduced-motion/)
})

test('inicio: elimina etiqueta y tarjeta Fase 2 Proyectos', () => {
  const home = read('src/features/home/HomePage.tsx')
  assert.doesNotMatch(home, /Tu espacio de trabajo|Fase 2 · Proyectos/)
  assert.match(home, /Hola, \{firstName\}/)
})

test('módulos: retira etiquetas técnicas sin borrar títulos y acciones', () => {
  const pages = [
    ['src/features/projects/ProjectsPage.tsx', 'Proyectos'],
    ['src/features/projects/ProjectDetailPage.tsx', 'Editar'],
    ['src/features/datasets/LocalDatasetPage.tsx', 'Preparar un CSV'],
    ['src/features/evaluation/TrainingHistoryPage.tsx', 'Historial de entrenamientos'],
    ['src/features/models/ModelRegistryPage.tsx', 'Modelos privados'],
    ['src/features/reports/ProjectReportPage.tsx', 'Ficha y reporte del proyecto'],
    ['src/features/administration/AdminUsersPage.tsx', 'Usuarios'],
    ['src/features/administration/AuditEventsPage.tsx', 'Auditoría de acciones'],
    ['src/features/auth/AccountPage.tsx', 'Mi cuenta'],
  ]
  for (const [path, title] of pages) {
    const content = read(path)
    assert.ok(content.includes(title), `Título/acción ausente: ${path}`)
    assert.doesNotMatch(content, />M\d{2} ·|>Configuración personal<|>Tu espacio de trabajo</)
  }
  assert.doesNotMatch(read('src/features/models/ModelReviewsSection.tsx'), /Decisiones trazables por versión/)
})

test('el documento consolidado describe el alcance UX3', () => {
  const document = 'docs/operations/FASE_6_COMPLEMENTOS.md'
  assert.ok(existsSync(document))
  assert.match(read(document), /F6-UI3-20261109/)
})

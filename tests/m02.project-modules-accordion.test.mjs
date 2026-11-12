// Regresiones M02: secciones controladas con tarjetas visibles al abrir y títulos sin iconos.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('src/features/projects/ProjectDetailPage.tsx', 'utf8')
const moduleStart = source.indexOf("{tab === 'modules' && <div")
// Delimitar por el aviso situado DESPUÉS de ambas secciones, no por un cierre interno de div.
const moduleEnd = source.indexOf('      {error && <Notice', moduleStart)
const modules = source.slice(moduleStart, moduleEnd)
const algorithmStart = modules.indexOf('id="project-modules-algorithms"')
const managementStart = modules.indexOf('id="project-modules-management"')
const algorithms = modules.slice(algorithmStart, managementStart)
const management = modules.slice(managementStart)

test('M02: dos secciones controladas por React y restauradas desde sesión', () => {
  // El estado inicial se lee de sessionStorage; en sesiones nuevas ambas quedan cerradas.
  assert.match(source, /readProjectModuleExpansion\(currentUserId, projectId\)/)
  assert.match(modules, /aria-expanded=\{algorithmsOpen\}/)
  assert.match(modules, /aria-expanded=\{managementOpen\}/)
  assert.match(modules, /onClick=\{\(\) => toggleModuleSection\('algorithms'\)\}/)
  assert.match(modules, /onClick=\{\(\) => toggleModuleSection\('management'\)\}/)
  assert.match(modules, /\{algorithmsOpen && <div id="project-modules-algorithms"/)
  assert.match(modules, /\{managementOpen && <div id="project-modules-management"/)
  assert.doesNotMatch(modules, /<details|<summary/)
})

test('M02: encabezados sin iconos, flechas ni pictogramas; muestran texto de estado', () => {
  for (const [state, title] of [['algorithmsOpen', 'Algoritmos'], ['managementOpen', 'Gestión y seguimiento']]) {
    const m = modules.match(new RegExp(`<button[^>]+aria-expanded=\\{${state}\\}[\\s\\S]*?<\\/button>`))
    assert.ok(m, `Falta el botón de ${title}`)
    assert.match(m[0], new RegExp(`<span>${title}<\\/span>`))
    assert.doesNotMatch(m[0], /<Layers3|<ChartNoAxesCombined|<ChevronDown|<svg/)
    assert.match(m[0], /Ocultar.*Mostrar/)
  }
})

test('M02: las tarjetas reales de los cuatro algoritmos están en el panel desplegable', () => {
  for (const route of ['/datos', '/cnn', '/rnn', '/gan']) {
    assert.ok(algorithms.includes('`/proyectos/${projectId}' + route + '`'), `Falta ${route}`)
  }
  assert.equal((algorithms.match(/<Surface className="p-5 sm:p-7"/g) ?? []).length, 4)
  assert.doesNotMatch(algorithms, /\/historial`|\/modelos`|\/reportes`|\/auditoria`/)
})

test('M02: Gestión contiene las cuatro tarjetas y respeta la restricción de Auditoría', () => {
  for (const route of ['/historial', '/modelos', '/reportes', '/auditoria']) {
    assert.ok(management.includes('`/proyectos/${projectId}' + route + '`'), `Falta ${route}`)
  }
  assert.equal((management.match(/<Surface className="p-5 sm:p-7"/g) ?? []).length, 4)
  assert.match(management, /\{isResponsible && <Surface/)
  assert.doesNotMatch(management, /\/datos`|\/cnn`|\/rnn`|\/gan`/)
})

test('M02: explica las secciones sin permisos en vez de dejarlas vacías', () => {
  assert.equal((modules.match(/\{!isMember && <p/g) ?? []).length, 2)
  assert.match(source, /idPrefix="project-detail"/)
  assert.match(source, /tab === 'members'/)
  assert.match(source, /<Pagination page=\{currentPage\}/)
  assert.match(source, /<MemberPermissionsModal/)
})

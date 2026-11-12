// Contrato de presentación de las tarjetas de acceso del detalle del proyecto.
// No utiliza Supabase ni renderiza la SPA: valida que las rutas/permisos no se alteren.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('src/features/projects/ProjectDetailPage.tsx', 'utf8')

const modules = [
  ['Red feedforward · Dense', 'FileSpreadsheet', 'datos', 'Abrir Feedforward'],
  ['Red convolucional · CNN', 'Layers3', 'cnn', 'Abrir CNN'],
  ['Red recurrente · RNN', 'GitBranch', 'rnn', 'Abrir RNN'],
  ['Red generativa adversarial · GAN', 'Sparkles', 'gan', 'Abrir GAN'],
  ['Evaluación e historial', 'ChartNoAxesCombined', 'historial', 'Abrir historial'],
  ['Modelos privados', 'Database', 'modelos', 'Abrir registro de modelos'],
  ['Reportes', 'FileText', 'reportes', 'Abrir reportes'],
  ['Auditoría del proyecto', 'ClipboardList', 'auditoria', 'Ver auditoría'],
]

test('M02: las ocho tarjetas muestran su icono junto al título', () => {
  for (const [title, icon] of modules) {
    const heading = `<h2 className="text-lg font-semibold">${title}</h2>`
    const position = source.indexOf(heading)
    assert.ok(position >= 0, `Falta el título: ${title}`)
    // El icono debe estar en el contenedor del encabezado, antes del h2.
    const headingContext = source.slice(Math.max(0, position - 130), position)
    assert.ok(headingContext.includes(`<${icon} size={19}`), `Icono del título incorrecto: ${title}`)
  }
})

test('M02: las ocho acciones conservan su ruta y muestran solo texto', () => {
  for (const [, , path, label] of modules) {
    const route = 'to={`/proyectos/${projectId}/' + path + '`}'
    const start = source.indexOf(route)
    assert.ok(start >= 0, `Falta la ruta del módulo: ${path}`)
    const bodyStart = source.indexOf('>', start) + 1
    const bodyEnd = source.indexOf('</Link>', bodyStart)
    assert.ok(bodyEnd > bodyStart)
    assert.equal(source.slice(bodyStart, bodyEnd).trim(), label, `El botón ${label} no debe tener iconos`)
  }
})

test('M02: se conservan permisos y encabezado de Integrantes', () => {
  assert.match(source, /isEngineer && project\.status === 'active'/)
  assert.ok((source.match(/\{isMember && <Surface/g) || []).length >= 6)
  assert.match(source, /\{isResponsible && <Surface/)
  assert.ok(source.includes('<Users size={19} /><h2 className="text-lg font-semibold">Integrantes</h2>'))
  assert.doesNotMatch(source, /<Plus size=\{16\}\/> Agregar integrante/)
})

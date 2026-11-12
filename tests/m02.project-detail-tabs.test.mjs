// Contrato de dos pestañas en el detalle del proyecto. No requiere Supabase ni React DOM.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('src/features/projects/ProjectDetailPage.tsx', 'utf8')
const startModules = source.indexOf("{tab === 'modules' && <div")
const startMembers = source.indexOf("{tab === 'members' && <div")
// El panel contiene subpaneles colapsables: no parar en el primer </div>}.
const endModules = source.indexOf('      {error && <Notice', startModules)
const endMembers = source.indexOf('      </div>}', startMembers)

test('M02: dos pestañas accesibles reutilizan el componente Tabs', () => {
  assert.match(source, /import \{ Tabs \} from '\.\.\/\.\.\/components\/ui\/Tabs'/)
  assert.match(source, /\{ id: 'modules', label: 'Módulos disponibles' \}/)
  assert.match(source, /\{ id: 'members', label: 'Integrantes' \}/)
  assert.match(source, /useState<'modules' \| 'members'>\('modules'\)/)
  assert.match(source, /idPrefix="project-detail"/)
  for (const id of ['modules', 'members']) {
    assert.ok(source.includes(`id="project-detail-panel-${id}" role="tabpanel"`))
    assert.ok(source.includes(`aria-labelledby="project-detail-tab-${id}"`))
  }
})

test('M02: todas las tarjetas se muestran únicamente en Módulos disponibles', () => {
  assert.ok(startModules >= 0 && endModules > startModules)
  const panel = source.slice(startModules, endModules)
  for (const route of ['/datos', '/cnn', '/rnn', '/gan', '/historial', '/modelos', '/reportes', '/auditoria']) {
    assert.ok(panel.includes('`/proyectos/${projectId}' + route + '`'), `Falta ${route}`)
  }
  assert.doesNotMatch(panel, /<h2 className="text-lg font-semibold">Integrantes<\/h2>/)
})

test('M02: gestión de integrantes solo se muestra en su pestaña', () => {
  assert.ok(startMembers > endModules && endMembers > startMembers)
  const panel = source.slice(startMembers, endMembers)
  assert.match(panel, /<h2 className="text-lg font-semibold">Integrantes<\/h2>/)
  assert.match(panel, /<Pagination page=\{currentPage\}/)
  assert.match(panel, /setAdding\(true\)/)
  assert.match(panel, /changeMemberRole\(projectId/)
  assert.match(panel, /setMemberToRemove\(member\)/)
  assert.doesNotMatch(panel, /Abrir CNN|Abrir GAN|Abrir reportes/)
})

test('M02: controles originales preservan roles, acciones y modales', () => {
  assert.match(source, /isEngineer && project\.status === 'active'/)
  assert.match(source, /\{isResponsible && <Surface/)
  assert.match(source, /\{isMember && <Surface/)
  assert.match(source, /const canManage = \(admin \|\| isResponsible\)/)
  assert.match(source, /<MemberPermissionsModal/)
  assert.match(source, /<Modal open=\{adding\}/)
  assert.match(source, /<Modal open=\{archiving\}/)
  assert.match(source, /<Modal open=\{memberToRemove !== null\}/)
  // Los avisos de éxito/error no desaparecen al alternar pestañas.
  assert.ok(source.indexOf('{error && <Notice tone="error">', endModules) < startMembers)
  assert.ok(source.indexOf('{notice && <Notice tone="success">', endModules) < startMembers)
})

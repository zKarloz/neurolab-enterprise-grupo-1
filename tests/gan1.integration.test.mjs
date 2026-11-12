import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('GAN-1: ruta protegida, tarjeta de proyecto y constructor conectado', () => {
  const app = read('../src/app/App.tsx')
  const project = read('../src/features/projects/ProjectDetailPage.tsx')
  const page = read('../src/features/gan/GanPage.tsx')
  assert.match(app, /import \{ GanPage \}/)
  assert.match(app, /\/proyectos\/:projectId\/gan/)
  assert.match(project, /isMember && <Surface/)
  assert.match(project, /Abrir GAN/)
  assert.match(page, /listMembers\(projectId\)/)
  assert.match(page, /membership\?\.role === 'engineer'/)
  assert.match(page, /GanDiagram/)
})

test('GAN-1/GAN-4B: CSV y PNG locales; solo se guardan metadatos y resumen', () => {
  const page = read('../src/features/gan/GanPage.tsx')
  // GAN-4C publica G por servicio; ni el CSV ni los PNG se envían desde la pantalla.
  assert.doesNotMatch(page, /\.rpc\(|\.upload\(|tf\.train/)
  assert.match(page, /saveModelVersion/)
  assert.match(page, /createGanRun\(/)
  assert.match(page, /sha256LocalFile\(/)
  assert.match(page, /GanGenerationPanel/)
  assert.match(read('../src/features/gan/GanGenerationPanel.tsx'), /Todavía no hay un generador entrenado/)
})

test('GAN-1: documentación idempotente y fixture presentes', () => {
  assert.match(read('../scripts/gan1-documentation.mjs'), /previous\.includes\(heading\)/)
  assert.equal(read('./fixtures/gan1_imagenes_demo.csv').trimEnd().split('\n').length, 121)
})

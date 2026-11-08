import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('El selector compartido deja espacio interior para la flecha y se reutiliza', () => {
  const component = read('src/components/ui/SelectField.tsx')
  assert.match(component, /appearance-none/)
  assert.match(component, /pr-12/)
  assert.match(component, /right-4/)
  assert.match(read('src/features/projects/ProjectsPage.tsx'), /<SelectField/)
  assert.match(read('src/features/projects/ProjectDetailPage.tsx'), /<SelectField/)
})

test('Tema claro pastel, oscuro apagado y Punto de partida gris oscuro', () => {
  const css = read('src/styles/index.css')
  assert.match(css, /--accent: #[0-9a-f]{6}/i)
  assert.match(css, /--accent-secondary: #[0-9a-f]{6}/i)
  assert.match(css, /--hero-bg: #353535/)
  assert.match(read('src/features/home/HomePage.tsx'), /home-hero/)
})

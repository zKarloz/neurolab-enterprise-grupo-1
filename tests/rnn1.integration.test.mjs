import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('RNN-1: ruta privada y tarjeta de proyecto, sin introducir DB/RPC', () => {
  assert.match(file('src/app/App.tsx'), /<PrivateRoute/)
  assert.match(file('src/app/App.tsx'), /proyectos\/:projectId\/rnn/)
  assert.match(file('src/features/projects/ProjectDetailPage.tsx'), /isMember && <Surface[\s\S]*?Abrir RNN/)
  const page = file('src/features/rnn/RnnPage.tsx')
  assert.match(page, /membership\?\.role === 'engineer' && project\?\.status === 'active'/)
  assert.match(page, /if \(!self\)/)
  assert.doesNotMatch(page, /\.rpc\(|\.insert\(|\.update\(/)
})

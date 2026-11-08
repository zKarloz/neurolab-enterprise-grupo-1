import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/features/auth/AuthProvider.tsx', import.meta.url), 'utf8')

test('Auth se inicializa antes de registrar el listener', () => {
  assert.match(source, /await refresh\(\)[\s\S]*?onAuthStateChange\(/)
})

test('No se programan consultas de Auth con queueMicrotask', () => {
  assert.doesNotMatch(source, /queueMicrotask/)
  assert.match(source, /verificationTimer = setTimeout\(/)
})

test('El listener de Auth solo agenda la reverificación fuera del callback', () => {
  const body = source.match(/\.onAuthStateChange\(\(event, session\) => \{([\s\S]*?)\n      \}\)/)?.[1]
  assert.ok(body, 'No se encontró el listener de Auth')
  assert.match(body, /scheduleRefresh\(\)/)
  assert.doesNotMatch(body, /await\s|\.from\(|\.getUser\(|\.getSession\(/)
})

test('El listener cancela las reverificaciones pendientes al cerrar sesión', () => {
  assert.match(source, /event === 'SIGNED_OUT'[\s\S]*?clearTimeout\(verificationTimer\)/)
})

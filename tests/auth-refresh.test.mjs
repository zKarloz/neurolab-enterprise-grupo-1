import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verificationStarted, verificationUnavailable, signInIdentityChanged, isMissingAuthSession } from '../src/features/auth/refreshPolicy.ts'

const current = { status: 'ready', user: { id: 'A' }, profile: { id: 'A', status: 'active' } }

test('renovar token no debe apagar la ruta ni desmontar los datos del Ingeniero', () => {
  assert.equal(verificationStarted(current), current)
  assert.equal(signInIdentityChanged(current, 'A'), current)
})

test('antes del login se conserva pantalla de verificación', () => {
  assert.deepEqual(verificationStarted({ status: 'guest' }), { status: 'loading' })
})

test('otro usuario exige reautenticación y oculta contenidos anteriores', () => {
  assert.deepEqual(signInIdentityChanged(current, 'B'), { status: 'loading' })
})

test('un fallo transitorio de red no destruye el entrenamiento activo', () => {
  assert.equal(verificationUnavailable(current, 'Sin red'), current)
  assert.deepEqual(verificationUnavailable({ status: 'loading' }, 'Sin red'), { status: 'unavailable', message: 'Sin red' })
})

test('visitante sin sesión: AuthSessionMissingError se interpreta como login, no caída del servicio', () => {
  assert.equal(isMissingAuthSession({ name: 'AuthSessionMissingError', status: 400 }), true)
  assert.equal(isMissingAuthSession({ name: 'AuthApiError', status: 400 }), false)
  assert.equal(isMissingAuthSession({ name: 'AuthApiError', status: 503 }), false)
  assert.equal(isMissingAuthSession(null), false)
})

// Prueba de preferencias de interfaz: no necesita Supabase ni DOM.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  readProjectModuleExpansion,
  saveProjectModuleExpansion,
  clearProjectModulePreferences,
} from '../src/lib/projectModulePreferences.ts'

const projectSource = readFileSync('src/features/projects/ProjectDetailPage.tsx', 'utf8')
const authSource = readFileSync('src/features/auth/AuthProvider.tsx', 'utf8')

function sessionStorageMock() {
  const entries = new Map()
  return {
    get length() { return entries.size },
    key(index) { return [...entries.keys()][index] ?? null },
    getItem(key) { return entries.get(key) ?? null },
    setItem(key, value) { entries.set(key, String(value)) },
    removeItem(key) { entries.delete(key) },
  }
}

function withStorage(run) {
  const previous = globalThis.window
  const store = sessionStorageMock()
  globalThis.window = { sessionStorage: store }
  try { run(store) } finally {
    if (previous === undefined) delete globalThis.window
    else globalThis.window = previous
  }
}

test('M02: ambas secciones comienzan cerradas en una sesión sin preferencias', () => {
  withStorage(() => {
    assert.deepEqual(readProjectModuleExpansion('user-a', 'project-a'), { algorithms: false, management: false })
  })
})

test('M02: guardar una o ambas secciones se conserva al volver o recargar', () => {
  withStorage(() => {
    saveProjectModuleExpansion('user-a', 'project-a', { algorithms: true, management: false })
    assert.deepEqual(readProjectModuleExpansion('user-a', 'project-a'), { algorithms: true, management: false })
    saveProjectModuleExpansion('user-a', 'project-a', { algorithms: true, management: true })
    assert.deepEqual(readProjectModuleExpansion('user-a', 'project-a'), { algorithms: true, management: true })
    saveProjectModuleExpansion('user-a', 'project-a', { algorithms: false, management: true })
    assert.deepEqual(readProjectModuleExpansion('user-a', 'project-a'), { algorithms: false, management: true })
  })
})

test('M02: preferencias aisladas entre proyectos y cuentas', () => {
  withStorage(() => {
    saveProjectModuleExpansion('user-a', 'project-a', { algorithms: true, management: true })
    assert.deepEqual(readProjectModuleExpansion('user-a', 'project-b'), { algorithms: false, management: false })
    assert.deepEqual(readProjectModuleExpansion('user-b', 'project-a'), { algorithms: false, management: false })
    assert.deepEqual(readProjectModuleExpansion('', 'project-a'), { algorithms: false, management: false })
  })
})

test('M02: cerrar sesión elimina únicamente estas preferencias', () => {
  withStorage((store) => {
    store.setItem('other:setting', 'preserve')
    saveProjectModuleExpansion('user-a', 'project-a', { algorithms: true, management: true })
    saveProjectModuleExpansion('user-b', 'project-b', { algorithms: false, management: true })
    clearProjectModulePreferences()
    assert.deepEqual(readProjectModuleExpansion('user-a', 'project-a'), { algorithms: false, management: false })
    assert.deepEqual(readProjectModuleExpansion('user-b', 'project-b'), { algorithms: false, management: false })
    assert.equal(store.getItem('other:setting'), 'preserve')
  })
})

test('M02: JSON inválido y almacenamiento bloqueado nunca rompen la pantalla', () => {
  withStorage((store) => {
    saveProjectModuleExpansion('user-a', 'project-a', { algorithms: true, management: true })
    const key = store.key(0)
    store.setItem(key, '{broken')
    assert.deepEqual(readProjectModuleExpansion('user-a', 'project-a'), { algorithms: false, management: false })
    store.setItem(key, '{"algorithms":"true","management":true}')
    assert.deepEqual(readProjectModuleExpansion('user-a', 'project-a'), { algorithms: false, management: true })
  })
  const previous = globalThis.window
  globalThis.window = { get sessionStorage() { throw Error('Blocked') } }
  try {
    assert.deepEqual(readProjectModuleExpansion('x', 'y'), { algorithms: false, management: false })
    assert.doesNotThrow(() => saveProjectModuleExpansion('x', 'y', { algorithms: true, management: true }))
    assert.doesNotThrow(() => clearProjectModulePreferences())
  } finally {
    if (previous === undefined) delete globalThis.window
    else globalThis.window = previous
  }
})

test('M02: el detalle mantiene los paneles y escribe preferencia al pulsar cada subtítulo', () => {
  assert.match(projectSource, /readProjectModuleExpansion\(currentUserId, projectId\)/)
  assert.match(projectSource, /saveProjectModuleExpansion\(currentUserId, projectId, next\)/)
  assert.match(projectSource, /toggleModuleSection\('algorithms'\)/)
  assert.match(projectSource, /toggleModuleSection\('management'\)/)
  for (const panel of ['algorithms', 'management']) {
    assert.ok(projectSource.includes(`id="project-modules-${panel}"`))
  }
  assert.match(projectSource, /aria-expanded=\{algorithmsOpen\}/)
  assert.match(projectSource, /aria-expanded=\{managementOpen\}/)
})

test('M02: el cierre de sesión y la autenticación sin sesión limpian preferencias', () => {
  assert.match(authSource, /if \(event === 'SIGNED_OUT'\) \{\s*clearProjectModulePreferences\(\)/)
  assert.match(authSource, /const signOut = useCallback[\s\S]*?clearProjectModulePreferences\(\)/)
  assert.match(authSource, /if \(!identity\.user\) \{\s*clearProjectModulePreferences\(\)/)
  assert.match(authSource, /if \(isMissingAuthSession\(identityError\)\) \{\s*clearProjectModulePreferences\(\)/)
})

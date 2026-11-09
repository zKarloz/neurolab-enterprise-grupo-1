import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { parseThemePreference, resolveTheme } from '../src/app/themePreferences.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const load = (p) => readFileSync(resolve(root, p), 'utf8')

test('los módulos que utiliza UserMenu existen con los nombres exactos', () => {
  assert.ok(existsSync(resolve(root, 'src/app/ThemeProvider.tsx')))
  assert.ok(existsSync(resolve(root, 'src/app/themePreferences.ts')))
  assert.ok(existsSync(resolve(root, 'src/components/layout/UserMenu.tsx')))
})

test('el tema claro sigue siendo el predeterminado', () => {
  assert.equal(parseThemePreference(null), 'light')
  assert.equal(parseThemePreference('dark'), 'dark')
  assert.equal(parseThemePreference('system'), 'system')
  assert.equal(parseThemePreference('otro'), 'light')
})

test('la preferencia Sistema sigue los cambios de apariencia del SO', () => {
  assert.equal(resolveTheme('system', true), 'dark')
  assert.equal(resolveTheme('system', false), 'light')
  assert.equal(resolveTheme('light', true), 'light')
  assert.equal(resolveTheme('dark', false), 'dark')
})

test('ThemeProvider ofrece exactamente el contrato usado por UserMenu', () => {
  const provider = load('src/app/ThemeProvider.tsx')
  const menu = load('src/components/layout/UserMenu.tsx')
  assert.match(provider, /setTheme:\s*\(next:\s*ThemeMode\)\s*=>\s*void/)
  assert.match(provider, /value=\{\{\s*theme,\s*resolvedTheme,\s*setTheme,\s*toggleTheme\s*\}\}/)
  assert.match(menu, /const\s*\{\s*theme,\s*setTheme\s*\}\s*=\s*useTheme\(\)/)
  assert.match(provider, /addEventListener\('change', update\)/)
  assert.match(provider, /removeEventListener\('change', update\)/)
})

test('los import locales del menú y el proveedor resuelven con mayúsculas exactas', () => {
  const menu = load('src/components/layout/UserMenu.tsx')
  const provider = load('src/app/ThemeProvider.tsx')
  for (const ref of [
    /from '\.\.\/\.\.\/app\/ThemeProvider'/,
    /from '\.\.\/\.\.\/app\/themePreferences'/,
  ]) assert.match(menu, ref)
  assert.match(provider, /from '\.\/themePreferences'/)
})

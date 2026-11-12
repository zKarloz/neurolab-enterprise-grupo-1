import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/features/home/HomePage.tsx', import.meta.url), 'utf8')
const service = readFileSync(new URL('../src/services/dashboard.ts', import.meta.url), 'utf8')

test('M01: incluye las tres áreas exigidas por el documento maestro', () => {
  assert.match(page, /Resumen de proyectos/)
  assert.match(page, /Entrenamientos recientes/)
  assert.match(page, /Indicadores de uso/)
  assert.match(page, /Alertas y estado/)
})

test('M01: utiliza paginación, indicadores de carga y navegación compartidos', () => {
  assert.match(page, /<Pagination/)
  assert.match(page, /<Spinner/)
  assert.match(page, /<Surface/)
  assert.match(page, /<Notice/)
  assert.match(page, /<Link/)
})

test('M01: las estadísticas provienen de consultas RLS exactas y no de valores ficticios', () => {
  assert.match(service, /from\('training_runs'\)/)
  assert.match(service, /count: 'exact', head: true/g)
  assert.match(service, /from\('architectures'\)/)
  assert.match(service, /listProjects\(\)/)
  assert.doesNotMatch(service, /\.insert\(|\.upsert\(|\.update\(|\.delete\(|service_role|sb_secret_|localStorage/)
})

test('M01: un fallo de consulta no se disfraza como contador cero', () => {
  assert.match(service, /count === null/)
  assert.match(page, /setSnapshot\(null\)/)
})

test('M01: la documentación advierte que el estado remoto no es monitoreo en vivo', () => {
  assert.match(page, /no garantiza que un Worker siga activo/i)
  assert.match(page, /Administrador global necesita membresía explícita/)
})

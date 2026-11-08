/**
 * Smoke test HTTP de Vercel para una SPA Vite. Comprueba únicamente que
 * el servidor entrega el HTML en las rutas públicas y profundas, NO valida
 * permisos Auth/RLS (esas comprobaciones deben hacerse desde el navegador).
 *
 * Uso: node scripts/verify-deployment.mjs https://TU-SITIO.vercel.app
 */
import assert from 'node:assert/strict'

const origin = process.argv[2]
assert.ok(origin, 'Indica la URL de Vercel como argumento')
const url = new URL(origin)
assert.equal(url.protocol, 'https:', 'La URL desplegada debe ser HTTPS')

for (const path of ['/', '/acceder', '/cuenta', '/inicio']) {
  const result = await fetch(new URL(path, url), { redirect: 'follow' })
  assert.equal(result.status, 200, `${path} respondió HTTP ${result.status}`)
  const contentType = result.headers.get('content-type') ?? ''
  assert.ok(contentType.includes('text/html'), `${path} no devolvió HTML`)
  const html = await result.text()
  assert.match(html, /<div\s+id=["']root["']/, `${path} no parece el HTML de la SPA`)
  console.log(`✓ ${path}: HTML de la SPA disponible (HTTP 200)`)
}
console.log('\nSmoke test HTTP aprobado. Verifica Auth, RLS y navegación real en el navegador.')

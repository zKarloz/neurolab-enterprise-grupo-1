/** Pruebas offline del actualizador del acta (sin conexión a Vercel ni Supabase). */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, mkdir, writeFile, rm, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { integrateDocument } from '../tools/actualizar-cierre-documental-fase6.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = path.join(ROOT, 'tools/actualizar-cierre-documental-fase6.mjs')
const SECTION = path.join(ROOT, 'tools/fase6-cierre-documental-section.md')
const CONTENT = await readFile(SECTION, 'utf8')

for (const nl of ['\n', '\r\n']) {
  test(`el anexo se agrega sin borrar texto y es idempotente con ${nl === '\n' ? 'LF' : 'CRLF'}`, () => {
    const doc = `# Fase 6${nl}${nl}Contenido previo.${nl}`
    const first = integrateDocument(doc, CONTENT)
    assert.equal(first.changed, true)
    assert.ok(first.text.startsWith(doc.trimEnd()))
    assert.ok(first.text.includes('87 OK, 1 OMITIDA, 0 errores'))
    assert.equal((first.text.match(/<!-- FASE6-CIERRE-DOCUMENTAL-20261109 -->/g) || []).length, 1)
    assert.equal(first.text.includes('\r\n'), nl === '\r\n')
    const second = integrateDocument(first.text, CONTENT)
    assert.equal(second.changed, false)
    assert.equal(second.text, first.text)
  })
}

test('se rechaza anexo existente con cambios y evita reemplazarlo', () => {
  const initial = integrateDocument('# Fase 6\n', CONTENT).text
  assert.throws(() => integrateDocument(initial.replace('87 OK', '88 OK'), CONTENT), /modificado/)
})

test('se rechazan marcas incompletas, duplicadas y documento vacío', () => {
  assert.throws(() => integrateDocument('<!-- FASE6-CIERRE-DOCUMENTAL-20261109 -->', CONTENT), /incompleta/)
  const twice = integrateDocument('# Fase 6\n', CONTENT).text + CONTENT
  assert.throws(() => integrateDocument(twice, CONTENT), /duplicadas/)
  assert.throws(() => integrateDocument('  \n', CONTENT), /vacío/)
})

test('el anexo incluye estado condicionado y no declara Auth restaurado', () => {
  assert.match(CONTENT, /cierre operativo CONDICIONADO/)
  assert.match(CONTENT, /restauración integral.*PENDIENTE/i)
  assert.match(CONTENT, /RPO.*RTO/)
  assert.match(CONTENT, /CNN.*RNN.*GAN/)
  assert.match(CONTENT, /2 posibles/)
})

test('verificación CLI no modifica documento y ejecución repetida no duplica', async (t) => {
  const temp = await mkdtemp(path.join(tmpdir(), 'neuro-f6-cierre-'))
  t.after(async () => rm(temp, { recursive: true, force: true }))
  await mkdir(path.join(temp, 'tools'))
  await mkdir(path.join(temp, '.git'))
  await mkdir(path.join(temp, 'docs', 'operations'), { recursive: true })
  await writeFile(path.join(temp, 'package.json'), '{}')
  await copyFile(SCRIPT, path.join(temp, 'tools', path.basename(SCRIPT)))
  await copyFile(SECTION, path.join(temp, 'tools', path.basename(SECTION)))
  const doc = path.join(temp, 'docs', 'operations', 'FASE_6_COMPLEMENTOS.md')
  await writeFile(doc, '# Fase 6\r\n\r\nBase previamente documentada.\r\n')
  const call = (...args) => spawnSync(process.execPath, [path.join(temp, 'tools', path.basename(SCRIPT)), ...args], { encoding: 'utf8' })
  const pre = await readFile(doc)
  const check = call('--check')
  assert.equal(check.status, 0, check.stderr)
  assert.deepEqual(await readFile(doc), pre)
  assert.equal(call().status, 0)
  const updated = await readFile(doc, 'utf8')
  assert.ok(updated.includes('Base previamente documentada.'))
  assert.equal(call().status, 0)
  assert.equal(await readFile(doc, 'utf8'), updated)
})

test('CLI rechaza carpetas que no son el repositorio sin cambiar archivos', async (t) => {
  const temp = await mkdtemp(path.join(tmpdir(), 'neuro-f6-fuera-'))
  t.after(async () => rm(temp, { recursive: true, force: true }))
  await mkdir(path.join(temp, 'tools'))
  await copyFile(SCRIPT, path.join(temp, 'tools', path.basename(SCRIPT)))
  const run = spawnSync(process.execPath, [path.join(temp, 'tools', path.basename(SCRIPT)), '--check'], { encoding: 'utf8' })
  assert.equal(run.status, 1)
  assert.match(run.stderr, /repositorio Git/)
})

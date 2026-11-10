#!/usr/bin/env node
/**
 * Instalador CNN-2 transaccional: comprueba SHA de la versión exacta de CNN-1
 * antes de escribir. Preserva CRLF en Windows, evita duplicados y verifica
 * que Git realmente contenga todos los archivos que Vercel necesitará.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = process.cwd()
const pack = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const payload = path.join(pack, 'cnn2-payload')
const manifest = JSON.parse(readFileSync(path.join(pack, 'cnn2-manifest.json'), 'utf8'))
const args = process.argv.slice(2)
if (args.some((arg) => !['--check','--git-check'].includes(arg)) || (args.includes('--check') && args.includes('--git-check'))) {
  console.error('Uso: node tools/instalar-cnn2.mjs [--check|--git-check]')
  process.exit(2)
}
const isCheck = args.includes('--check')
const isGitCheck = args.includes('--git-check')
const normalized = (str) => str.replace(/\r\n/g, '\n')
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex')
const hashText = (txt) => hash(Buffer.from(normalized(txt)))
const absolute = (file) => path.join(root, file)
const fail = (message) => { throw new Error(message) }
const isSame = (file, expected) => existsSync(absolute(file)) && hashText(readFileSync(absolute(file),'utf8')) === expected
const codeSource = 'src/features/cnn/CnnPage.tsx'
const docTarget = 'docs/operations/FASE_7_ARQUITECTURAS.md'
const docSource = 'docs/operations/FASE_7_CNN2_SECTION.md'
const docMarker = '## Incremento CNN-2 · Entrenamiento MNIST real en navegador'
const newFiles = manifest.files.map((entry) => entry.path).filter((file) => file !== codeSource && file !== docSource)
const staged = [codeSource, docTarget, ...newFiles, 'tools/instalar-cnn2.mjs']

function gitIndexCheck() {
  const repo = spawnSync('git', ['rev-parse','--show-toplevel'], { cwd:root,encoding:'utf8' })
  if (repo.status !== 0 || path.resolve(repo.stdout.trim()) !== path.resolve(root)) fail('Ejecuta Git desde la raíz de neurolab-enterprise-grupo-1.')
  const missing=[]
  for (const file of staged) {
    if (!existsSync(absolute(file))) { missing.push(`No existe ${file}`); continue }
    const current = spawnSync('git',['show',`:${file}`],{cwd:root,encoding:null})
    if (current.status !== 0) { missing.push(`Falta git add: ${file}`); continue }
    if (normalized(current.stdout.toString('utf8')) !== normalized(readFileSync(absolute(file),'utf8'))) {
      missing.push(`Git contiene una versión diferente: ${file}`)
    }
  }
  if (missing.length) fail(missing.join('\n'))
  console.log(`OK · Git contiene los ${staged.length} archivos de CNN-2 que requiere Vercel.`)
}

try {
  if (!existsSync(absolute('package.json')) || !existsSync(absolute('src/main.tsx'))) fail('Entra en la raíz de neurolab-enterprise-grupo-1, no en NeuroLab-Restore-Local.')
  if (isGitCheck) { gitIndexCheck(); process.exit(0) }
  if (manifest.name !== 'NeuroLab CNN-2' || !Array.isArray(manifest.files)) fail('Manifiesto CNN-2 inválido.')
  const entries = new Map(manifest.files.map((entry) => [entry.path, entry.sha256]))
  for (const [file, expected] of entries) {
    const source = path.join(payload,file)
    if (!existsSync(source) || hash(readFileSync(source)) !== expected) fail(`El ZIP está incompleto o modificado: ${file}`)
  }
  // Las dependencias CNN-1 no se sustituyen: se exigen exactamente en su versión validada.
  for (const file of ['src/ml/cnn/architecture.ts','src/ml/cnn/mnistPreview.ts']) {
    if (!isSame(file,manifest.sourceSha256[file])) fail(`${file} no coincide con CNN-1 corregido; operación cancelada.`)
  }
  const writes=[]
  const actualFile = existsSync(absolute(codeSource)) ? readFileSync(absolute(codeSource),'utf8') : fail(`Falta ${codeSource}`)
  const targetText = readFileSync(path.join(payload,codeSource),'utf8')
  const currentHash = hashText(actualFile)
  const targetHash = hashText(targetText)
  if (currentHash !== targetHash) {
    if (currentHash !== manifest.sourceSha256[codeSource]) fail(`${codeSource} cambió desde CNN-1. No se sobrescribirán tus modificaciones.`)
    writes.push({ file: codeSource, before: readFileSync(absolute(codeSource)), after: Buffer.from(actualFile.includes('\r\n') ? normalized(targetText).replace(/\n/g,'\r\n') : targetText) })
  }
  for (const file of newFiles) {
    const after = readFileSync(path.join(payload,file))
    if (existsSync(absolute(file))) {
      const before = readFileSync(absolute(file))
      if (hashText(before.toString('utf8')) !== hashText(after.toString('utf8'))) fail(`El archivo nuevo ${file} ya existe con cambios distintos; no se sobrescribirá.`)
    } else writes.push({file,before:null,after})
  }
  if (!existsSync(absolute(docTarget))) fail(`Falta ${docTarget}; el documento de CNN-1 debería existir.`)
  const originalDoc = readFileSync(absolute(docTarget),'utf8')
  if (!originalDoc.includes('# NeuroLab Enterprise') || !originalDoc.includes('Incremento CNN-1')) fail('Documento de arquitecturas distinto del esperado; no se añadirá la sección.')
  if (!originalDoc.includes(docMarker)) {
    const extra = readFileSync(path.join(payload,docSource),'utf8')
    const merged = normalized(originalDoc).trimEnd() + '\n' + normalized(extra)
    writes.push({file:docTarget,before:readFileSync(absolute(docTarget)),after:Buffer.from(originalDoc.includes('\r\n') ? merged.replace(/\n/g,'\r\n') : merged)})
  }
  if (isCheck) console.log(`OK · CNN-2 compatible · ${writes.length} archivos por instalar/actualizar · sin modificaciones.`)
  else {
    const done=[]
    try {
      for (const item of writes) {
        mkdirSync(path.dirname(absolute(item.file)),{recursive:true})
        writeFileSync(absolute(item.file),item.after)
        done.push(item)
        console.log(`INSTALADO · ${item.file}`)
      }
    } catch (error) {
      for (const item of done.reverse()) {
        if (item.before===null) unlinkSync(absolute(item.file))
        else writeFileSync(absolute(item.file),item.before)
      }
      throw error
    }
    console.log('OK · CNN-2 instalado. Ejecuta pruebas, typecheck, build y --git-check antes de publicar.')
  }
} catch (error) {
  console.error('INCOMPATIBLE ·',error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}

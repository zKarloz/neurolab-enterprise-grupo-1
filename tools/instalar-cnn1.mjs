#!/usr/bin/env node
/**
 * NeuroLab CNN-1: instalador transaccional y conservador para versiones conocidas.
 * Revisa SHA-256 normalizado de todos los archivos existentes antes de escribir.
 * No modifica políticas, SQL, Auth ni dependencias. Git --git-check comprueba el index.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const baseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const payloadDir = path.join(baseDir, 'cnn1-payload')
const check = process.argv.includes('--check')
const gitCheck = process.argv.includes('--git-check')
const args = process.argv.slice(2)
if (args.some((arg) => !['--check', '--git-check'].includes(arg)) || (check && gitCheck)) {
  console.error('Uso: node tools/instalar-cnn1.mjs [--check|--git-check]')
  process.exit(2)
}

const normalize = (s) => s.replace(/\r\n/g, '\n')
const hash = (s) => createHash('sha256').update(normalize(s)).digest('hex')
const p = (relative) => path.join(root, relative)
const read = (relative) => readFileSync(p(relative), 'utf8')
const fail = (msg) => { throw new Error(msg) }
const originals = {
  'src/app/App.tsx': '4e6057bfcea469a65c10ac233146cceb1a21c8065150374e3575c757d99ae52a',
  'src/components/layout/backNavigation.ts': '0caa0eb92a4c0338fcf336376d3af42d2a3b4c4bf45f3e6bf1fbbdff9b28f4fb',
  'src/features/projects/ProjectDetailPage.tsx': '7ca298f5528fc39403fb33924f07d90c6bf30aa9d40b80e565346138f22b190e',
}

const installedHashes = {
  'src/app/App.tsx': '5eae77780ab37cdb642db349b4fb81a2e8e91a19e386f152a4693461d3f3d9b5',
  'src/components/layout/backNavigation.ts': 'e52092b0790a215c7984765f17de75560645b04afe4f253dd683375aa8d47fb3',
  'src/features/projects/ProjectDetailPage.tsx': '379526a9e00ed88dd697b028ae41efa4ca9d83ec48c73bde85f95a24e2803de7',
}

const newFiles = [
  'src/ml/cnn/architecture.ts',
  'src/ml/cnn/mnistPreview.ts',
  'src/components/ui/Tabs.tsx',
  'src/features/cnn/CnnDiagram.tsx',
  'src/features/cnn/CnnPage.tsx',
  'tests/cnn1.architecture.test.mjs',
  'tests/cnn1.mnist.test.mjs',
  'docs/operations/FASE_7_ARQUITECTURAS.md',
]

const exactReplace = (text, needle, replacement, file) => {
  if (text.split(needle).length !== 2) fail(`${file}: no se encontró un único anclaje compatible; no se aplicó ningún cambio.`)
  return text.replace(needle, replacement)
}

function transformApp(text) {
  text = exactReplace(text,
    "import { ProjectDetailPage } from '../features/projects/ProjectDetailPage'",
    "import { ProjectDetailPage } from '../features/projects/ProjectDetailPage'\nimport { CnnPage } from '../features/cnn/CnnPage'",
    'App.tsx')
  return exactReplace(text,
    '<Route path="/proyectos/:projectId" element={<ProjectDetailPage />} />',
    '<Route path="/proyectos/:projectId" element={<ProjectDetailPage />} />\n          <Route path="/proyectos/:projectId/cnn" element={<CnnPage />} />',
    'App.tsx')
}

function transformBack(text) {
  return exactReplace(text,
    "'auditoria'])",
    "'auditoria', 'cnn'])",
    'backNavigation.ts')
}

function transformProject(text) {
  text = exactReplace(text,
    'import { Archive,',
    'import { Layers3, Archive,',
    'ProjectDetailPage.tsx')
  const anchor = '      {isMember && <Surface className="p-5 sm:p-7"><h2 className="text-lg font-semibold">Evaluación e historial</h2>'
  const card = [
    '      {/* CNN-1 muestra la configuración sólo a los integrantes del proyecto. */}',
    '      {isMember && <Surface className="p-5 sm:p-7">',
    '        <div className="flex items-center gap-2"><Layers3 size={19} /><h2 className="text-lg font-semibold">Red convolucional · CNN</h2></div>',
    '        <p className="mt-2 text-sm text-[var(--muted)]">Explora muestras reales de MNIST y configura visualmente capas Conv2D, pooling y Dense. Entrenamiento en CNN-2.</p>',
    '        <Link to={`/proyectos/${projectId}/cnn`} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)]"><Layers3 size={16}/> Abrir CNN</Link>',
    '      </Surface>}',
    '',
  ].join('\n')
  return exactReplace(text, anchor, card + anchor, 'ProjectDetailPage.tsx')
}
const transforms = {
  'src/app/App.tsx': transformApp,
  'src/components/layout/backNavigation.ts': transformBack,
  'src/features/projects/ProjectDetailPage.tsx': transformProject,
}

const filesToStage = [...Object.keys(originals), ...newFiles, 'tools/instalar-cnn1.mjs']
function gitIndexCheck() {
  const rootProcess = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' })
  if (rootProcess.status !== 0 || path.resolve(rootProcess.stdout.trim()) !== path.resolve(root)) fail('Ejecuta --git-check en la raíz del repositorio.')
  const problems = []
  for (const file of filesToStage) {
    if (!existsSync(p(file))) { problems.push(`Falta archivo: ${file}`); continue }
    const staged = spawnSync('git', ['show', `:${file}`], { cwd: root, encoding: null })
    if (staged.status !== 0) { problems.push(`Falta git add: ${file}`); continue }
    if (normalize(staged.stdout.toString('utf8')) !== normalize(read(file))) problems.push(`Git no contiene los últimos cambios: ${file}`)
  }
  if (problems.length) fail(problems.join('\n'))
  console.log(`OK · Los ${filesToStage.length} archivos están preparados en Git, sin omisiones.`)
}

try {
  if (!existsSync(p('src/main.tsx')) || !existsSync(p('package.json'))) fail('Abre Git Bash en la raíz del repositorio NeuroLab (no en NeuroLab-Restore-Local).')
  if (gitCheck) { gitIndexCheck(); process.exit(0) }
  const modifications = []
  for (const [file, expectedHash] of Object.entries(originals)) {
    if (!existsSync(p(file))) fail(`Falta ${file}`)
    const before = read(file)
    const beforeHash = hash(before)
    if (beforeHash === expectedHash) {
      const updated = transforms[file](normalize(before))
      modifications.push({ file, before, updated, mode: 'update' })
    } else {
      if (installedHashes[file] !== beforeHash) {
        fail(`${file} no coincide con el SHA-256 de la versión aprobada (${beforeHash}). Detenido para no pisar cambios nuevos.`)
      }
    }
  }
  const manifestPath = path.join(baseDir, 'cnn1-manifest.json')
  if (!existsSync(manifestPath)) fail('Falta cnn1-manifest.json; extrae el ZIP completo.')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.name !== 'NeuroLab CNN-1' || !Array.isArray(manifest.files)) fail('Manifiesto CNN-1 incompatible.')
  const expectedFiles = new Map(manifest.files.map((entry) => [entry.path, entry.sha256]))
  for (const file of newFiles) {
    const source = path.join(payloadDir, file)
    if (!existsSync(source)) fail(`Paquete incompleto: ${file}`)
    const bytes = readFileSync(source)
    if (createHash('sha256').update(bytes).digest('hex') !== expectedFiles.get(file)) fail(`SHA-256 inválido en payload: ${file}`)
  }
  for (const file of newFiles) {
    const source = path.join(payloadDir, file)
    if (!existsSync(source)) fail(`Paquete incompleto: ${file}`)
    const updated = readFileSync(source)
    if (!updated.length) fail(`Paquete vacío: ${file}`)
    if (existsSync(p(file))) {
      const current = readFileSync(p(file))
      if (!current.equals(updated) && hash(current.toString('utf8')) !== hash(updated.toString('utf8'))) fail(`Ya existe ${file} con contenido distinto; no se reemplazará.`)
    } else modifications.push({ file, before: null, updated, mode: 'new' })
  }
  if (check) {
    console.log(`OK · Integración CNN-1 compatible · ${modifications.length} archivos pendientes; ninguno modificado.`)
  } else {
    const written = []
    try {
      for (const { file, before, updated } of modifications) {
        mkdirSync(path.dirname(p(file)), { recursive: true })
        if (typeof updated === 'string') {
          // Conserva CRLF de Windows en archivos ya existentes.
          const value = before?.includes('\r\n') ? updated.replace(/\n/g, '\r\n') : updated
          writeFileSync(p(file), value)
        } else writeFileSync(p(file), updated)
        written.push({ file, before })
        console.log(`INSTALADO · ${file}`)
      }
    } catch (error) {
      for (const { file, before } of written.reverse()) {
        if (before === null) unlinkSync(p(file))
        else writeFileSync(p(file), before)
      }
      throw error
    }
    console.log('OK · CNN-1 instalado. Ejecuta tests, typecheck, build y --git-check antes de publicar.')
  }
} catch (error) {
  console.error('INCOMPATIBLE ·', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}

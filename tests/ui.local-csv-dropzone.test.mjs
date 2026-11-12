import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { selectLocalCsv } from '../src/components/ui/csvFileSelection.ts'

const source = (relativePath) => readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8')

// El contrato funciona sin DOM y no altera el contenido de los archivos.
test('CSV: acepta solo un archivo con extensión .csv, sin importar mayúsculas', () => {
  const file = { name: 'Digitos_8x8.CSV', size: 123 }
  assert.deepEqual(selectLocalCsv([file]), { ok: true, file })
  assert.deepEqual(selectLocalCsv([{ name: 'serie.csv' }]).ok, true)
})

test('CSV: rechaza archivos vacíos, múltiples o extensiones ajenas', () => {
  assert.match(selectLocalCsv([]).error, /Selecciona/)
  assert.match(selectLocalCsv([{ name: 'a.csv' }, { name: 'b.csv' }]).error, /un solo/)
  assert.match(selectLocalCsv([{ name: 'imagen.png' }]).error, /\.csv/)
  assert.match(selectLocalCsv([{ name: 'datos.csv.exe' }]).error, /\.csv/)
})

test('La zona compartida admite clic, teclado, drag-and-drop y evita abrir archivos al soltarlos', () => {
  const ui = source('src/components/ui/LocalCsvDropzone.tsx')
  assert.match(ui, /type="file"/)
  assert.match(ui, /htmlFor=\{id\}/)
  assert.match(ui, /peer-focus-visible/)
  assert.match(ui, /onDragEnter=\{onDragEnter\}/)
  assert.match(ui, /onDragOver=\{onDragOver\}/)
  assert.match(ui, /onDrop=\{onDrop\}/)
  assert.match(ui, /event\.preventDefault\(\)/)
  assert.match(ui, /if \(!blocked\) acceptFiles/)
  assert.match(ui, /selectionError/)
  assert.match(ui, /event\.currentTarget\.value = ''/)
})

test('Las cuatro familias reutilizan el mismo importador visual sin modificar el parser CSV', () => {
  for (const [path, id] of [
    ['src/features/datasets/LocalDatasetPage.tsx', 'csv-file'],
    ['src/features/cnn/CnnPage.tsx', 'cnn-upload-csv'],
    ['src/features/rnn/RnnPage.tsx', 'rnn-local-file'],
    ['src/features/gan/GanPage.tsx', 'gan-csv'],
  ]) {
    const page = source(path)
    assert.match(page, /import \{ LocalCsvDropzone \}/, path)
    assert.ok(page.includes(`<LocalCsvDropzone id="${id}"`), path)
    assert.match(page, /onFile=\{/)
    assert.ok(!page.includes(`id="${id}" type="file"`), path)
  }
})

test('Los bloqueos por entrenamiento y por permisos permanecen conectados al componente', () => {
  assert.match(source('src/features/datasets/LocalDatasetPage.tsx'), /disabled=\{busy \|\| trainingBusy\}/)
  assert.match(source('src/features/rnn/RnnPage.tsx'), /disabled=\{!canEdit \|\| loading \|\| busy\}/)
  assert.match(source('src/features/gan/GanPage.tsx'), /disabled=\{!canEdit \|\| loading \|\| locked\}/)
  assert.match(source('src/features/cnn/CnnPage.tsx'), /disabled=\{disabled \|\| loading\}/)
})

// Evita un conflicto de resolución: en Windows, un .ts con el mismo nombre
// (sin distinguir mayúsculas) que el componente .tsx oculta su exportación.
test('CSV: componente TSX y validador TS tienen nombres distintos en Windows', () => {
  const files = [
    'src/components/ui/LocalCsvDropzone.tsx',
    'src/components/ui/csvFileSelection.ts',
  ]
  const names = files.map((item) => item.split('/').at(-1).replace(/\.tsx?$/, '').toLowerCase())
  assert.equal(new Set(names).size, files.length)
  assert.match(source(files[0]), /from '\.\/csvFileSelection\.ts'/)
  assert.match(source(files[1]), /export function selectLocalCsv/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const comparison = readFileSync('src/features/evaluation/RunComparison.tsx', 'utf8')
const css = readFileSync('src/styles/index.css', 'utf8')

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map((part) => parseInt(part, 16) / 255)
  const [r, g, b] = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(first, second) {
  const levels = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (levels[0] + 0.05) / (levels[1] + 0.05)
}

function themeValue(theme, variable) {
  const match = css.match(new RegExp(`${theme}\\s*\\{([\\s\\S]*?)\\}`))
  assert.ok(match, `No se encontró ${theme}`)
  const declaration = match[1].match(new RegExp(`${variable}:\\s*(#[a-fA-F0-9]{6})`))
  assert.ok(declaration, `No se encontró ${variable} en ${theme}`)
  return declaration[1]
}

test('las columnas A y B utilizan los mismos tokens que las líneas de la gráfica', () => {
  assert.match(comparison, /dataKey="first"[^>]*stroke="var\(--chart-train\)"/)
  assert.match(comparison, /dataKey="second"[^>]*stroke="var\(--chart-validation\)"/)
  assert.equal((comparison.match(/text-\[var\(--chart-train\)\]/g) ?? []).length, 4)
  assert.equal((comparison.match(/text-\[var\(--chart-validation\)\]/g) ?? []).length, 4)
})

test('los colores de las columnas tienen contraste AA para texto normal en ambos temas', () => {
  for (const [theme, background] of [[':root', '#ffffff'], [':root.dark', '#202020']]) {
    for (const variable of ['--chart-train', '--chart-validation']) {
      const color = themeValue(theme.replace('.', '\\.'), variable)
      assert.ok(contrast(color, background) >= 4.5, `${theme}: ${variable} tiene contraste insuficiente`)
    }
  }
})

test('las etiquetas A/B no dependen únicamente del color', () => {
  assert.match(comparison, /A · \{labels\[0\]\}/)
  assert.match(comparison, /B · \{labels\[1\]\}/)
})

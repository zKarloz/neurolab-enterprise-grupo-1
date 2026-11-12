import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Agrega la documentación RNN-1 al único Markdown de Fase 7, de forma idempotente. */
const file = resolve('docs/operations/FASE_7_ARQUITECTURAS.md')
const marker = '<!-- RNN1_INICIO -->'
const text = readFileSync(file, 'utf8')
if (text.includes(marker)) {
  console.log('RNN-1 ya está documentada; sin cambios.')
  process.exit(0)
}
const lines = [
  marker,
  '## RNN-1 — Datos y arquitectura secuencial',
  '',
  '**Estado:** preparado para validación local y Vercel, no constituye entrenamiento.',
  '',
  '- Ruta privada `/proyectos/:projectId/rnn` con control de membresía: el Admin global no es un integrante implícito.',
  '- Solo Ingeniero de proyecto activo importa CSV y modifica el diseñador; los demás miembros consultan.',
  '- Archivo CSV local con cabeceras: hasta 10 MiB / 50 000 filas, PapaParse compartido.',
  '- Selección de serie, tiempo numérico, objetivo y 1–16 variables numéricas; problemas regresión, binaria y multiclase (3–10).',
  '- Ventanas de 4/8/16/32 pasos; ninguna ventana mezcla series; máximo 20 000 ventanas.',
  '- Para la ventana t..t+L-1, el objetivo se toma de t+L. Se ordena por tiempo y se rechazan duplicados y no finitos.',
  '- Tres ventanas reales de ejemplo; no se cargan ni persisten CSV, métricas o pesos en Supabase.',
  '- Diseñador SimpleRNN/LSTM, 1–2 capas con 8/16/32/64 unidades, Dense opcional y salida según problema.',
  '- Shapes/parámetros teóricos calculados en el cliente. Entrenar/Evaluar/Predecir son vistas futuras sin métricas ficticias.',
  '',
  '### Prueba y límites',
  '',
  '- Muestra local: `tests/fixtures/rnn1_temporal_demo.csv` (serie, paso, variables, objetivo).',
  '- Ejecutar `node --experimental-strip-types --test tests/rnn1.*.test.mjs`, `npm run typecheck`, `npm run build`.',
  '- En la muestra, 4 pasos forman 12 ventanas; 8 pasos, 4 ventanas. Probar permisos, temas y móvil.',
  '- No se requiere migración SQL, nuevas dependencias ni funciones RPC en RNN-1.',
  '- RNN-2 debe evitar fuga por ventanas solapadas mediante partición cronológica con separación temporal o por serie,',
  '  ajustar escaladores solo con train y entrenar con TF.js real y cancelación.',
  '- Antes de RNN-4, filtrar historial y modelos por `architectures.family`, nunca inferir familia a partir del tipo de problema.',
  '- No afirmar cierre hasta aprobar validación en VSCode y la versión publicada en Vercel.',
  '<!-- RNN1_FIN -->',
]
writeFileSync(file, text.trimEnd() + '\n\n' + lines.join('\n') + '\n', 'utf8')
console.log('Sección RNN-1 añadida a FASE_7_ARQUITECTURAS.md sin sobrescribir CNN.')

/**
 * RNN-4D: añade el alcance al Markdown consolidado; no reemplaza CNN/RNN previos.
 * Es idempotente para permitir una segunda instalación sin duplicar secciones.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const path = fileURLToPath(new URL('../docs/operations/FASE_7_ARQUITECTURAS.md', import.meta.url))
const title = '## RNN-4D — Historial, comparaciones y reportes unificados'
const lines = [
  '', '', title, '',
  '- **Historial por familia real:** consulta RLS de `training_runs` y `architectures!inner(family)` con filtro `all/feedforward/cnn/rnn` aplicado en PostgreSQL antes de paginar (8 ejecuciones por página). RNN de regresión/binaria/multiclase no se etiqueta ni mezcla con Feedforward/CNN por compartir `problem_type`.',
  '- **Detalle histórico RNN:** las curvas reconstruyen las métricas reales de `training_metrics` (loss + MAE/accuracy de train/validation); la tarjeta RNN lee el resumen agregado `run_evaluations.metrics_json` guardado en RNN-4B y presenta MAE/RMSE/MSE/R² o accuracy/macro-métricas/matriz. Nunca recupera ventanas, series ni predicciones individuales. La tabla paginada de 8+8+2 continúa solo en la sesión RNN local.',
  '- **Comparación:** únicamente entre la misma familia y tipo de problema, con ejecuciones completadas. Para CNN/RNN de clasificación también coinciden las clases y su orden; si no, no se muestran métricas engañosas. La comparación descriptiva no verifica igualdad de dataset, objetivo, horizonte, partición, semillas ni condiciones de entrenamiento; el usuario debe comprobarlas antes de interpretar resultados.',
  '- **Reportes CSV/PDF:** filtros compartidos de Feedforward/CNN/RNN, familia obtenida desde la FK real, métricas multiclase RNN y binarias con F1 macro, regresión RNN con RMSE/MAE/R². El CSV contiene exclusivamente agregados y metadatos, no muestras. Totales globales sin filtrar. Límite vigente: 200 ejecuciones recientes por instantánea; un filtro no implica exhaustividad histórica.',
  '- **Compatibilidad y seguridad:** no se alteran las RPC, RLS, bucket privado ni manifiestos/modelos ya publicados en 011–015; no hay nuevas migraciones. Continúan accesos de miembros mediante RLS y se conserva Feedforward/CNN.',
  '- **Pruebas:** `node --experimental-strip-types --test tests/rnn4d.history.test.mjs tests/rnn4d.contract.test.mjs`; `npm run typecheck && npm run build`; `supabase/tests/FASE_7_RNN4D_VERIFICACION.sql` (solo lectura). Probar filtros en Historial y Reportes, comparación entre dos RNN compatibles, Exportar CSV/PDF, versiones privadas RNN y regresión Feedforward/CNN.',
  '- **Pendiente:** RNN-5 validará roles/RLS reales, regresiones, despliegue Vercel y cierre formal RNN, independiente de pendientes operativos de Fase 6.',
]
const previous = readFileSync(path, 'utf8')
if (previous.includes(title)) console.log('RNN-4D ya documentada: sin cambios.')
else {
  writeFileSync(path, previous.trimEnd() + lines.join('\n') + '\n')
  console.log('Sección RNN-4D añadida sin sobrescribir CNN ni RNN-1 a 4C.')
}

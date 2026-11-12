/** Anexa RNN-3 al documento único de Fase 7 sin reemplazar CNN ni RNN-1/2. */
import { readFileSync, writeFileSync } from 'node:fs'
const path = 'docs/operations/FASE_7_ARQUITECTURAS.md'
const current = readFileSync(path, 'utf8')
const section = `<!-- RNN3_EVALUACION_INFERENCIA_BEGIN -->
## RNN-3 — Evaluación de test y predicción temporal local

**Estado:** implementación preparada, pendiente de validación de runtime, TypeScript, build y pruebas de navegador por el equipo.

- Mantiene SimpleRNN/LSTM y partición temporal causal de RNN-2. Solo **después** de completar \`model.fit()\` se calculan predicciones sobre el test reservado; las ventanas de test no participan en el entrenamiento ni en la validación y no ajustan transformadores.
- Regresión: MSE, RMSE, MAE y R² calculados en la **escala original** del objetivo mediante los estadísticos ajustados solo en train. R² se muestra como no definido cuando el objetivo test es constante.
- Clasificación binaria/multiclase: accuracy, precisión/recall/F1 macro, matriz de confusión (filas reales, columnas predichas) y hasta 8 ejemplos de test. Las clases proceden de train; no se inventan valores ni se ocultan clases con cero casos.
- El modelo entrenado permanece en memoria del Web Worker (o fallback principal) para inferir a partir de la **última ventana cronológica real** de una serie del CSV local. Solo se utilizan las columnas predictoras; no se utiliza el objetivo al construir esta ventana. Se devuelve la salida desnormalizada o clase y probabilidades.
- La predicción estima la observación posterior a la ventana; no se extrapola ni inventa una marca temporal exacta. No se permite cargar CSV externos con otro esquema todavía.
- Se liberan modelos y tensores cuando se abandona el módulo, cambia proyecto o identidad, cambia arquitectura/CSV o comienza un nuevo entrenamiento. La cancelación no deja modelo para inferencia. Las métricas y predicciones son temporales y **no se guardan en Supabase**.
- El motor conserva un solo entrenamiento por sesión; el Worker no se reinicia tras fallos ocurridos después del inicio. No se introducen nuevas tablas, SQL, librerías ni dependencias.

**Pruebas (Git Bash):**

\`\`\`bash
node --experimental-strip-types --test tests/rnn1.*.test.mjs tests/rnn2.training-data.test.mjs tests/rnn2.contract.test.mjs tests/rnn3.evaluation.test.mjs tests/rnn3.inference.test.mjs tests/rnn3.contract.test.mjs
node --experimental-strip-types --test tests/rnn2.runtime.test.mjs tests/rnn3.runtime.test.mjs
npm run typecheck
npm run build
npm run dev
\`\`\`

**Validación funcional:** usar \`tests/fixtures/rnn2_temporal_demo.csv\` (4 pasos) y entrenar 2 épocas; abrir Evaluar, verificar 18 observaciones de test y métricas finitas. Abrir Predecir, seleccionar \`sensor_A\` y \`sensor_B\`, verificar inferencia de ambas; repetir con SimpleRNN y LSTM. Cambiar de pestaña durante el entrenamiento, comprobar cancelación y liberación al cambiar CSV. Validar acceso de Ingeniero frente a los demás roles, temas claro/oscuro y móvil.

**Limitación:** la calidad predictiva depende del dataset, el horizonte y el entrenamiento; la pérdida de validación observada puede ser muy superior a la pérdida de train. RNN-4 agregará persistencia, modelos versionados e historial, con RLS/RPC específicos.
<!-- RNN3_EVALUACION_INFERENCIA_END -->`
if (current.includes('<!-- RNN3_EVALUACION_INFERENCIA_BEGIN -->')) {
  console.log('RNN-3 ya documentada: no se duplicó.')
} else {
  writeFileSync(path, current.trimEnd() + '\n\n' + section + '\n')
  console.log('Sección RNN-3 añadida sin sobrescribir CNN/RNN-1/RNN-2.')
}

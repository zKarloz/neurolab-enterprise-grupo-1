/** Añade RNN-4C de forma idempotente al documento consolidado de Fase 7. */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const file = fileURLToPath(new URL('../docs/operations/FASE_7_ARQUITECTURAS.md', import.meta.url))
const title = '## RNN-4C — Versiones privadas y predicción restaurada'
const lines = [
  '', '', title, '',
  '- **Publicación:** tras confirmar las épocas, test agregado y cierre remoto `completed`, el Ingeniero serializa SimpleRNN/LSTM localmente (Worker o fallback) y utiliza `saveModelVersion` de Fase 5. Reserva una versión inmutable, sube `model.json` y `weights.bin` al bucket privado y verifica hashes SHA-256. No se requieren nuevas migraciones; reutiliza RPC F5 y el manifiesto RNN de 014/015.',
  '- **Restauración:** el registro de modelos filtra Feedforward, CNN y RNN. Descarga con JWT/RLS, comprueba hashes, valida manifiesto/dimensiones y carga los pesos en TensorFlow.js del navegador.',
  '- **Inferencia sin CSV:** se introducen manualmente `steps` filas, de más antigua a más reciente, con columnas en el orden `features` guardado. Se aplican medias/escalas calculadas solo en train y se revierte la escala del objetivo regresivo; en clasificación se muestran clase y probabilidades. Observaciones y predicciones no se envían a Supabase.',
  '- **Seguridad:** publica solamente el Ingeniero de proyecto activo desde su ejecución completada; miembros autorizados pueden descargar y predecir. El Administrador global sin membresía no recibe acceso técnico automáticamente. Hashes declarados por el cliente confirman integridad de descarga, no autenticidad criptográfica del entrenamiento.',
  '- **Vida útil:** el modelo se libera al salir de la vista o cambiar de versión. Un fallo de subida/publicación no se presenta como éxito. Una reserva remota puede quedar sin publicar si una subida falla; no se sobrescriben versiones anteriores.',
  '- **Pruebas:** `node --experimental-strip-types --test tests/rnn4c.manifest.test.mjs tests/rnn4c.contract.test.mjs`; en Node con TF.js instalado `node --experimental-strip-types --test tests/rnn4c.runtime.test.mjs`; `npm run typecheck && npm run build`. Publicar una RNN y, tras recargar/volver a iniciar sesión, predecir sin CSV. Verificar `supabase/tests/FASE_7_RNN4C_VERIFICACION.sql` después de publicar.',
  '- **Pendiente:** RNN-4D integrará historial/comparación y RNN-5 validará seguridad/despliegue de cierre.',
]
const previous = readFileSync(file, 'utf8')
if (previous.includes(title)) console.log('RNN-4C ya documentada, sin cambios.')
else {
  writeFileSync(file, previous.trimEnd() + lines.join('\n') + '\n')
  console.log('Sección RNN-4C añadida sin sobrescribir CNN ni RNN anteriores.')
}

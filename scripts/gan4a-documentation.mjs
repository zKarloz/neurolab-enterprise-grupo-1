/** GAN-4A: anexa documentación a Fase 7 sin alterar CNN, RNN o GAN-1..3. */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const path = fileURLToPath(new URL('../docs/operations/FASE_7_ARQUITECTURAS.md', import.meta.url))
const heading = '## GAN-4A — Contrato de persistencia adversarial en Supabase'
const section = `

<!-- GAN4A_INICIO -->
${heading}

**Estado:** migración SQL preparada. No conectar el entrenamiento hasta validar la migración 016 y el diagnóstico. No hay nuevas escrituras desde la UI en GAN-4A.

- Migración \`202611120016_gan_adversarial.sql\`: añade \`gan\` a architectures.family y \`generative\` a problem_type en datasets/training_runs/run_evaluations; **no se confunde con clasificación binaria**. Conserva filas y funciones de Feedforward, CNN y RNN. Amplía los límites de épocas en training_runs y training_metrics de 50 a **100** para compatibilidad con GAN-3.
- Cuatro nombres de métricas adversariales: \`generator_loss\`, \`discriminator_loss\`, \`d_real\`, \`d_fake\`. Se registran como indicadores de entrenamiento, no precisión supervisada ni medidas de realismo.
- RPC \`create_gan_training_run\`: recibe nombre/huella SHA-256 del CSV completo, tamaño, resolución 8×8/28×28, cantidad de imágenes, escala original y configuración G/D, sin píxeles ni filas. El campo \`seed=0\` indica explícitamente que el ruido usado por GAN-3 **no tiene semilla fija**.
- RPC \`record_gan_training_epoch\`: después de \`set_training_runtime\`, exige Ingeniero del proyecto, autor original, estado running, orden estrictamente consecutivo y cuatro métricas reales finitas. Sigue usando \`finish_training_run\` para el cierre.
- RPC \`record_gan_generation_summary\`: UNA vez después de completar entrenamiento. Registra en run_evaluations únicamente un resumen descriptivo de 4/8/16 imágenes (brillo, diferencia media y rangos) para el futuro versionado privado. No guarda imágenes, ruido, PNG ni muestras. **No equivale a FID, IS ni evaluación científica**.
- Las tres RPC usan SECURITY DEFINER con search_path fijo; solo authenticated recibe EXECUTE. No se conceden escrituras directas a las tablas ni se cambian políticas RLS. El administrador global sin membresía sigue sin permiso técnico automático.
- \`src/ml/gan/persistencePayload.ts\` define el contrato de metadatos y resúmenes que conectaremos desde el frontend en GAN-4B, después de validar los permisos y la migración.
- Fases siguientes: **GAN-4B** (cola de persistencia, épocas y resumen), **GAN-4C** (versionado/restauración de G), **GAN-4D** (historial, comparación y reportes), **GAN-5** (auditoría de cinco roles, pruebas y cierre).

### Aplicación y verificación GAN-4A

1. Descomprimir el paquete en la raíz del repositorio. Ejecutar \`node --experimental-strip-types --test tests/gan4a.*.test.mjs\`, \`npm run typecheck\` y \`npm run build\`.
2. En Supabase SQL Editor, ejecutar **una sola vez** el contenido de \`supabase/migrations/202611120016_gan_adversarial.sql\` (después de 015).
3. En una consulta nueva ejecutar \`supabase/tests/FASE_7_GAN4A_VERIFICACION.sql\`. Debe devolver una fila con 8 tablas RLS, 3 RPC, permisos correctos, límites 100 y 0 privilegios de escritura directa.
4. Comprobar en navegador que GAN-3 sigue entrenando/generando localmente; **GAN-4A todavía no guarda ejecuciones GAN en Supabase**.

No reejecutar 011–015. Los datos existentes no se eliminan. El SQL Editor no confirma aislamiento por identidad de usuario: GAN-5 realizará la auditoría con cinco roles reales.
<!-- GAN4A_FIN -->
`
// No se utiliza una librería de plantillas para preservar intacto el documento consolidado.
const previous = readFileSync(path, 'utf8')
if (previous.includes(heading)) console.log('GAN-4A ya documentada: no se duplica la sección.')
else {
  writeFileSync(path, previous.trimEnd() + section + '\n')
  console.log('GAN-4A añadida a FASE_7_ARQUITECTURAS.md sin sobrescribir CNN/RNN/GAN anteriores.')
}

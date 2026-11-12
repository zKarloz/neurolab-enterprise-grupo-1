/**
 * GAN-5: añade la sección de cierre al documento único de Fase 7.
 * Repetible: no reescribe la documentación de CNN, RNN ni GAN-1 a GAN-4D.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const path = fileURLToPath(new URL('../docs/operations/FASE_7_ARQUITECTURAS.md', import.meta.url))
const heading = '## GAN-5 — Seguridad, validación y cierre de redes generativas'
const section = `

<!-- GAN5_CIERRE_INICIO -->
${heading}

**Estado:** LISTA PARA VALIDACIÓN. El cierre formal depende de pruebas completas en VSCode,
auditoría SQL, cinco identidades RLS/Storage y despliegue HTTPS de la misma revisión.

### Alcance y principios

- GAN-1 a GAN-3: importación CSV 8×8/28×28, dos redes Dense, entrenamiento adversarial
  real con TensorFlow.js y generación local de 4/8/16 imágenes. No son DCGAN ni cGAN.
- GAN-4A/4B: tres RPC GAN; las métricas registradas son \`generator_loss\`,
  \`discriminator_loss\`, \`d_real\` y \`d_fake\`, cuatro por época (hasta 100 épocas).
  Después de completar, al generar por primera vez, se guarda **un** resumen
  descriptivo de generación, no test
  supervisado, FID, IS ni un indicador de calidad visual.
- GAN-4C: solo se versionan los pesos de **G** y el manifiesto de normalización;
  \`model.json\` y \`weights.bin\` permanecen en el bucket privado \`model-artifacts\`.
  La restauración genera imágenes sin CSV y sin entrenamiento nuevo.
- GAN-4D: historial y CSV/PDF de cuatro familias (Feedforward/CNN/RNN/GAN),
  comparación de GAN solo entre resoluciones compatibles y exportación de agregados.
- GAN-5 **no añade migraciones, cambios React ni dependencias**. Contiene auditorías,
  regresiones y una checklist de aceptación sin datos de producción.

### Pruebas técnicas

\`supabase/tests/FASE_7_GAN5_AUDITORIA_READONLY.sql\`: una consulta SQL de solo lectura,
una fila; verifica 8 tablas RLS, 3 RPC con \`SECURITY DEFINER\` y permisos
\`authenticated\`, bucket privado, 4 métricas por época, hasta 400 métricas,
resumen sin píxeles y versiones con hashes/rutas. **SQL Editor no prueba permisos RLS por JWT.**

\`scripts/test-gan5-live.mjs\`: auditoría con cinco cuentas reales, cada una con
JWT independiente y \`anon/publishable key\`, sin \`service_role\`. Los cuatro
miembros de proyecto (Responsable, Ingeniero, Revisor, Lector) deben poder leer los
recursos técnicos; el Administrador global **sin membresía** debe recibir cero filas o
acceso denegado al Storage privado. Verifica SHA-256 de ambos archivos descargados.
La coincidencia de hashes demuestra integridad respecto a los hashes registrados, no
prueba independencia de entrenamiento ni autoría de los pesos. No se prueban permisos
de escritura con esta auditoría de lectura.

Configuración local (no subir a Git): \`VITE_SUPABASE_URL\`,
\`VITE_SUPABASE_PUBLISHABLE_KEY\`, cinco parejas \`TEST_F6_*_EMAIL/PASSWORD\`,
\`TEST_GAN5_PROJECT_ID\` y, de forma opcional, \`TEST_GAN5_VERSION_ID\`.
El UUID del proyecto debe ser el **id de public.projects**, no el ref de Supabase
ni el id de una ejecución. Se requiere una versión GAN real publicada y un Admin
sin membresía en ese proyecto. No imprimir credenciales ni tokens.

\`\`\`bash
node --experimental-strip-types --test tests/gan5.*.test.mjs
node --experimental-strip-types --test tests/gan2.runtime.test.mjs tests/gan3.runtime.test.mjs tests/gan4c.runtime.test.mjs
npm run typecheck
npm run build
git diff --check
node --env-file=.env.test.local scripts/test-gan5-live.mjs
\`\`\`

### Lista de aceptación antes de marcar GAN cerrada

- [ ] Probar importación de CSV reales 8×8 y construcción de G/D con Ingeniero;
      Revisor/Lector sin controles de edición/entrenamiento.
- [ ] Entrenar 2 épocas (rápido) y un experimento real; curvas G/D, estados de error y
      cancelación. No confundir pérdida adversarial con realismo de imágenes.
- [ ] Generar 4, 8 y 16 imágenes, descargar PNG, liberar memoria al cambiar
      arquitectura/datos/usuario. Nunca subir CSV, píxeles ni imágenes a Supabase.
- [ ] Confirmar 4 métricas por época, 1 resumen descriptivo, versión privada de G,
      restauración sin CSV tras recargar, hashes y rutas validadas.
- [ ] Historial, comparación y CSV/PDF: filtros de Feedforward/CNN/RNN/GAN;
      GAN descriptiva, no precisión/clasificación, mismas dimensiones al comparar.
- [ ] Prueba SQL de una fila aprobada; auditoría cinco roles JWT/Storage aprobada;
      revisar también permisos de escritura desde la UI según roles del proyecto.
- [ ] Revisar tema claro por defecto, oscuro en escala de grises, teclado y móvil.
- [ ] Versionar cambios definitivos sin *.tar.gz, payloads, parches temporales ni
      \`.env.test.local\`. Confirmar build limpio en Vercel y pruebas HTTPS.
- [ ] Documentar fecha, hash del commit publicado, resultado del último despliegue,
      verificación SQL, total de pruebas y aceptación final.

**Criterio de cierre GAN / Fase 7:** todas las comprobaciones funcionales,
autorizaciones por usuario y despliegue de las cuatro familias deben pasar antes de
marcar la fase como CERRADA. El pendiente operacional de restauración Docker de
Fase 6 permanece registrado por separado y no se considera solucionado por GAN-5.
<!-- GAN5_CIERRE_FIN -->
`

const previous = readFileSync(path, 'utf8')
if (previous.includes(heading)) {
  console.log('GAN-5 ya documentada; sin duplicados.')
} else {
  writeFileSync(path, previous.trimEnd() + section + '\n')
  console.log('GAN-5 añadida sin reemplazar CNN, RNN ni GAN-1 a GAN-4D.')
}

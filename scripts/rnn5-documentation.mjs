/** RNN-5: añadir sección de cierre al documento consolidado SIN reemplazar CNN/RNN existentes. */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const path = fileURLToPath(new URL('../docs/operations/FASE_7_ARQUITECTURAS.md', import.meta.url))
const heading = '## RNN-5 — Seguridad, regresión y cierre de la familia recurrente'
const text = `

<!-- RNN5_CIERRE_INICIO -->
${heading}

**Estado:** PREPARADA PARA VALIDACIÓN. El cierre formal requiere resultados reales de RLS,
Storage, ejecución y Vercel; las pruebas de código no sustituyen la aceptación.
RNN-4B: el desarrollador verificó una ejecución completada 2/2, 8 métricas, 1 evaluación y
18 ventanas de test reservadas/evaluadas. RNN-4C: versión privada con manifiesto temporal,
hashes/rutas y ejecución completada. RNN-4D: historial y reportes integrados.

### Alcance de RNN-5

- Sin cambios en React, TensorFlow.js, políticas RLS, bucket, tablas, RPC, dependencias o migraciones 011–015.
- Pruebas de cola de persistencia: orden de runtime/épocas/evaluación/finalización, errores,
  cancelación y confirmaciones reales; métricas no finitas rechazadas.
- Pruebas de privacidad: el test completo de 18 ventanas sigue en la tabla paginada **local**;
  el historial y CSV/PDF almacenan solamente métricas agregadas; no se recuperan ni se exportan
  las 18 filas originales desde Supabase.
- Auditoría SQL de **solo lectura**, una fila de resultados:
  \`supabase/tests/FASE_7_RNN5_AUDITORIA_READONLY.sql\`. Verifica ocho tablas con RLS,
  tres RPC seguras, bucket privado, ejecuciones completas, versiones con hashes/rutas y
  resúmenes sin datos individuales. SQL Editor NO prueba el aislamiento por usuario.
- Auditoría auténtica con **cinco JWT de prueba**, solo lectura:
  \`scripts/test-rnn5-live.mjs\`. Valida Responsable, Ingeniero, Revisor, Lector y
  Administrador global **sin membresía técnica**; lectura RLS de las siete entidades,
  acceso privado a model.json/weights.bin y SHA-256 de ambos artefactos. No prueba
  autorización de escritura ni reemplaza las verificaciones manuales de rol.

### Comandos de validación

\`\`\`bash
node --experimental-strip-types --test tests/rnn5.*.test.mjs
node --experimental-strip-types --test tests/rnn2.runtime.test.mjs tests/rnn4c.runtime.test.mjs
npm run typecheck
npm run build
# Archivo .env.test.local local, fuera de Git; cinco usuarios de pruebas.
node --env-file=.env.test.local scripts/test-rnn5-live.mjs
\`\`\`

Configuración mínima del ensayo real: \`VITE_SUPABASE_URL\`,
\`VITE_SUPABASE_PUBLISHABLE_KEY\`, las cinco cuentas de \`TEST_F6_*\`, y
\`TEST_RNN5_PROJECT_ID\` (alternativa \`TEST_F6_PROJECT_ID\`). Opcional
\`TEST_RNN5_VERSION_ID\` para seleccionar la versión RNN publicada explícitamente.
Nunca compartir contraseñas ni tokens. Ejecutar solo sobre un proyecto donde estén las
cuatro membresías y el Admin global esté fuera; el script se detiene si no se cumplen.

### Validaciones funcionales y cierre pendiente

- [ ] Ingeniero: SimpleRNN y LSTM entrenan realmente, muestran métricas y test; cancelación
      y pérdida de conexión no anuncian finalización remota falsa.
- [ ] Predicción en sesión; test paginado (8 + 8 + 2 para el CSV demo); cambiar dataset o
      arquitectura invalida el modelo antiguo.
- [ ] Versión privada publicada; recuperar tras recargar sin CSV, con ventanas manuales,
      normalización guardada y control de dimensiones; comprobar hashes y rutas.
- [ ] Historial/compare/reportes: filtrar Feedforward/CNN/RNN, no mezclar familias/tareas,
      revisar reportes CSV/PDF solo agregados, totales globales y límites de paginación.
- [ ] Responsable, Ingeniero, Revisor, Lector, Admin global sin membresía: controles de
      lectura/acceso y autorización de acciones conforme a los roles; revocación solo en
      proyecto de prueba, nunca modificar miembros productivos para auditar.
- [ ] Tema claro por defecto/oscuro en grises, móvil, teclado y estados de carga.
- [ ] Commit controlado: incluir scripts/tests/SQL/documentación; excluir archivos *.tar.gz,
      .env.test.local, payloads y parches temporales; Vercel READY para el mismo commit.
- [ ] Registrar fecha, commit y despliegue, resultados de pruebas, SQL, RLS/Storage real y
      aceptación en HTTPS, sin datos sensibles.

**Criterio de cierre RNN:** solo marcar CERRADA tras aprobar el runtime TF.js, typecheck/build,
SQL, las cinco identidades RLS/Storage y las pruebas de navegador en la versión desplegada.
La verificación de SHA-256 acredita integridad respecto a los hashes declarados por el
cliente, no autenticidad del entrenamiento. Rendimiento y generalización son experimentales.
Las tareas operativas pendientes de Fase 6 (Docker/restore Auth/Storage) siguen separadas.
GAN comienza tras el cierre de RNN, sin atribuirle funcionalidades aún no implementadas.
<!-- RNN5_CIERRE_FIN -->
`
const previous = readFileSync(path, 'utf8')
if (previous.includes(heading)) {
  console.log('Sección RNN-5 ya existe: sin duplicados.')
} else {
  writeFileSync(path, previous.trimEnd() + text + '\n')
  console.log('RNN-5 documentada sin sobrescribir CNN/RNN-1 a RNN-4D.')
}

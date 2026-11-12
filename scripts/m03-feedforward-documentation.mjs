import { readFileSync, writeFileSync } from 'node:fs'

// Anexar sin reescribir ni duplicar el documento consolidado de Feedforward.
const file = 'docs/operations/FASE_3_FEEDFORWARD.md'
const marker = '## Mejora M03 — Feedforward por pestañas'
const section = `

${marker}

**Interfaz:** el antiguo acceso «Dataset local» se muestra como «Red feedforward · Dense» dentro del proyecto. La ruta histórica \`/proyectos/:projectId/datos\` permanece válida para no romper marcadores ni enlaces existentes.

**Pestañas compartidas:** Datos, Arquitectura, Entrenar, Evaluar y Predecir utilizan el componente accesible \`Tabs\`, con navegación de teclado y desplazamiento horizontal en móvil.

- **Datos:** CSV local, selección de objetivo, problema binario o regresión, partición y preprocesamiento reproducible.
- **Arquitectura:** topología Dense, activaciones y parámetros estimados.
- **Entrenar:** hiperparámetros, progreso, métricas reales por época, confirmación Supabase y publicación de una versión privada.
- **Evaluar:** evaluación del test reservado y acceso a ejecuciones guardadas (el historial general sigue en su módulo).
- **Predecir:** inferencia con el modelo entrenado en la sesión y su manifiesto de preprocesamiento.

**Conservación de estado:** alternar pestañas no desmonta el motor ni pierde los pesos en memoria. Mientras exista entrenamiento o sincronización activos, se bloquea reemplazar el CSV o cambiar objetivo/tipo. Al abandonar la ruta sí se liberan recursos, tal como ocurría anteriormente.

**Seguridad y persistencia:** solo Ingenieros miembros de proyectos activos pueden entrenar y preparar datos; las autorizaciones RPC/RLS permanecen intactas. No hay SQL, cambios de tabla ni envío de filas del CSV a Supabase.

**Validación:** ejecutar \`node --test tests/m03.feedforward-tabs.test.mjs\`, \`npm run typecheck\`, \`npm run build\`. Probar un CSV de clasificación y otro de regresión; comprobar que las pestañas conservan las métricas y la predicción en el navegador.
`
const current = readFileSync(file, 'utf8')
if (!current.includes(marker)) {
  writeFileSync(file, current.trimEnd() + section + '\n', 'utf8')
  console.log('M03 Feedforward añadida a la documentación consolidada.')
} else {
  console.log('M03 Feedforward ya estaba documentada; no se duplicó.')
}

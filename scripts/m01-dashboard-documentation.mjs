// Actualiza la documentación consolidada de Inicio/Fase 1, sin reemplazar contenido previo.
import { readFileSync, writeFileSync } from 'node:fs'

const target = 'docs/operations/FASE_1_INICIO.md'
const marker = '## M01 · Dashboard operativo (mejora transversal)'
const previous = readFileSync(target, 'utf8')
if (previous.includes(marker)) {
  console.log('M01 Dashboard ya documentado; no se duplica la sección.')
} else {
  const section = `

${marker}

La pantalla **Inicio** consulta proyectos y ejecuciones almacenadas en PostgreSQL, bajo la identidad de Supabase Auth y sus políticas RLS. No utiliza indicadores simulados ni concede privilegios nuevos.

- **Resumen de proyectos:** proyectos visibles activos y archivados; acceso a los más recientes y al listado general.
- **Entrenamientos activos y recientes:** estados persistidos de preparación/ejecución; últimas 32 ejecuciones visibles en tabla paginada, con familia real, épocas y enlace al historial. Los estados remotos no prueban que otro Web Worker continúe activo.
- **Indicadores de uso:** ejecuciones iniciadas y completadas durante los últimos 30 días (según las fechas registradas), proyectos activos y entrenamientos en curso según Supabase.
- **Alertas:** fallidas o interrumpidas en 7 días, trabajos en preparación/ejecución sin cambios durante 60 minutos, registros sin iniciar y proyectos archivados. Una alerta por inactividad no prueba que se haya detenido un navegador.
- **Estado de la consulta:** carga, reintento, fecha de actualización y error explícito. Nunca se interpreta una consulta fallida como éxito o como contador cero.

**Seguridad:** el administrador global sin membresía puede tener visibilidad de proyectos pero no de arquitecturas, datasets ni entrenamientos técnicos. Los agregados de ejecuciones se calculan exclusivamente desde filas autorizadas por RLS. No se modifica ninguna política, migración ni privilegio de acceso.

**Límites:** la lista reciente muestra como máximo 32 ejecuciones; los conteos se obtienen mediante consultas «count: exact» independientes de esa lista. La pantalla no constituye un monitor de disponibilidad global del servidor, telemetría del navegador ni control remoto de Workers.
`
  writeFileSync(target, previous.trimEnd() + section, 'utf8')
  console.log('M01 Dashboard documentado en FASE_1_INICIO.md, sin sobrescribir secciones anteriores.')
}

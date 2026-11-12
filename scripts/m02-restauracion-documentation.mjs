// Agrega la recuperación de proyectos al documento único de Fase 2.
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'docs/operations/FASE_2_PROYECTOS.md'
const marker = '## M02 · Proyectos archivados y restauración (migración 017)'
const content = readFileSync(file, 'utf8')
if (content.includes(marker)) {
  console.log('M02: sección ya documentada; no se duplicó.')
} else {
  const section = `\n\n${marker}\n\n` +
    '- Archivar no elimina el proyecto: `projects.status` pasa a `archived`, conservando miembros y recursos.\n' +
    '- En **Proyectos**, el botón **Archivados** abre el filtro existente. Cada proyecto archivado ofrece **Restaurar** solo al Responsable o Administrador global autorizados.\n' +
    '- `restore_project(uuid)` reactiva el estado y registra `project_restored` de forma transaccional. Requiere al menos un Responsable activo y se limita a proyectos previamente archivados.\n' +
    '- La restauración no replica datos ni otorga membresías; el Administrador global conserva su restricción sobre recursos técnicos si no es integrante.\n' +
    '- Migración: `202611120017_restore_archived_projects.sql`. Verificación: `M02_RESTAURACION_PROYECTOS_READONLY.sql`.\n' +
    '- Se respetan RLS y permisos de lectura para los cuatro roles; la reactivación administrativa sigue siendo una RPC protegida.\n'
  writeFileSync(file, content.trimEnd() + section + '\n')
  console.log('M02: sección agregada a FASE_2_PROYECTOS.md.')
}

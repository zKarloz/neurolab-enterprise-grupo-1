/** Destino contextual: nunca depende del historial del navegador. */
export interface BackDestination {
  to: string
  label: string
}

// Auditoría de proyecto comparte el destino de los demás módulos anidados.
const projectChildModules = new Set(['datos', 'historial', 'modelos', 'reportes', 'auditoria'])

/** Solo ofrece retroceso en las rutas anidadas que controla este layout. */
export function getBackDestination(pathname: string): BackDestination | null {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  const match = /^\/proyectos\/([^/]+)(?:\/([^/]+))?$/.exec(normalized)
  if (!match) return null

  const [, projectId, moduleName] = match
  if (!moduleName) return { to: '/proyectos', label: 'Volver a proyectos' }
  if (projectChildModules.has(moduleName)) {
    return { to: `/proyectos/${projectId}`, label: 'Volver al proyecto' }
  }
  return null
}

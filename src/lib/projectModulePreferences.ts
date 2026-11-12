// Estado visual temporal del detalle del proyecto. No contiene datos del usuario ni tokens.
// sessionStorage mantiene la elección al navegar/recargar, pero no entre sesiones de login.
export interface ProjectModuleExpansion {
  algorithms: boolean
  management: boolean
}

const KEY_PREFIX = 'neurolab:project-module-expansion:v1:'

function storage(): Storage | null {
  // Los permisos del navegador y SSR pueden impedir acceder a sessionStorage.
  try { return typeof window === 'undefined' ? null : window.sessionStorage } catch { return null }
}

function preferenceKey(userId: string, projectId: string): string {
  return `${KEY_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(projectId)}`
}

export function readProjectModuleExpansion(userId: string, projectId: string): ProjectModuleExpansion {
  const closed = { algorithms: false, management: false }
  if (!userId || !projectId) return closed
  try {
    const saved = storage()?.getItem(preferenceKey(userId, projectId))
    if (!saved) return closed
    const parsed: unknown = JSON.parse(saved)
    if (!parsed || typeof parsed !== 'object') return closed
    const value = parsed as Partial<ProjectModuleExpansion>
    // Solo se admiten valores booleanos; datos antiguos o dañados no abren secciones.
    return { algorithms: value.algorithms === true, management: value.management === true }
  } catch { return closed }
}

export function saveProjectModuleExpansion(userId: string, projectId: string, value: ProjectModuleExpansion): void {
  if (!userId || !projectId) return
  try {
    storage()?.setItem(preferenceKey(userId, projectId), JSON.stringify({
      algorithms: value.algorithms === true,
      management: value.management === true,
    }))
  } catch { /* Sin almacenamiento permitido, el acordeón sigue funcionando en esta visita. */ }
}

export function clearProjectModulePreferences(): void {
  try {
    const store = storage()
    if (!store) return
    // No borrar otras preferencias de la SPA ni de herramientas ajenas.
    for (let index = store.length - 1; index >= 0; index -= 1) {
      const key = store.key(index)
      if (key?.startsWith(KEY_PREFIX)) store.removeItem(key)
    }
  } catch { /* El cierre de sesión no debe fallar si el almacenamiento está bloqueado. */ }
}

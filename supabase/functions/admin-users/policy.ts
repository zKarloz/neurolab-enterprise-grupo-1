/**
 * Reglas puras de la administración global. Se prueban también con Node.js,
 * fuera de Deno y sin credenciales, para detectar regresiones en los permisos.
 */
export type UserStatus = 'active' | 'inactive'
export type AdminAction = 'list' | 'create' | 'set_status' | 'reset_password'

export interface UserRecord {
  id: string
  status: UserStatus
  is_platform_admin: boolean
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isAdminAction(value: unknown): value is AdminAction {
  return value === 'list' || value === 'create' || value === 'set_status' || value === 'reset_password'
}

export function validEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function validDisplayName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 100
}

export function validUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export function validStatus(value: unknown): value is UserStatus {
  return value === 'active' || value === 'inactive'
}

/** La administración de otra cuenta global no concede autoescalada ni autodesactivación. */
export function mayManageUser(actorId: string, target: UserRecord): boolean {
  return target.id !== actorId && !target.is_platform_admin
}

/** El privilegio admin debe leerse del perfil de BD, no del JWT ni del body. */
export function isActivePlatformAdmin(profile: unknown): boolean {
  return isRecord(profile) && profile.status === 'active' && profile.is_platform_admin === true
}

export function validPage(value: unknown): number {
  const page = typeof value === 'number' ? value : 1
  return Number.isSafeInteger(page) && page >= 1 && page <= 10000 ? page : 1
}

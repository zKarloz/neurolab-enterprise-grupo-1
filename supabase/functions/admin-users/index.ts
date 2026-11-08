/**
 * Fase 6: operaciones administrativas privilegiadas exclusivamente en Supabase.
 * En el navegador solo se utiliza la clave publicable y un JWT de usuario.
 * No registrar contraseñas temporales, JWT, service_role ni peticiones completas.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.119.0'
import {
  isActivePlatformAdmin, isAdminAction, isRecord, mayManageUser,
  validDisplayName, validEmail, validPage, validStatus, validUuid,
} from './policy.ts'

// Ajustar mediante NEUROLAB_ALLOWED_ORIGINS para dominios propios o previews.
const defaultOrigins = ['https://neurolab-enterprise-grupo-1.vercel.app', 'http://localhost:5173', 'http://127.0.0.1:5173']
const configuredOrigins = (Deno.env.get('NEUROLAB_ALLOWED_ORIGINS') ?? '').split(',').map((v) => v.trim()).filter(Boolean)
const allowedOrigins = new Set([...defaultOrigins, ...configuredOrigins])
const PAGE_SIZE = 10

function headers(origin: string | null): HeadersInit {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    ...(origin && allowedOrigins.has(origin) ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
    } : {}),
  }
}

function reply(status: number, body: Record<string, unknown>, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) })
}

/** Contraseña aleatoria generada exclusivamente en servidor; se muestra una sola vez. */
function temporaryPassword(): string {
  const random = crypto.getRandomValues(new Uint8Array(24))
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  return 'Nl!8-' + Array.from(random, (byte) => alphabet[byte % alphabet.length]).join('')
}

type AuditAction = 'admin_user_created' | 'admin_user_activated' | 'admin_user_deactivated' | 'admin_password_reset'

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')
  if (origin && !allowedOrigins.has(origin)) return reply(403, { error: 'Origen no autorizado.' }, origin)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) })
  if (request.method !== 'POST') return reply(405, { error: 'Método no permitido.' }, origin)

  const url = Deno.env.get('SUPABASE_URL')
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !secret) return reply(503, { error: 'Servicio administrativo no configurado.' }, origin)
  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token || token.startsWith('sb_')) return reply(401, { error: 'Inicia sesión de nuevo.' }, origin)

  // Sin persistencia de sesión ni reutilización de un JWT privilegiado entre peticiones.
  const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: identity, error: identityError } = await admin.auth.getUser(token)
  if (identityError || !identity.user) return reply(401, { error: 'Sesión no válida.' }, origin)
  const actorId = identity.user.id
  const { data: actor, error: actorError } = await admin.from('app_users')
    .select('id,status,is_platform_admin').eq('id', actorId).maybeSingle()
  if (actorError) return reply(503, { error: 'No se pudieron comprobar los permisos.' }, origin)
  if (!isActivePlatformAdmin(actor)) return reply(403, { error: 'Se requiere Administrador global activo.' }, origin)

  let input: unknown
  try { input = await request.json() } catch { return reply(400, { error: 'Solicitud JSON inválida.' }, origin) }
  if (!isRecord(input) || !isAdminAction(input.action)) return reply(400, { error: 'Acción desconocida.' }, origin)

  async function audit(action: AuditAction, targetId: string, metadata: Record<string, unknown> = {}): Promise<boolean> {
    const { error } = await admin.from('audit_events').insert({
      actor_id: actorId, project_id: null, action, resource_type: 'app_user', resource_id: targetId,
      metadata_json: metadata,
    })
    return !error
  }

  try {
    if (input.action === 'list') {
      const page = validPage(input.page)
      const start = (page - 1) * PAGE_SIZE
      const { data, count, error } = await admin.from('app_users')
        .select('id,email,display_name,status,is_platform_admin,created_at', { count: 'exact' })
        .order('created_at', { ascending: false }).range(start, start + PAGE_SIZE - 1)
      if (error) return reply(503, { error: 'No fue posible consultar las cuentas.' }, origin)
      return reply(200, { users: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE }, origin)
    }

    if (input.action === 'create') {
      if (!validEmail(input.email) || !validDisplayName(input.display_name) || input.email_verified_by_admin !== true) {
        return reply(400, { error: 'Introduce un correo y nombre válidos; confirma la verificación administrativa del correo.' }, origin)
      }
      const email = input.email.trim().toLowerCase()
      const displayName = input.display_name.trim()
      const password = temporaryPassword()
      // email_confirm=true requiere verificación de titularidad previa por el administrador.
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { display_name: displayName },
      })
      if (error || !data.user) {
        return reply(error?.status === 422 ? 409 : 400, { error: 'No fue posible crear la cuenta. Comprueba si el correo ya está registrado.' }, origin)
      }
      if (!await audit('admin_user_created', data.user.id)) {
        return reply(503, { error: 'Cuenta creada en Auth, pero falló su auditoría. Consulta Supabase antes de reintentar.' }, origin)
      }
      return reply(201, { id: data.user.id, temporaryPassword: password }, origin)
    }

    if (!validUuid(input.user_id)) return reply(400, { error: 'Identificador inválido.' }, origin)
    const userId = input.user_id
    const { data: target, error: targetError } = await admin.from('app_users')
      .select('id,status,is_platform_admin').eq('id', userId).maybeSingle()
    if (targetError) return reply(503, { error: 'No se pudo comprobar el usuario.' }, origin)
    if (!target) return reply(404, { error: 'Usuario no encontrado.' }, origin)
    if (!mayManageUser(actorId, target)) {
      return reply(403, { error: 'No se permite cambiar la propia cuenta ni las de Administradores globales.' }, origin)
    }

    if (input.action === 'set_status') {
      if (!validStatus(input.status)) return reply(400, { error: 'Estado de cuenta inválido.' }, origin)
      if (target.status === input.status) return reply(200, { ok: true }, origin)
      const { data: updated, error } = await admin.from('app_users').update({
        status: input.status, updated_at: new Date().toISOString(),
      }).eq('id', userId).eq('status', target.status).select('id').maybeSingle()
      if (error || !updated) {
        // Un trigger de BD impide desactivar al último Responsable activo.
        return reply(409, { error: 'No se puede cambiar este estado. Puede ser el último Responsable activo de un proyecto.' }, origin)
      }
      if (!await audit(input.status === 'active' ? 'admin_user_activated' : 'admin_user_deactivated', userId)) {
        return reply(503, { error: 'Estado modificado, pero falló el registro de auditoría. Revisar en Supabase.' }, origin)
      }
      return reply(200, { ok: true }, origin)
    }

    if (input.action === 'reset_password') {
      const password = temporaryPassword()
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) return reply(503, { error: 'No se pudo restablecer la contraseña.' }, origin)
      if (!await audit('admin_password_reset', userId)) {
        return reply(503, { error: 'Contraseña restablecida, pero falló la auditoría. Revisa Supabase.' }, origin)
      }
      return reply(200, { temporaryPassword: password }, origin)
    }
    return reply(400, { error: 'Acción inválida.' }, origin)
  } catch {
    // No devolver excepciones técnicas de Supabase ni contenido sensible de solicitud.
    return reply(500, { error: 'Operación administrativa no completada.' }, origin)
  }
})

import { supabase } from '../lib/supabase'

import { createAvatarPath, validateAvatarFile } from './avatarPolicy.ts'

/** Bucket independiente del repositorio inmutable de modelos. */
export const USER_AVATAR_BUCKET = 'user-avatars'

/** Se actualiza primero el archivo, después el puntero SQL protegido por RPC. */
export async function uploadMyAvatar(userId: string, file: File, previousPath: string | null): Promise<void> {
  const validationError = validateAvatarFile(file)
  if (validationError) throw new Error(validationError)
  if (!supabase) throw new Error('Supabase no está disponible.')

  const path = createAvatarPath(userId, file.type, crypto.randomUUID())
  const storage = supabase.storage.from(USER_AVATAR_BUCKET)
  const { error: uploadError } = await storage.upload(path, file, {
    contentType: file.type, cacheControl: '60', upsert: false,
  })
  if (uploadError) throw uploadError

  const { error: profileError } = await supabase.rpc('set_my_avatar', { p_avatar_path: path })
  if (profileError) {
    // La ficha nunca debe apuntar a un archivo que no haya sido confirmado.
    await storage.remove([path]).catch(() => undefined)
    throw profileError
  }

  if (previousPath && previousPath !== path) {
    // Fallos de limpieza no revierten un perfil ya confirmado en PostgreSQL.
    const { error } = await storage.remove([previousPath])
    if (error) console.warn('[NeuroLab/Avatar] No se pudo limpiar la foto anterior.')
  }
}

/** Quitar el puntero primero evita mostrar un objeto eliminado en el perfil. */
export async function removeMyAvatar(previousPath: string | null): Promise<void> {
  if (!supabase) throw new Error('Supabase no está disponible.')
  const { error } = await supabase.rpc('set_my_avatar', { p_avatar_path: null })
  if (error) throw error
  if (previousPath) {
    const { error: cleanupError } = await supabase.storage.from(USER_AVATAR_BUCKET).remove([previousPath])
    if (cleanupError) console.warn('[NeuroLab/Avatar] No se pudo eliminar el archivo anterior.')
  }
}

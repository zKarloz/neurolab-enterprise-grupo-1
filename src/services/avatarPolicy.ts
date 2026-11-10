/** Reglas puras y reutilizables para ficheros de foto de perfil. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export function validateAvatarFile(file: Pick<File, 'type' | 'size'>): string | null {
  if (!Object.hasOwn(EXTENSIONS, file.type)) return 'Selecciona una imagen JPG, PNG o WebP.'
  if (file.size === 0 || file.size > MAX_AVATAR_BYTES) return 'La imagen debe pesar como máximo 2 MiB.'
  return null
}

export function createAvatarPath(userId: string, mime: string, fileId: string): string {
  const extension = EXTENSIONS[mime]
  if (!extension || !/^[0-9a-f-]{36}$/.test(userId) || !/^[0-9a-f-]{36}$/.test(fileId)) {
    throw new Error('Identificador o imagen de perfil no válidos.')
  }
  return `${userId}/${fileId}.${extension}`
}

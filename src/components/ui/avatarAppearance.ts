/** Iniciales y tono estable para perfiles sin fotografía. */
export function getAvatarInitials(displayName: string): string {
  const letters = displayName.normalize('NFC').match(/[\p{L}\p{N}]/gu) ?? []
  return letters.slice(0, 2).join('').toLocaleUpperCase('es-PE') || 'US'
}

export function getAvatarPaletteIndex(userId: string, colorCount = 7): number {
  if (colorCount <= 0 || !Number.isInteger(colorCount)) throw new Error('La paleta debe tener colores.')
  let hash = 0
  for (const character of userId) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0
  return hash % colorCount
}

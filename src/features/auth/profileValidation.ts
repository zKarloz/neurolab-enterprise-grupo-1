/**
 * Valida exclusivamente el nombre visible. No acepta correo, estado ni roles.
 * La misma regla se comprueba de nuevo en PostgreSQL, donde está la autorización.
 */
export function normalizeDisplayName(input: string): string | null {
  const name = input.trim()
  const characters = Array.from(name).length

  // Evitar campos vacíos, cadenas excesivas y caracteres de control invisibles.
  if (characters < 2 || characters > 80 || /[\u0000-\u001f\u007f]/u.test(name)) return null
  return name
}

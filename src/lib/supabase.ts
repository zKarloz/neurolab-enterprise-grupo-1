import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

// No crear un cliente ficticio: si faltan variables, se muestra una vista de configuración.
export const isSupabaseConfigured = Boolean(
  url && /^https:\/\/[^/]+\.supabase\.co\/?$/.test(url) && publicKey &&
  !publicKey.includes('TU_CLAVE_'),
)

// Únicamente clave pública: nunca colocar service_role, JWT privados o secretos en VITE_*.
export const supabase = isSupabaseConfigured
  ? createClient(url!, publicKey!, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    })
  : null

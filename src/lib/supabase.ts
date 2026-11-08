import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

// No crear un cliente ficticio: si faltan variables, se muestra una vista de configuración.
export const isSupabaseConfigured = Boolean(
  url && /^https:\/\/[^/]+\.supabase\.co\/?$/.test(url) && !url.includes('TU-PROYECTO') &&
  publicKey?.startsWith('sb_publishable_') && !publicKey.includes('REEMPLAZAR'),
)

// Únicamente clave publicable (sb_publishable_): nunca incluir sb_secret_, service_role ni otros secretos en VITE_*.
export const supabase = isSupabaseConfigured
  ? createClient(url!, publicKey!, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    })
  : null

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { USER_AVATAR_BUCKET } from '../../services/userAvatar'
import { getAvatarInitials, getAvatarPaletteIndex } from './avatarAppearance.ts'

interface UserAvatarProps {
  userId: string
  displayName: string
  avatarPath: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClasses = {
  sm: 'size-9 text-sm',
  md: 'size-12 text-base',
  lg: 'size-20 text-2xl',
} as const

// Colores pastel elegidos de manera determinista: el usuario conserva el mismo
// color entre sesiones en lugar de recibir uno nuevo en cada renderizado.
const PALETTE = [
  { background: '#ded4fa', foreground: '#302052' },
  { background: '#c8e4f5', foreground: '#173c59' },
  { background: '#f5d9e7', foreground: '#613049' },
  { background: '#cce9e1', foreground: '#214c42' },
  { background: '#f3dfc7', foreground: '#604020' },
  { background: '#d9dcf5', foreground: '#30365d' },
  { background: '#e9d8f4', foreground: '#51265c' },
] as const

/** El objeto privado se descarga con JWT y se expone solo como blob local temporal. */
export function UserAvatar({ userId, displayName, avatarPath, size = 'md', className = '' }: UserAvatarProps) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let disposed = false
    let objectUrl: string | null = null
    setSrc(null)

    if (avatarPath && supabase && avatarPath.startsWith(`${userId}/`)) {
      void supabase.storage.from(USER_AVATAR_BUCKET).download(avatarPath).then(({ data, error }) => {
        if (disposed || error || !data) return
        objectUrl = URL.createObjectURL(data)
        setSrc(objectUrl)
      })
    }
    return () => {
      disposed = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [avatarPath, userId])

  const palette = PALETTE[getAvatarPaletteIndex(userId)]
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full font-bold select-none ${sizeClasses[size]} ${className}`}
      style={{ backgroundColor: palette.background, color: palette.foreground }}
      role={src ? undefined : 'img'}
      aria-label={src ? undefined : `Avatar de ${displayName}: ${getAvatarInitials(displayName)}`}
    >
      {src ? <img src={src} alt={`Foto de perfil de ${displayName}`} className="size-full object-cover" /> : getAvatarInitials(displayName)}
    </span>
  )
}

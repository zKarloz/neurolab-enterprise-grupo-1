import { useState } from 'react'
import { CheckCircle2, CircleHelp, Shield, XCircle } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { projectRoleLabels } from '../../types/projects'
import type { ProjectMember, ProjectStatus } from '../../types/projects'
import { getRolePermissions, permissionStateLabels } from '../../security/rolePermissions'
import type { PermissionState } from '../../security/rolePermissions'

interface MemberPermissionsModalProps {
  member: ProjectMember | null
  projectStatus: ProjectStatus
  onClose: () => void
}

const iconByState = { allowed: CheckCircle2, conditional: CircleHelp, denied: XCircle }
const colorByState: Record<PermissionState, string> = {
  allowed: 'text-[var(--ink)]',
  conditional: 'text-[var(--focus)]',
  denied: 'text-[var(--muted)]',
}

/**
 * Vista explicativa de permisos del rol de proyecto actualmente asignado.
 * No consulta datos de terceros ni concede privilegios: la base de datos
 * continúa siendo la única autoridad para autorizar las acciones.
 */
export function MemberPermissionsModal({ member, projectStatus, onClose }: MemberPermissionsModalProps) {
  const [showAdmin, setShowAdmin] = useState(false)
  const role = member?.role ?? 'reader'
  const items = getRolePermissions(role, projectStatus)

  return (
    <Modal open={member !== null} title="Permisos del integrante" onClose={() => { setShowAdmin(false); onClose() }}>
      {member && <div className="space-y-5">
        <div>
          <p className="break-words text-base font-semibold">{member.display_name}</p>
          <p className="break-all text-sm text-[var(--muted)]">{member.email}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">Rol de proyecto: <strong className="text-[var(--ink)]">{projectRoleLabels[member.role]}</strong></p>
        </div>
        <p className="text-xs leading-5 text-[var(--muted)]">
          Capacidades generales según el rol vigente. Los permisos efectivos dependen también de la cuenta activa,
          el estado del proyecto y las políticas de Supabase. «Condicionado» requiere requisitos adicionales.
        </p>
        <ul className="max-h-[45dvh] space-y-3 overflow-y-auto pr-1" aria-label="Permisos por rol">
          {items.map((item) => {
            const Icon = iconByState[item.state]
            return <li key={item.key} className="rounded-xl border border-[var(--line)] p-3">
              <div className="flex items-start gap-2">
                <Icon className={`mt-0.5 size-4 shrink-0 ${colorByState[item.state]}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className={`mt-1 text-xs font-semibold ${colorByState[item.state]}`}>{permissionStateLabels[item.state]}</p>
                  {item.state !== 'denied' && <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{item.detail}</p>}
                </div>
              </div>
            </li>
          })}
        </ul>
        <div className="border-t border-[var(--line)] pt-4">
          <button type="button" onClick={() => setShowAdmin((value) => !value)}
            aria-expanded={showAdmin} className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--ink)] underline underline-offset-4">
            <Shield size={15} aria-hidden="true" /> {showAdmin ? 'Ocultar' : 'Consultar'} alcance de Administrador global
          </button>
          {showAdmin && <div className="mt-3 rounded-xl bg-[var(--surface-muted)] p-3 text-xs leading-5">
            El Administrador gestiona cuentas, metadatos e integrantes, pero no accede automáticamente
            a modelos privados ni puede entrenar o aprobar sin membresía y rol técnico explícitos.
            Esta sección es informativa; no indica que este integrante sea Administrador.
          </div>}
        </div>
      </div>}
    </Modal>
  )
}

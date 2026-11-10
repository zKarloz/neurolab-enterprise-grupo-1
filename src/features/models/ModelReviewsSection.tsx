import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CheckCircle2, ClipboardCheck, ShieldAlert } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Notice } from '../../components/ui/Notice'
import { Pagination } from '../../components/ui/Pagination'
import { Surface } from '../../components/ui/Surface'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import type { RegisteredModel, RegisteredVersion } from '../../services/modelRegistry'
import {
  allowedReviewDecisions, currentReviewStates, decideModelReview, listModelReviews,
  reviewDecisionLabels, reviewStatusLabels,
} from '../../services/modelReviews'
import type { ModelReviewEvent, ReviewDecision, ReviewStatus } from '../../services/modelReviews'

interface ModelReviewsSectionProps {
  projectId: string
  models: readonly RegisteredModel[]
  versions: readonly RegisteredVersion[]
}

const PAGE_SIZE = 8

/** M08/F6: historial derivado de eventos append-only, no modifica pesos ni versiones. */
export function ModelReviewsSection({ projectId, models, versions }: ModelReviewsSectionProps) {
  const { state } = useAuth()
  const userId = state.status === 'ready' ? state.user.id : ''
  const [role, setRole] = useState('')
  const [events, setEvents] = useState<ModelReviewEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)
  const [success, setSuccess] = useState('')
  const [page, setPage] = useState(1)
  const [request, setRequest] = useState<{ version: RegisteredVersion; decision: ReviewDecision } | null>(null)
  const [note, setNote] = useState('')
  const states = useMemo(() => currentReviewStates(events), [events])
  const currentPage = Math.min(page, Math.max(1, Math.ceil(versions.length / PAGE_SIZE)))
  const visibleVersions = useMemo(
    () => versions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [versions, currentPage],
  )

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setLoadFailed(false)
    setError('')
    setRole('')
    // La UI muestra permisos; PostgreSQL los vuelve a verificar al registrar decisiones.
    void (async () => {
      if (!supabase || !userId || !projectId) throw new Error('No hay una sesión o proyecto autorizado.')
      const [membership, reviewEvents] = await Promise.all([
        supabase.from('project_members').select('role')
          .eq('project_id', projectId).eq('user_id', userId).maybeSingle(),
        listModelReviews(projectId),
      ])
      if (membership.error || !membership.data) throw new Error('Sin membresía activa en este proyecto.')
      if (mounted) {
        setRole(membership.data.role)
        setEvents(reviewEvents)
      }
    })().catch((cause: unknown) => {
      if (mounted) {
        setLoadFailed(true)
        setError(cause instanceof Error ? cause.message : 'No se pudieron leer las revisiones.')
      }
    }).finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [projectId, userId])

  function requestDecision(version: RegisteredVersion, decision: ReviewDecision) {
    setRequest({ version, decision })
    setNote('')
    setError('')
    setSuccess('')
  }

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!request || busy) return
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await decideModelReview(request.version.id, request.decision, note)
      // No confirmar en la UI hasta releer la fuente de verdad bajo RLS.
      const refreshed = await listModelReviews(projectId)
      setEvents(refreshed)
      setSuccess('Decisión registrada en el historial inmutable y en la auditoría.')
      setRequest(null)
      setNote('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar la revisión.')
    } finally { setBusy(false) }
  }

  function modelName(version: RegisteredVersion) {
    return models.find((model) => model.id === version.model_id)?.name ?? 'Modelo'
  }

  return <Surface className="space-y-5 p-5 sm:p-7">
    <div className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-xl bg-[var(--surface-muted)]"><ClipboardCheck size={20} aria-hidden="true"/></span>
      <div>
        <h2 className="font-semibold">Revisión y aprobación</h2>
      </div>
    </div>
    <p className="text-sm text-[var(--muted)]">
      Solo un Revisor de este proyecto puede marcar como revisada, aprobar, rechazar o retirar una versión ajena.
      Una aprobación no altera los pesos de la versión registrada.
    </p>
    {loading && <p role="status" className="text-sm text-[var(--muted)]">Consultando decisiones de revisión…</p>}
    {!loading && !error && versions.length === 0 && <Notice>Publica una versión para iniciar su revisión.</Notice>}
    {!loading && !loadFailed && versions.length > 0 && <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead><tr className="border-b border-[var(--line)] text-[var(--muted)]">
          <th scope="col" className="p-3">Modelo</th>
          <th scope="col" className="p-3">Versión</th>
          <th scope="col" className="p-3">Estado</th>
          <th scope="col" className="p-3">Última decisión</th>
          <th scope="col" className="p-3">Acciones</th>
        </tr></thead>
        <tbody>{visibleVersions.map((version) => {
          const status: ReviewStatus = states.get(version.id) ?? 'draft'
          const last = events.find((item) => item.model_version_id === version.id)
          // El autor no puede decidir sobre su versión, aunque cambie su rol a Revisor.
          const authoredBySelf = (version as RegisteredVersion & { created_by?: string }).created_by === userId
          const canReview = role === 'reviewer' && !authoredBySelf
          return <tr key={version.id} className="border-b border-[var(--line)] last:border-0">
            <td className="p-3 font-medium">{modelName(version)}</td>
            <td className="p-3 tabular-nums">v{version.version}</td>
            <td className="p-3"><span className="rounded-full border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-1 text-xs font-medium">{reviewStatusLabels[status]}</span></td>
            <td className="p-3 text-xs text-[var(--muted)]">{last ? new Date(last.created_at).toLocaleString('es-PE') : 'Sin revisar'}</td>
            <td className="p-3"><div className="flex flex-wrap gap-2">
              {canReview && allowedReviewDecisions[status].map((decision) => <Button
                key={decision} type="button" variant="outline" disabled={busy || !!request}
                onClick={() => requestDecision(version, decision)}>
                {reviewDecisionLabels[decision]}
              </Button>)}
              {!canReview && <span className="text-xs text-[var(--muted)]">Solo consulta</span>}
              {canReview && allowedReviewDecisions[status].length === 0 &&
                <span className="text-xs text-[var(--muted)]">Estado final</span>}
            </div></td>
          </tr>
        })}</tbody>
      </table>
    </div>}
    {!loading && !loadFailed && events.length > 0 && <details className="rounded-xl border border-[var(--line)] p-4">
      <summary className="cursor-pointer text-sm font-semibold">Historial de decisiones ({events.length} eventos consultados)</summary>
      <ol className="mt-3 space-y-3">{events.slice(0, 12).map((item) => <li key={item.id} className="border-b border-[var(--line)] pb-2 text-sm last:border-0">
        <span className="font-medium">{reviewStatusLabels[item.resulting_status]}</span>
        <span className="ml-2 text-xs text-[var(--muted)]">{new Date(item.created_at).toLocaleString('es-PE')} · Versión {versions.find((version) => version.id === item.model_version_id)?.version ?? '—'}</span>
        {item.note && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--muted)]">{item.note}</p>}
      </li>)}</ol>
    </details>}
    <Pagination page={currentPage} pageSize={PAGE_SIZE} total={versions.length} onPageChange={setPage}/>
    {success && <Notice tone="success"><CheckCircle2 size={16} className="inline"/> {success}</Notice>}
    {error && <Notice tone="error"><ShieldAlert size={16} className="inline"/> {error}</Notice>}
    <Modal open={!!request} title={request ? reviewDecisionLabels[request.decision] : 'Revisión de modelo'}
      onClose={() => { if (!busy) { setRequest(null); setNote('') } }}>
      {request && <form onSubmit={(event) => void submitDecision(event)} className="space-y-4">
        <p className="text-sm text-[var(--muted)]">{modelName(request.version)} · versión {request.version.version}.</p>
        <label htmlFor="review-note" className="block text-sm font-medium">Comentario de revisión</label>
        <textarea id="review-note" value={note} onChange={(event) => setNote(event.target.value)}
          maxLength={1000} rows={4} disabled={busy}
          required={request.decision === 'rejected' || request.decision === 'retired'}
          minLength={request.decision === 'rejected' || request.decision === 'retired' ? 10 : undefined}
          placeholder="Motivo o evidencia de la decisión"
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--ink)] outline-offset-2"/>
        {error && <Notice tone="error">{error}</Notice>}
        <p className="text-xs text-[var(--muted)]">Las decisiones son definitivas en esta versión y quedarán auditadas. Para corregir un rechazo, publica una versión nueva.</p>
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" disabled={busy} onClick={() => setRequest(null)}>Cancelar</Button>
          <Button type="submit" busy={busy}>Confirmar decisión</Button>
        </div>
      </form>}
    </Modal>
  </Surface>
}

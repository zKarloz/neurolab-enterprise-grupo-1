import { useEffect, useState } from 'react'
import { Clock3 } from 'lucide-react'
import { Notice } from '../../components/ui/Notice'
import { Surface } from '../../components/ui/Surface'
import { listRecentRuns } from '../../services/trainingPersistence.ts'
import type { RecentRun } from '../../services/trainingPersistence.ts'

const LABELS: Record<string, string> = {
  created: 'Creada, pendiente de iniciar',
  preparing: 'Preparando',
  running: 'Última actividad registrada (no implica que siga ejecutándose)',
  completed: 'Completada',
  cancelled: 'Cancelada',
  failed: 'Fallida',
  interrupted: 'Interrumpida',
}

/** Resumen de persistencia F3: no sustituye el historial y las gráficas recuperables de F4. */
export function RecentTrainingRuns({ projectId, refresh }: { projectId: string; refresh: number }) {
  const [runs, setRuns] = useState<RecentRun[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let current = true
    setLoading(true)
    setError('')
    void listRecentRuns(projectId).then((data) => {
      if (current) setRuns(data)
    }).catch((cause: unknown) => {
      if (current) setError(cause instanceof Error ? cause.message : 'No se pudieron consultar las ejecuciones.')
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [projectId, refresh])

  return <Surface className="space-y-4 p-5 sm:p-7">
    <div className="flex items-center gap-2"><Clock3 size={20} aria-hidden="true"/><h2 className="text-lg font-semibold">Ejecuciones guardadas en Supabase</h2></div>
    <p className="text-sm text-[var(--muted)]">Resumen de verificación: permanece al recargar. El historial detallado y la comparación de métricas se incorporarán en la Fase 4.</p>
    {loading && <p role="status" className="text-sm">Consultando ejecuciones…</p>}
    {error && <Notice tone="error">{error} Comprueba que ejecutaste la migración de Fase 3.</Notice>}
    {!loading && !error && runs.length === 0 && <p className="text-sm text-[var(--muted)]">Todavía no hay entrenamientos registrados para este proyecto.</p>}
    {!loading && !error && runs.length > 0 && <div className="overflow-x-auto">
      <table className="w-full min-w-[530px] text-left text-sm">
        <thead><tr className="border-b border-[var(--line)] text-xs text-[var(--muted)]"><th className="p-2">Fecha</th><th className="p-2">Estado confirmado</th><th className="p-2">Épocas</th><th className="p-2">Backend</th></tr></thead>
        <tbody>{runs.map((run) => <tr key={run.id} className="border-b border-[var(--line)] last:border-0">
          <td className="p-2">{new Date(run.created_at).toLocaleString('es-PE')}</td>
          <td className="p-2">{LABELS[run.status] ?? run.status}</td>
          <td className="p-2 tabular-nums">{run.completed_epochs}/{run.epochs_planned}</td>
          <td className="p-2">{run.backend?.toUpperCase() ?? 'Pendiente'}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </Surface>
}

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { GitCompareArrows } from 'lucide-react'
import { Notice } from '../../components/ui/Notice'
import { Surface } from '../../components/ui/Surface'
import { buildValidationComparison, compareTestMetrics } from '../../ml/evaluation/comparison.ts'
import type { EpochMetrics } from '../../ml/training/types.ts'
import type { TestEvaluation } from '../../ml/evaluation/metrics.ts'
import type { HistoryRun } from '../../services/evaluationPersistence.ts'

type RunDetail = { epochs: EpochMetrics[]; evaluation: TestEvaluation | null }
interface Props { first: HistoryRun; second: HistoryRun; firstDetail: RunDetail; secondDetail: RunDetail }

function show(value: number | null): string {
  return value === null ? 'No definido' : value.toLocaleString('es-PE', { maximumFractionDigits: 6 })
}

/**
 * Compara dos ejecuciones autorizadas sin declarar ganadores.
 * Las columnas A/B comparten los tokens de color de las líneas: se adaptan a ambos temas.
 */
export function RunComparison({ first, second, firstDetail, secondDetail }: Props) {
  const metrics = compareTestMetrics(firstDetail.evaluation, secondDetail.evaluation)
  const loss = buildValidationComparison(firstDetail.epochs, secondDetail.epochs)
  const labels = [first.id.slice(0, 8), second.id.slice(0, 8)]
  return <Surface className="space-y-4 p-5 sm:p-7">
    <div className="flex flex-wrap items-center gap-2"><GitCompareArrows size={20}/><h3 className="text-lg font-semibold">Comparación de dos ejecuciones</h3></div>
    <p className="text-xs text-[var(--muted)]">A: {first.id} · B: {second.id}. Datos leídos de Supabase y protegidos por RLS.</p>
    <div className="overflow-x-auto"><table className="w-full min-w-[360px] text-left text-sm">
      <thead><tr className="border-b border-[var(--line)]"><th className="p-2">Medida</th><th className="p-2 font-semibold text-[var(--chart-train)]">A · {labels[0]}</th><th className="p-2 font-semibold text-[var(--chart-validation)]">B · {labels[1]}</th></tr></thead>
      <tbody>
        <tr className="border-b border-[var(--line)]"><td className="p-2">Épocas confirmadas</td><td className="p-2 font-medium text-[var(--chart-train)]">{first.completed_epochs}</td><td className="p-2 font-medium text-[var(--chart-validation)]">{second.completed_epochs}</td></tr>
        <tr className="border-b border-[var(--line)]"><td className="p-2">Backend</td><td className="p-2 font-medium text-[var(--chart-train)]">{first.backend?.toUpperCase() ?? '—'}</td><td className="p-2 font-medium text-[var(--chart-validation)]">{second.backend?.toUpperCase() ?? '—'}</td></tr>
        {metrics.map((metric) => <tr key={metric.metric} className="border-b border-[var(--line)] last:border-0"><td className="p-2">{metric.metric}</td><td className="p-2 tabular-nums font-medium text-[var(--chart-train)]">{show(metric.first)}</td><td className="p-2 tabular-nums font-medium text-[var(--chart-validation)]">{show(metric.second)}</td></tr>)}
      </tbody>
    </table></div>
    {metrics.length === 0 && <Notice>Una o ambas ejecuciones no tienen evaluación de prueba confirmada. La comparación de test queda incompleta.</Notice>}
    {loss.length > 0 && <div className="space-y-2">
      <h4 className="text-sm font-semibold">Pérdida de validación por época</h4>
      <div className="h-64 w-full" role="img" aria-label="Comparación de pérdidas de validación confirmadas de dos ejecuciones">
        <ResponsiveContainer width="100%" height="100%"><LineChart data={loss} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 4" stroke="var(--line)"/>
          <XAxis dataKey="epoch" allowDecimals={false} tick={{ fill: 'var(--muted)', fontSize: 11 }}/>
          <YAxis domain={['auto', 'auto']} width={55} tick={{ fill: 'var(--muted)', fontSize: 11 }}/>
          <Tooltip contentStyle={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)' }}/>
          <Legend wrapperStyle={{ fontSize: 12 }}/>
          <Line type="monotone" dataKey="first" name={`A · ${labels[0]}`} stroke="var(--chart-train)" strokeWidth={2.5} connectNulls={false} isAnimationActive={false}/>
          <Line type="monotone" dataKey="second" name={`B · ${labels[1]}`} stroke="var(--chart-validation)" strokeWidth={2.5} connectNulls={false} isAnimationActive={false}/>
        </LineChart></ResponsiveContainer>
      </div>
    </div>}
    <p className="text-xs text-[var(--muted)]">La comparación es descriptiva: si los datasets, particiones o semillas difieren, sus métricas de prueba no son directamente equivalentes. No se usa test para ajustar hiperparámetros.</p>
  </Surface>
}

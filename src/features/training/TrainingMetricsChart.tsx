import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { EpochMetrics } from '../../ml/training/types.ts'
import type { ProblemType } from '../../ml/preprocessing/types.ts'

type Props = { epochs: EpochMetrics[]; problemType: ProblemType }

/** Gráfica incremental: muestra exclusivamente los datos recibidos de onEpochEnd. */
export function TrainingMetricsChart({ epochs, problemType }: Props) {
  const data = epochs.map((entry) => ({
    epoch: entry.epoch,
    trainLoss: entry.loss,
    validationLoss: entry.validationLoss,
    trainMetric: entry.metric,
    validationMetric: entry.validationMetric,
  }))
  const metricLabel = problemType === 'binary' ? 'Exactitud' : 'MAE'
  const tooltipContentStyle = {
    backgroundColor: 'var(--surface)', border: '1px solid var(--line)',
    borderRadius: '12px', color: 'var(--ink)', fontSize: '12px',
  }


  return (
    <div className="grid gap-5 lg:grid-cols-2" aria-label="Evolución de métricas reales por época">
      <div className="min-w-0 rounded-xl border border-[var(--line)] p-3 sm:p-4">
        <h4 className="mb-4 text-sm font-semibold">Pérdida por época</h4>
        <div className="h-60 w-full" role="img" aria-label={`Evolución de pérdida de entrenamiento y validación; ${epochs.length} épocas observadas`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 6, left: 0 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" />
              <XAxis dataKey="epoch" allowDecimals={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
              <YAxis domain={['auto', 'auto']} width={50} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={(v: number) => Number(v).toPrecision(3)} />
              <Tooltip contentStyle={tooltipContentStyle} formatter={(value) =>
                typeof value === 'number' ? Number(value.toFixed(6)) : (value ?? '—')
              } />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="trainLoss" name="Entrenamiento" stroke="var(--chart-train)" strokeWidth={2.5} dot={{ r: 2 }} isAnimationActive="auto" animationDuration={250} />
              <Line type="monotone" dataKey="validationLoss" name="Validación" stroke="var(--chart-validation)" strokeWidth={2.5} dot={{ r: 2 }} isAnimationActive="auto" animationDuration={250} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="min-w-0 rounded-xl border border-[var(--line)] p-3 sm:p-4">
        <h4 className="mb-4 text-sm font-semibold">{metricLabel} por época</h4>
        <div className="h-60 w-full" role="img" aria-label={`Evolución de ${metricLabel.toLowerCase()} de entrenamiento y validación; ${epochs.length} épocas observadas`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 6, left: 0 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" />
              <XAxis dataKey="epoch" allowDecimals={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
              <YAxis domain={problemType === 'binary' ? [0, 1] : ['auto', 'auto']} width={50} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={(v: number) => Number(v).toPrecision(3)} />
              <Tooltip contentStyle={tooltipContentStyle} formatter={(value) =>
                typeof value === 'number' ? Number(value.toFixed(6)) : (value ?? '—')
              } />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="trainMetric" connectNulls={false} name="Entrenamiento" stroke="var(--chart-train)" strokeWidth={2.5} dot={{ r: 2 }} isAnimationActive="auto" animationDuration={250} />
              <Line type="monotone" dataKey="validationMetric" connectNulls={false} name="Validación" stroke="var(--chart-validation)" strokeWidth={2.5} dot={{ r: 2 }} isAnimationActive="auto" animationDuration={250} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="lg:col-span-2 text-xs text-[var(--muted)]" aria-live="polite">
        {epochs.length} épocas reales recibidas de TensorFlow.js. Las líneas se actualizan al finalizar cada época; la animación respeta la configuración de movimiento reducido del sistema.
      </p>
    </div>
  )
}

/** Curvas de métricas reales de CNN. Reutiliza Recharts y la paleta de NeuroLab. */
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CnnEpochMetrics } from '../../ml/cnn/trainingTypes.ts'

export function CnnMetricsChart({ epochs }: { epochs: CnnEpochMetrics[] }) {
  return <div className="grid gap-4 lg:grid-cols-2" aria-label="Métricas CNN por época">
    {[
      { title: 'Pérdida · crossentropy', training: 'loss', validation: 'validationLoss', max: 'auto' },
      { title: 'Exactitud · multiclase', training: 'accuracy', validation: 'validationAccuracy', max: 1 },
    ].map(({ title, training, validation, max }) => <div key={training} className="min-w-0 rounded-xl border border-[var(--line)] p-3 sm:p-4">
      <h3 className="mb-4 text-sm font-semibold">{title}</h3>
      <div className="h-56 w-full" role="img" aria-label={`${title}: ${epochs.length} épocas`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={epochs} margin={{ top: 6, right: 12, bottom: 5, left: 0 }}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" />
            <XAxis dataKey="epoch" allowDecimals={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
            <YAxis domain={max === 1 ? [0, 1] : ['auto', 'auto']} width={50} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={(value: number) => Number(value.toPrecision(3)).toString()} />
            <Tooltip contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px' }} formatter={(value) => typeof value === 'number' ? Number(value.toFixed(5)) : value} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line dataKey={training} name="Entrenamiento" stroke="var(--chart-train)" strokeWidth={2.5} dot={{ r: 2 }} isAnimationActive={false} />
            <Line dataKey={validation} name="Validación" stroke="var(--chart-validation)" strokeWidth={2.5} dot={{ r: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>)}
  </div>
}

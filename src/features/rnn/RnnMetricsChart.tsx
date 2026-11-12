/** Curvas por época RNN-2: todas las cifras proceden de model.fit(). */
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { RnnEpochMetrics } from '../../ml/rnn/trainingTypes.ts'

export function RnnMetricsChart({ epochs, regression }: { epochs: RnnEpochMetrics[]; regression: boolean }) {
  return <div className="grid gap-4 lg:grid-cols-2" aria-label="Métricas RNN reales por época">
    {[
      { title: regression ? 'Pérdida · MSE (objetivo escalado)' : 'Pérdida · entropía cruzada', train: 'loss', valid: 'validationLoss', maximum: false },
      { title: regression ? 'MAE (objetivo escalado)' : 'Exactitud', train: 'metric', valid: 'validationMetric', maximum: !regression },
    ].map(({ title, train, valid, maximum }) => <div key={title} className="min-w-0 rounded-xl border border-[var(--line)] p-3 sm:p-4">
      <h3 className="mb-4 text-sm font-semibold">{title}</h3>
      <div className="h-56 w-full" role="img" aria-label={`${title} durante ${epochs.length} épocas`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={epochs} margin={{ top: 6, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" />
            <XAxis dataKey="epoch" allowDecimals={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
            <YAxis width={50} domain={maximum ? [0, 1] : ['auto', 'auto']} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
            <Tooltip contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12 }} formatter={(value) => typeof value === 'number' ? Number(value.toFixed(5)) : value} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line dataKey={train} name="Entrenamiento" stroke="var(--chart-train)" strokeWidth={2.5} dot={{ r: 2 }} isAnimationActive={false} />
            <Line dataKey={valid} name="Validación" stroke="var(--chart-validation)" strokeWidth={2.5} dot={{ r: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>)}
  </div>
}

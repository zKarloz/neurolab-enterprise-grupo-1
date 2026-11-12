/** Curvas históricas G/D de GAN-2: datos exclusivamente reales del entrenamiento TF.js. */
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { GanEpochMetrics } from '../../ml/gan/trainingTypes.ts'

export function GanMetricsChart({ epochs }: { epochs: GanEpochMetrics[] }) {
  return <div className="grid gap-4 lg:grid-cols-2" aria-label="Métricas adversariales por época">
    {[
      { title: 'Entropía cruzada adversarial', first: 'generatorLoss', second: 'discriminatorLoss', labelA: 'Pérdida G', labelB: 'Pérdida D', probabilities: false },
      { title: 'Probabilidad estimada por D', first: 'realScore', second: 'fakeScore', labelA: 'D(real)', labelB: 'D(falso)', probabilities: true },
    ].map(({ title, first, second, labelA, labelB, probabilities }) => <div key={title} className="min-w-0 rounded-xl border border-[var(--line)] p-3 sm:p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="h-56 w-full" role="img" aria-label={`${title}: ${epochs.length} épocas`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={epochs} margin={{ top: 6, right: 10, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" />
            <XAxis dataKey="epoch" allowDecimals={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
            <YAxis width={48} domain={probabilities ? [0, 1] : ['auto', 'auto']} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
            <Tooltip contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12 }} formatter={(value) => typeof value === 'number' ? value.toFixed(4) : value} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line dataKey={first} name={labelA} stroke="var(--chart-train)" strokeWidth={2.5} isAnimationActive={false} />
            <Line dataKey={second} name={labelB} stroke="var(--chart-validation)" strokeWidth={2.5} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>)}
  </div>
}

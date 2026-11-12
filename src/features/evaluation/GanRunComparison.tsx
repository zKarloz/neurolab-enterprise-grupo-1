/** GAN-4D: comparación descriptiva; ninguna pérdida es un indicador de ganador. */
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Notice } from '../../components/ui/Notice'
import { Surface } from '../../components/ui/Surface'
import type { HistoryDetail, HistoryRun } from '../../services/evaluationPersistence.ts'
import { isGanStoredEvaluation } from '../../ml/evaluation/ganStoredEvaluation.ts'

export function GanRunComparison({ first, second, firstDetail, secondDetail }: {
  first: HistoryRun; second: HistoryRun; firstDetail: HistoryDetail; secondDetail: HistoryDetail
}) {
  // La selección y el renderizado exigen familia GAN y misma resolución.
  if (first.family !== 'gan' || second.family !== 'gan' || first.ganDimension === null
    || second.ganDimension !== first.ganDimension) {
    return <Notice tone="error">Las GAN deben tener la misma resolución para compararse.</Notice>
  }
  const left = firstDetail.ganEpochs
  const right = secondDetail.ganEpochs
  const firstSummary = firstDetail.evaluation
  const secondSummary = secondDetail.evaluation
  const rows = [
    ['Pérdida G · última época', left.at(-1)?.generatorLoss, right.at(-1)?.generatorLoss],
    ['Pérdida D · última época', left.at(-1)?.discriminatorLoss, right.at(-1)?.discriminatorLoss],
    ['D(real) · última época', left.at(-1)?.realScore, right.at(-1)?.realScore],
    ['D(falso) · última época', left.at(-1)?.fakeScore, right.at(-1)?.fakeScore],
    ['Brillo medio · primer lote', isGanStoredEvaluation(firstSummary) ? firstSummary.meanIntensity : null,
      isGanStoredEvaluation(secondSummary) ? secondSummary.meanIntensity : null],
    ['Diferencia media · primer lote', isGanStoredEvaluation(firstSummary) ? firstSummary.meanPairwiseDistance : null,
      isGanStoredEvaluation(secondSummary) ? secondSummary.meanPairwiseDistance : null],
  ] as const
  const byEpoch = new Map<number, { epoch: number; gA?: number; gB?: number; dA?: number; dB?: number }>()
  for (const value of left) byEpoch.set(value.epoch, { ...(byEpoch.get(value.epoch) ?? { epoch: value.epoch }), gA: value.generatorLoss, dA: value.discriminatorLoss })
  for (const value of right) byEpoch.set(value.epoch, { ...(byEpoch.get(value.epoch) ?? { epoch: value.epoch }), gB: value.generatorLoss, dB: value.discriminatorLoss })
  const chart = [...byEpoch.values()].sort((a, b) => a.epoch - b.epoch)
  const show = (value: number | null | undefined) => value === null || value === undefined ? '—' : value.toFixed(4)
  return <Surface className="space-y-4 p-5 sm:p-7">
    <h3 className="text-lg font-semibold">Comparación GAN · {first.ganDimension}×{first.ganDimension}</h3>
    <p className="break-words text-xs text-[var(--muted)]">A: {first.id} · B: {second.id}. Solo ejecuciones de la misma familia y resolución.</p>
    <div className="overflow-x-auto"><table className="w-full min-w-[360px] text-left text-sm">
      <thead><tr className="border-b border-[var(--line)]"><th className="p-2">Diagnóstico</th><th className="p-2">A</th><th className="p-2">B</th></tr></thead>
      <tbody>{rows.map(([label, a, b]) => <tr className="border-b border-[var(--line)] last:border-0" key={label}>
        <td className="p-2">{label}</td><td className="p-2 tabular-nums">{show(a)}</td><td className="p-2 tabular-nums">{show(b)}</td>
      </tr>)}</tbody>
    </table></div>
    {chart.length > 0 && <div className="h-64" role="img" aria-label="Curvas comparativas de pérdidas adversariales de ambas GAN">
      <ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="var(--line)" strokeDasharray="3 4"/>
        <XAxis dataKey="epoch" allowDecimals={false} tick={{ fill: 'var(--muted)', fontSize: 11 }}/>
        <YAxis domain={['auto', 'auto']} width={54} tick={{ fill: 'var(--muted)', fontSize: 11 }}/>
        <Tooltip contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)' }}/>
        <Legend wrapperStyle={{ fontSize: 12 }}/>
        <Line dataKey="gA" name="G · A" type="monotone" stroke="var(--chart-train)" strokeWidth={2.5} isAnimationActive={false}/>
        <Line dataKey="gB" name="G · B" type="monotone" stroke="var(--chart-train)" strokeDasharray="5 4" strokeWidth={2} isAnimationActive={false}/>
        <Line dataKey="dA" name="D · A" type="monotone" stroke="var(--chart-validation)" strokeWidth={2.5} isAnimationActive={false}/>
        <Line dataKey="dB" name="D · B" type="monotone" stroke="var(--chart-validation)" strokeDasharray="5 4" strokeWidth={2} isAnimationActive={false}/>
      </LineChart></ResponsiveContainer>
    </div>}
    <Notice>Comparación descriptiva. Las pérdidas G/D no establecen cuál generador produce mejores imágenes. Los lotes y los datasets pueden ser diferentes; no se calcula una medida de realismo.</Notice>
  </Surface>
}

import { Surface } from '../../components/ui/Surface'
import type { RnnStoredEvaluation } from '../../ml/evaluation/rnnStoredEvaluation.ts'

function number(value: number | null): string {
  return value === null ? 'No definido (objetivo constante)' : value.toLocaleString('es-PE', { maximumFractionDigits: 6 })
}

/** Test RNN histórico: únicamente agregados recuperados bajo RLS; no muestra ventanas. */
export function RnnStoredEvaluationCard({ evaluation }: { evaluation: RnnStoredEvaluation }) {
  const metrics: Array<[string, number | null]> = evaluation.problemType === 'regression'
    ? [['MSE', evaluation.mse], ['RMSE', evaluation.rmse], ['MAE', evaluation.mae], ['R²', evaluation.r2]]
    : [['Accuracy', evaluation.accuracy], ['Precisión macro', evaluation.macroPrecision],
      ['Recall macro', evaluation.macroRecall], ['F1 macro', evaluation.macroF1]]
  return <Surface className="space-y-4 p-5 sm:p-6">
    <h3 className="text-lg font-semibold">Evaluación RNN · test temporal confirmado en Supabase</h3>
    <p className="text-sm text-[var(--muted)]">
      {evaluation.sampleCount} ventanas de test. Las métricas de regresión están en la escala original del objetivo.
      Solo se persistieron agregados; las ventanas y predicciones individuales permanecen locales.
    </p>
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">{metrics.map(([label, value]) =>
      <div key={label} className="rounded-xl bg-[var(--surface-muted)] p-3">
        <dt className="text-xs text-[var(--muted)]">{label}</dt>
        <dd className="mt-2 font-semibold tabular-nums">{number(value)}</dd>
      </div>)}</dl>
    {evaluation.problemType !== 'regression' && <>
      <h4 className="font-semibold">Matriz de confusión · {evaluation.problemType === 'binary' ? 'binaria' : 'multiclase'}</h4>
      <p className="text-xs text-[var(--muted)]">Filas: clase real · Columnas: clase predicha. No se almacenan ejemplos individuales.</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[360px] text-center text-sm tabular-nums">
        <thead><tr className="border-b border-[var(--line)]"><th scope="col" className="p-2 text-left">Real / Pred.</th>
          {evaluation.classNames.map((name) => <th scope="col" key={name} className="p-2">{name}</th>)}
        </tr></thead>
        <tbody>{evaluation.matrix.map((row, rowIndex) => <tr key={evaluation.classNames[rowIndex]} className="border-b border-[var(--line)]">
          <th scope="row" className="p-2 text-left font-medium">{evaluation.classNames[rowIndex]}</th>
          {row.map((count, column) => <td key={column} className={`p-2 ${rowIndex === column ? 'font-semibold' : ''}`}>{count}</td>)}
        </tr>)}</tbody>
      </table></div>
    </>}
  </Surface>
}

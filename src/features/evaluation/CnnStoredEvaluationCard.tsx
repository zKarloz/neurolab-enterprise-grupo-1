import { Surface } from '../../components/ui/Surface'
import { cnnStoredClassMetrics, type CnnStoredEvaluation } from '../../ml/evaluation/cnnStoredEvaluation.ts'

const percent = (n: number) => `${(n * 100).toFixed(2)} %`

/** Historial CNN: solo resumen agregado protegido por RLS; nunca imágenes individuales. */
export function CnnStoredEvaluationCard({ evaluation }: { evaluation: CnnStoredEvaluation }) {
  const classes = cnnStoredClassMetrics(evaluation)
  return <Surface className="space-y-4 p-5 sm:p-6">
    <h3 className="text-lg font-semibold">Evaluación CNN · test confirmado en Supabase</h3>
    <p className="text-sm text-[var(--muted)]">{evaluation.sampleCount} imágenes de prueba. Se almacena la matriz agregada, no píxeles ni ejemplos individuales.</p>
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {[
        ['Loss', evaluation.loss.toFixed(5)], ['Accuracy', percent(evaluation.accuracy)],
        ['Precisión macro', percent(evaluation.macroPrecision)], ['Recall macro', percent(evaluation.macroRecall)],
        ['F1 macro', percent(evaluation.macroF1)],
      ].map(([title, value]) => <div key={title} className="rounded-xl bg-[var(--surface-muted)] p-3"><dt className="text-xs text-[var(--muted)]">{title}</dt><dd className="mt-2 font-semibold tabular-nums">{value}</dd></div>)}
    </dl>
    <h4 className="font-semibold">Matriz de confusión</h4>
    <p className="text-xs text-[var(--muted)]">Filas: clases reales · Columnas: clases predichas.</p>
    <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-center text-xs tabular-nums">
      <thead><tr><th scope="col" className="p-2">Real / Pred.</th>{evaluation.classNames.map((label) => <th scope="col" key={label} className="p-2">{label}</th>)}</tr></thead>
      <tbody>{evaluation.matrix.map((row, index) => <tr key={evaluation.classNames[index]}>
        <th scope="row" className="p-2 text-left">{evaluation.classNames[index]}</th>
        {row.map((value, column) => <td key={column} className={`border border-[var(--line)] p-2 ${index === column ? 'font-bold' : ''}`}>{value}</td>)}
      </tr>)}</tbody>
    </table></div>
    <h4 className="font-semibold">Métricas por clase · reconstruidas desde la matriz</h4>
    <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-left text-sm">
      <thead><tr className="border-b border-[var(--line)]"><th className="p-2">Clase</th><th className="p-2">Soporte</th><th className="p-2">Precisión</th><th className="p-2">Recall</th><th className="p-2">F1</th></tr></thead>
      <tbody>{classes.map((item) => <tr key={item.label} className="border-b border-[var(--line)]"><th className="p-2 font-medium">{item.label}</th><td className="p-2 tabular-nums">{item.support}</td><td className="p-2 tabular-nums">{percent(item.precision)}</td><td className="p-2 tabular-nums">{percent(item.recall)}</td><td className="p-2 tabular-nums">{percent(item.f1)}</td></tr>)}</tbody>
    </table></div>
  </Surface>
}

/** Panel de test histórico solo en la sesión RNN; valores provenientes de inferencia real. */
import { useEffect, useState } from 'react'
import { Pagination } from '../../components/ui/Pagination'
import { BarChart3 } from 'lucide-react'
import { Notice } from '../../components/ui/Notice'
import { Surface } from '../../components/ui/Surface'
import type { RnnTestEvaluation } from '../../ml/rnn/evaluation.ts'

function number(value: number | null, digits = 4): string { return value === null ? 'No definido' : value.toFixed(digits) }

export function RnnEvaluationPanel({ report }: { report: RnnTestEvaluation | null }) {
  const [page, setPage] = useState(1)
  const pageSize = 8
  // Una nueva evaluación siempre comienza desde la primera página.
  useEffect(() => { setPage(1) }, [report])
  const pageCount = Math.max(1, Math.ceil((report?.examples.length ?? 0) / pageSize))
  const visiblePage = Math.min(page, pageCount)
  const visibleExamples = report?.examples.slice((visiblePage - 1) * pageSize, visiblePage * pageSize) ?? []
  if (!report) return <Surface className="space-y-3 p-6">
    <h2 className="flex items-center gap-2 text-lg font-semibold"><BarChart3 size={19} /> Evaluación temporal</h2>
    <Notice>Finaliza primero un entrenamiento RNN. El test se evalúa una sola vez después de entrenar; no participa en el ajuste de pesos ni hiperparámetros.</Notice>
  </Surface>
  return <div className="space-y-5">
    <Notice tone="success">Resultados reales sobre {report.count} ventanas temporales de test reservadas, sin solapamiento con entrenamiento ni validación. Son datos del mismo CSV, no una garantía de generalización a series externas.</Notice>
    {report.kind === 'regression' ? <Surface className="space-y-4 p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Regresión · escala original del objetivo</h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[
        ['MSE', number(report.mse)], ['RMSE', number(report.rmse)], ['MAE', number(report.mae)], ['R²', number(report.r2)],
      ].map(([label, value]) => <div key={label} className="rounded-xl bg-[var(--surface-muted)] p-3"><dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value}</dd></div>)}</dl>
      {report.r2 === null && <p className="text-sm text-[var(--muted)]">R² no está definido para un objetivo de test constante.</p>}
    </Surface> : <Surface className="space-y-4 p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Clasificación · evaluación de test</h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">{([
        ['Accuracy', report.accuracy], ['Precisión macro', report.macroPrecision], ['Recall macro', report.macroRecall], ['F1 macro', report.macroF1],
      ] satisfies Array<[string, number]>).map(([label, value]) => <div key={label} className="rounded-xl bg-[var(--surface-muted)] p-3"><dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{(value * 100).toFixed(1)} %</dd></div>)}</dl>
      <h3 className="font-semibold">Matriz de confusión</h3>
      <p className="text-xs text-[var(--muted)]">Filas: etiqueta real · columnas: etiqueta predicha.</p>
      <div className="overflow-x-auto"><table className="w-full min-w-80 border-collapse text-center text-xs"><thead><tr><th scope="col" className="p-2 text-left">Real / Pred.</th>{report.classes.map((label) => <th scope="col" className="p-2" key={label}>{label}</th>)}</tr></thead>
      <tbody>{report.confusion.map((row, i) => <tr key={report.classes[i]} className="border-t border-[var(--line)]"><th scope="row" className="p-2 text-left">{report.classes[i]}</th>{row.map((count, j) => <td className="p-2 tabular-nums" key={report.classes[j]}>{count}</td>)}</tr>)}</tbody></table></div>
    </Surface>}
    <Surface className="space-y-3 p-5 sm:p-6">
      <h3 className="font-semibold">Resultados individuales de test (paginados)</h3>
      <p className="text-xs text-[var(--muted)]">{report.examples.length} resultados calculados en memoria; 8 por página. Todos contribuyen a las métricas globales. No se almacenan en Supabase.</p>
      <div className="overflow-x-auto"><table className="w-full min-w-96 text-left text-sm"><thead><tr className="border-b border-[var(--line)]"><th scope="col" className="p-2">Serie</th><th scope="col" className="p-2">Tiempo objetivo</th><th scope="col" className="p-2">Real</th><th scope="col" className="p-2">Predicho</th></tr></thead>
      <tbody>{visibleExamples.map((sample, index) => <tr key={`${sample.seriesId}-${sample.targetTime}-${index}`} className="border-b border-[var(--line)]"><td className="p-2">{sample.seriesId}</td><td className="p-2 tabular-nums">{sample.targetTime}</td><td className="p-2 tabular-nums">{typeof sample.actual === 'number' ? number(sample.actual) : sample.actual}</td><td className="p-2 tabular-nums">{typeof sample.predicted === 'number' ? number(sample.predicted) : sample.predicted}</td></tr>)}</tbody></table></div>
      <Pagination page={visiblePage} pageSize={pageSize} total={report.examples.length} onPageChange={setPage} />
    </Surface>
  </div>
}

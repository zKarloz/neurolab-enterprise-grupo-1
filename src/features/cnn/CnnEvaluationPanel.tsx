/** Métricas de test multiclase; filas=real, columnas=predicho. */
import { BarChart3, Grid3X3, Info } from 'lucide-react'
import { Notice } from '../../components/ui/Notice'
import { Surface } from '../../components/ui/Surface'
import type { CnnEvaluation } from '../../ml/cnn/cnnEvaluation.ts'
import { CnnPixelCanvas } from './CnnPixelCanvas'

const percent = (value: number) => `${(value * 100).toFixed(1)} %`

export function CnnEvaluationPanel({ report, inputSize, onTrain }: {
  report: CnnEvaluation | null
  inputSize: number
  onTrain: () => void
}) {
  if (!report) return <Surface className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
    <BarChart3 size={30} className="text-[var(--muted)]" />
    <h2 className="text-lg font-semibold">Todavía no hay evaluación</h2>
    <p className="max-w-xl text-sm text-[var(--muted)]">Carga un CSV en Datos y finaliza un entrenamiento para evaluar imágenes de test independientes.</p>
    <button type="button" className="text-sm font-semibold underline underline-offset-4" onClick={onTrain}>Ir a Entrenar</button>
  </Surface>
  const maxCount = Math.max(1, ...report.matrix.flat())
  return <div className="space-y-5">
    <Notice tone="success">Evaluación obtenida sobre {report.sampleCount} imágenes que no participaron ni en entrenamiento ni en validación. No son datos simulados.</Notice>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[
        ['Accuracy test', percent(report.accuracy)],
        ['Loss test', report.loss.toFixed(4)],
        ['Precisión macro', percent(report.macroPrecision)],
        ['Recall macro', percent(report.macroRecall)],
        ['F1 macro', percent(report.macroF1)],
      ].map(([label, value]) => <Surface className="p-4" key={label}>
        <p className="text-xs text-[var(--muted)]">{label}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      </Surface>)}
    </div>
    <Surface className="p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Grid3X3 size={19} /> Matriz de confusión</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">Filas: clase real · Columnas: clase predicha. La diagonal muestra los aciertos.</p>
      <div className="mt-5 max-w-full overflow-x-auto">
        <table className="w-full min-w-[480px] border-separate border-spacing-1 text-center text-xs tabular-nums" aria-label="Matriz de confusión CNN">
          <thead><tr><th scope="col" className="p-2 text-[var(--muted)]">Real ↓ / Pred. →</th>
            {report.classNames.map((label) => <th scope="col" key={label} className="p-2">{label}</th>)}
          </tr></thead>
          <tbody>{report.matrix.map((row, real) => <tr key={report.classNames[real]}>
            <th scope="row" className="p-2 text-left font-semibold">{report.classNames[real]}</th>
            {row.map((count, predicted) => <td key={predicted} title={`${report.classNames[real]} → ${report.classNames[predicted]}: ${count}`}
              style={{ backgroundColor: `color-mix(in srgb, var(--chart-train) ${Math.round(8 + count / maxCount * 65)}%, var(--surface))` }}
              className={`rounded-md p-2 ${real === predicted ? 'font-semibold' : ''}`}>{count}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </Surface>
    <Surface className="p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Rendimiento por clase</h2>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[440px] text-left text-sm">
        <thead><tr className="border-b border-[var(--line)] text-xs text-[var(--muted)]"><th className="p-3">Clase</th><th className="p-3 text-right">Test</th><th className="p-3 text-right">Precisión</th><th className="p-3 text-right">Recall</th><th className="p-3 text-right">F1</th></tr></thead>
        <tbody>{report.classes.map((item) => <tr key={item.label} className="border-b border-[var(--line)] last:border-0">
          <th scope="row" className="p-3 font-medium">{item.label}</th><td className="p-3 text-right tabular-nums">{item.support}</td>
          <td className="p-3 text-right tabular-nums">{percent(item.precision)}</td><td className="p-3 text-right tabular-nums">{percent(item.recall)}</td>
          <td className="p-3 text-right tabular-nums">{percent(item.f1)}</td>
        </tr>)}</tbody>
      </table></div>
    </Surface>
    <Surface className="p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Info size={19} /> Ejemplos de la evaluación</h2>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Se priorizan hasta 12 errores y 6 aciertos. Son muestras reales del subconjunto test.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {report.examples.map((item) => <div key={item.index} className="rounded-xl border border-[var(--line)] p-3">
          <CnnPixelCanvas pixels={item.pixels} size={inputSize} label={`Test: ${report.classNames[item.actual]}`} />
          <p className="mt-2 text-xs">Real: <strong>{report.classNames[item.actual]}</strong></p>
          <p className="text-xs">Pred.: <strong>{report.classNames[item.predicted]}</strong></p>
          <p className="mt-1 text-xs text-[var(--muted)]">{percent(item.confidence)}</p>
          <p className={`mt-1 text-xs font-medium ${item.actual === item.predicted ? 'text-[var(--muted)]' : 'underline underline-offset-2'}`}>{item.actual === item.predicted ? 'Acierto' : 'Error'}</p>
        </div>)}
      </div>
    </Surface>
  </div>
}

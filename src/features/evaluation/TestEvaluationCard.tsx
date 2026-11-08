import { Notice } from '../../components/ui/Notice'
import { Surface } from '../../components/ui/Surface'
import type { TestEvaluation } from '../../ml/evaluation/metrics.ts'

function format(value: number | null): string {
  return value === null ? 'No definido (objetivo constante)' : Number(value.toFixed(6)).toLocaleString('es-PE', { maximumFractionDigits: 6 })
}

/** Presentación compartida para test actual e histórico; nunca muestra etiquetas individuales. */
export function TestEvaluationCard({ evaluation, confirmed }: { evaluation: TestEvaluation; confirmed: boolean }) {
  const metrics: Array<[string, number | null]> = evaluation.problemType === 'binary'
    ? [
        ['Pérdida BCE', evaluation.loss], ['Accuracy', evaluation.accuracy],
        ['Precisión', evaluation.precision], ['Recall', evaluation.recall], ['F1', evaluation.f1],
      ]
    : [
        ['MSE', evaluation.mse], ['RMSE', evaluation.rmse], ['MAE', evaluation.mae], ['R²', evaluation.r2],
      ]
  return <Surface className="space-y-4 p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-lg font-semibold">Evaluación final · conjunto de prueba</h3>
      <span className="text-xs text-[var(--muted)]">{evaluation.samples} observaciones · {confirmed ? 'Confirmada en Supabase' : 'Calculada localmente'}</span>
    </div>
    <p className="text-sm text-[var(--muted)]">Se ejecuta después de entrenar; test no ajusta pesos, escaladores ni hiperparámetros.</p>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {metrics.map(([label, value]) => <div key={label} className="rounded-xl bg-[var(--surface-muted)] p-3">
        <p className="text-xs text-[var(--muted)]">{label}</p>
        <p className="mt-2 break-words font-semibold tabular-nums">{format(value)}</p>
      </div>)}
    </div>
    {evaluation.problemType === 'binary' && <div className="space-y-2">
      <h4 className="text-sm font-semibold">Matriz de confusión · umbral {evaluation.threshold}</h4>
      <div className="grid grid-cols-2 gap-2 sm:max-w-sm" aria-label="Conteos de positivos y negativos según el objetivo real y la predicción">
        {[
          ['Verdadero positivo', evaluation.confusion.tp], ['Falso negativo', evaluation.confusion.fn],
          ['Falso positivo', evaluation.confusion.fp], ['Verdadero negativo', evaluation.confusion.tn],
        ].map(([label, count]) => <div key={label} className="rounded-lg border border-[var(--line)] p-3">
          <p className="text-xs text-[var(--muted)]">{label}</p><p className="font-semibold tabular-nums">{count}</p>
        </div>)}
      </div>
    </div>}
    {!confirmed && <Notice>El resultado es local hasta recibir la confirmación de Supabase.</Notice>}
  </Surface>
}

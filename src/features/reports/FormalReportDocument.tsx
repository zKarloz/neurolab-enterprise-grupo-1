import type { ProjectReportSnapshot } from '../../services/reporting'
import { familyForReportProblem, familyLabel, reportRunsByFamily, type FamilyFilter } from '../../ml/evaluation/families.ts'

interface FormalReportDocumentProps {
  data: ProjectReportSnapshot
  preparedBy: string
  familyFilter?: FamilyFilter
}

const STATE_LABELS: Record<string, string> = {
  completed: 'Completada', failed: 'Fallida', cancelled: 'Cancelada',
  interrupted: 'Interrumpida', created: 'Creada', preparing: 'Preparando', running: 'En ejecución',
}

/** Formatea fechas persistidas sin introducir una zona horaria artificial. */
function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : date.toLocaleString('es-PE')
}

/** Evita imprimir NaN/Infinity y evita confundir métricas ausentes con un cero. */
function formatMetric(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(4) : '—'
}

function testMetrics(metrics: Record<string, unknown> | undefined, problemType: string): string {
  if (!metrics) return 'Sin evaluación'
  if (problemType === 'multiclass') return `Accuracy ${formatMetric(metrics.accuracy)} · F1 macro ${formatMetric(metrics.macroF1)}`
  if (problemType === 'binary') {
    return `Exactitud ${formatMetric(metrics.accuracy)} · F1 ${formatMetric(metrics.f1)}`
  }
  return `RMSE ${formatMetric(metrics.rmse)} · MAE ${formatMetric(metrics.mae)} · R² ${formatMetric(metrics.r2)}`
}

/**
 * Documento independiente de la pantalla interactiva.
 * Solo consume datos ya autorizados por RLS; nunca carga CSV originales ni artefactos.
 * El documento es invisible en pantalla y aparece exclusivamente al imprimir/exportar PDF.
 */
export function FormalReportDocument({ data, preparedBy, familyFilter = 'all' }: FormalReportDocumentProps) {
  const detailRuns = reportRunsByFamily(data.runs, familyFilter)
  const architectureNames = new Map<string, string>(data.architectures.map((item): [string, string] => [item.id, item.name]))
  const datasetNames = new Map<string, string>(data.datasets.map((item): [string, string] => [item.id, item.name]))
  const metricsByRun = new Map<string, Record<string, unknown>>(data.evaluations.map((item): [string, Record<string, unknown>] => [item.run_id, item.metrics_json]))
  const completed = detailRuns.filter((run) => run.status === 'completed').length
  const dateIssued = formatDate(new Date().toISOString())

  return (
    <article className="nl-report-paper hidden" aria-label="Informe técnico formal del proyecto">
      <header className="nl-paper-header">
        <div className="nl-paper-brand">NEUROLAB <span>ENTERPRISE</span></div>
        <p className="nl-paper-eyebrow">Informe técnico de proyecto · M09</p>
        <h1>Reporte de actividad y resultados</h1>
        <p className="nl-paper-subtitle">{data.project.name}</p>
      </header>

      <dl className="nl-paper-metadata">
        <div><dt>Proyecto</dt><dd>{data.project.name}</dd></div>
        <div><dt>Identificador</dt><dd className="nl-paper-break">{data.project.id}</dd></div>
        <div><dt>Estado</dt><dd>{data.project.status === 'active' ? 'Activo' : 'Archivado'}</dd></div>
        <div><dt>Fecha de creación</dt><dd>{formatDate(data.project.created_at)}</dd></div>
        <div><dt>Fecha de emisión</dt><dd>{dateIssued}</dd></div>
        <div><dt>Generado por</dt><dd>{preparedBy || 'Usuario autorizado'}</dd></div>
      </dl>

      <section className="nl-paper-section">
        <h2>1. Descripción del proyecto</h2>
        <p className="nl-paper-prose">{data.project.description || 'No se ha registrado una descripción.'}</p>
      </section>

      <section className="nl-paper-section">
        <h2>2. Resumen general</h2>
        <table className="nl-paper-table nl-paper-summary"><thead><tr><th>Indicador</th><th className="nl-paper-num">Total del proyecto</th></tr></thead>
          <tbody>
            <tr><td>Arquitecturas registradas</td><td className="nl-paper-num">{data.totals.architectures}</td></tr>
            <tr><td>Datasets registrados</td><td className="nl-paper-num">{data.totals.datasets}</td></tr>
            <tr><td>Entrenamientos registrados</td><td className="nl-paper-num">{data.totals.runs}</td></tr>
            <tr><td>Versiones de modelos</td><td className="nl-paper-num">{data.totals.versions}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="nl-paper-section">
        <h2>3. Arquitecturas registradas</h2>
        {data.architectures.length === 0 ? <p>No se registran arquitecturas.</p> : (
          <table className="nl-paper-table"><thead><tr><th>Nombre</th><th>Versión</th><th>Fecha de registro</th></tr></thead>
            <tbody>{data.architectures.map((item) => <tr key={item.id}>
              <td>{item.name}</td><td>v{item.version}</td><td>{formatDate(item.created_at)}</td>
            </tr>)}</tbody>
          </table>
        )}
        <p className="nl-paper-note">El detalle de configuración de cada arquitectura se consulta en NeuroLab; este informe presenta su identificación y versionado.</p>
      </section>

      <section className="nl-paper-section">
        <h2>4. Datasets registrados</h2>
        {data.datasets.length === 0 ? <p>No se registran datasets.</p> : (
          <table className="nl-paper-table"><thead><tr><th>Nombre</th><th>Objetivo</th><th>Tipo</th><th className="nl-paper-num">Filas</th></tr></thead>
            <tbody>{data.datasets.map((item) => <tr key={item.id}>
              <td>{item.name} · v{item.version}</td><td>{item.target_column}</td>
              <td>{item.problem_type === 'multiclass' ? 'Multiclase' : item.problem_type === 'binary' ? 'Clasificación' : 'Regresión'}</td>
              <td className="nl-paper-num">{item.row_count}</td>
            </tr>)}</tbody>
          </table>
        )}
        <p className="nl-paper-note">Solo se muestran metadatos. No se adjuntan los archivos CSV originales.</p>
      </section>

      <section className="nl-paper-section">
        <h2>5. Entrenamientos y resultados de prueba</h2>
        <p className="nl-paper-prose">De las {detailRuns.length} ejecuciones de la familia {familyFilter === 'all' ? 'todas' : familyFilter} consultadas, {completed} finalizaron correctamente. Se muestran las métricas disponibles para cada ejecución.</p>
        {detailRuns.length === 0 ? <p>No se registran entrenamientos.</p> : (
          <table className="nl-paper-table nl-paper-runs"><thead><tr>
            <th>Fecha</th><th>Familia</th><th>Arquitectura / dataset</th><th>Estado</th><th>Épocas</th><th>Métricas test</th>
          </tr></thead><tbody>{detailRuns.map((run) => <tr key={run.id}>
            <td>{formatDate(run.created_at)}</td>
            <td>{familyForReportProblem(run.problem_type) ? familyLabel(familyForReportProblem(run.problem_type)!) : 'Otra'}</td>
            <td>{architectureNames.get(run.architecture_id) ?? 'Arquitectura no disponible'}<span className="nl-paper-secondary">{datasetNames.get(run.dataset_id) ?? 'Dataset no disponible'}</span></td>
            <td>{STATE_LABELS[run.status] ?? run.status}</td>
            <td>{run.completed_epochs}/{run.epochs_planned}</td>
            <td>{testMetrics(metricsByRun.get(run.id), run.problem_type)}</td>
          </tr>)}</tbody></table>
        )}
      </section>

      <section className="nl-paper-section nl-paper-methodology">
        <h2>6. Alcance y limitaciones</h2>
        <p>Los totales provienen de la base de datos y NO se filtran por familia. Las tablas detalladas presentan como máximo los 200 registros más recientes de cada conjunto consultado; por tanto, este documento puede no representar el historial completo.</p>
        <p>Las métricas de evaluación fueron calculadas en el navegador y almacenadas por NeuroLab; no constituyen certificación independiente. No se incorporan filas del CSV original, credenciales ni archivos de pesos del modelo.</p>
      </section>
      <footer className="nl-paper-footer">NeuroLab Enterprise · Documento generado a partir de datos autorizados del proyecto · {dateIssued}</footer>
    </article>
  )
}

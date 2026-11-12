import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (file) => readFileSync(new URL(file,import.meta.url),'utf8')
test('el historial permite multiclass y filtra en DB antes de paginar',()=>{
  const service=read('../src/services/evaluationPersistence.ts')
  assert.match(service,/query\.eq\('architectures\.family', family\)/)
  assert.match(service,/\.range\(start, start \+ HISTORY_PAGE_SIZE - 1\)/)
  assert.match(service,/parseCnnStoredEvaluation/)
  assert.doesNotMatch(service,/\.in\('problem_type', \['binary', 'regression'\]\)\s*\.order/)
})
test('historial muestra familia, curvas, evaluación agregada y bloqueo de comparación incompatible',()=>{
  const page=read('../src/features/evaluation/TrainingHistoryPage.tsx')
  assert.match(page,/familyLabel\(run\.family\)/)
  assert.match(page,/CnnStoredEvaluationCard/)
  assert.match(page,/compatibleHistoryRuns/)
  assert.match(page,/SelectField/)
  assert.match(read('../src/features/training/TrainingMetricsChart.tsx'),/problemType === 'regression'/)
})
test('filtros de modelos y reportes sin RLS nuevo y sin guardar muestras',()=>{
  const models=read('../src/features/models/ModelRegistryPage.tsx')
  assert.match(models,/filteredVersions/)
  assert.match(models,/isCnnManifest/)
  const report=read('../src/features/reports/ProjectReportPage.tsx')
  assert.match(report,/reportRunsByFamily/)
  assert.match(report,/macroF1/)
  assert.match(report,/familyFilter=\{family\}/)
  assert.doesNotMatch(report,/storage\.from/)
})

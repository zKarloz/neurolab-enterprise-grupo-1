import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDashboardAlerts, countProjectStatuses, dashboardFamilyLabel,
  filterVisibleRuns, trainingStatusLabels,
} from '../src/features/home/dashboardLogic.ts'

const baseCounts = {
  activeRuns: 0, queuedRuns: 0, completedLast30Days: 0, runsLast30Days: 0,
  failedOrInterruptedLast7Days: 0, possiblyStaleRuns: 0,
}

test('M01: proyectos activos y archivados se contabilizan separadamente', () => {
  assert.deepEqual(countProjectStatuses([
    { status: 'active' }, { status: 'archived' }, { status: 'active' },
  ]), { active: 2, archived: 1 })
})

test('M01: no genera alertas falsas al no haber incidencias', () => {
  assert.deepEqual(buildDashboardAlerts(baseCounts, 0), [])
})

test('M01: avisos por incidencias y operaciones sin actualización muestran sus límites', () => {
  const alerts = buildDashboardAlerts({
    ...baseCounts, failedOrInterruptedLast7Days: 2, possiblyStaleRuns: 1,
  }, 0)
  assert.deepEqual(alerts.map((item) => item.id), ['failed', 'stale'])
  assert.match(alerts[1].detail, /no confirma/i)
})

test('M01: distingue estado registrado sin iniciar y proyectos archivados', () => {
  const alerts = buildDashboardAlerts({ ...baseCounts, queuedRuns: 1 }, 2)
  assert.deepEqual(alerts.map((item) => item.id), ['queued', 'archived'])
})

test('M01: identifica las cuatro familias por arquitectura, nunca por problema', () => {
  assert.equal(dashboardFamilyLabel('feedforward'), 'Feedforward')
  assert.equal(dashboardFamilyLabel('cnn'), 'CNN')
  assert.equal(dashboardFamilyLabel('rnn'), 'RNN')
  assert.equal(dashboardFamilyLabel('gan'), 'GAN')
  assert.equal(dashboardFamilyLabel(undefined), 'No disponible')
})

test('M01: estados de entrenamiento remotos tienen etiquetas específicas', () => {
  for (const status of ['created','preparing','running','completed','failed','cancelled','interrupted']) {
    assert.ok(trainingStatusLabels[status])
  }
  assert.notEqual(trainingStatusLabels.running, trainingStatusLabels.created)
})

test('M01: nunca muestra trabajos de un proyecto fuera del conjunto visible', () => {
  const runs = [
    { id: 'a', project_id: 'proyecto-visible' },
    { id: 'b', project_id: 'proyecto-oculto' },
  ]
  assert.deepEqual(filterVisibleRuns(runs, ['proyecto-visible']), [runs[0]])
  assert.deepEqual(filterVisibleRuns(runs, []), [])
})

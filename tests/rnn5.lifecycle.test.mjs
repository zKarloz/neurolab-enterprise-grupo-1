/** RNN-5: contratos ejecutables de persistencia y finalización, sin red. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRnnPersistenceQueue } from '../src/ml/rnn/persistenceQueue.ts'
import { readRnnEpochMetrics, validateRnnTrainOptions } from '../src/ml/rnn/trainingTypes.ts'

const epoch = (n) => ({ epoch: n, loss: 1 / n, metric: 0.7 / n,
  validationLoss: 1.4 / n, validationMetric: 0.8 / n })
const report = { kind: 'regression', count: 18, mse: 2, rmse: Math.SQRT2, mae: 1.2,
  r2: null, examples: [{ seriesId: 'privado', targetTime: 1, actual: 2, predicted: 3 }] }
function createHarness(override = {}) {
  const actions = [], confirmations = [], alerts = []
  const adapter = {
    runtime: async (_id, backend) => { actions.push(`runtime:${backend}`) },
    epoch: async (_id, m) => { actions.push(`epoch:${m.epoch}`) },
    evaluation: async (_id, type, item) => { actions.push(`test:${type}:${item.count}`) },
    finish: async (_id, status) => { actions.push(`finish:${status}`) },
    ...override,
  }
  const queue = createRnnPersistenceQueue('local', adapter, {
    epochConfirmed: (n) => confirmations.push(`epoch:${n}`),
    evaluationConfirmed: () => confirmations.push('test'),
    finishedConfirmed: (status) => confirmations.push(`finish:${status}`),
    failed: (text) => alerts.push(text),
  })
  return { queue, actions, confirmations, alerts }
}

test('RNN-5: confirma runtime → dos épocas → test → completed sin operaciones duplicadas', async () => {
  const { queue, actions, confirmations, alerts } = createHarness()
  queue.runtime('cpu', 'worker', '4.22.0'); queue.runtime('webgl', 'main', '4.22.0')
  queue.epoch(epoch(1)); queue.epoch(epoch(2))
  queue.evaluation('regression', report); queue.evaluation('regression', report)
  queue.finish('completed'); queue.finish('failed'); queue.epoch(epoch(3))
  await queue.idle()
  assert.deepEqual(actions, ['runtime:cpu', 'epoch:1', 'epoch:2', 'test:regression:18', 'finish:completed'])
  assert.deepEqual(confirmations, ['epoch:1', 'epoch:2', 'test', 'finish:completed'])
  assert.deepEqual(alerts, [])
})

test('RNN-5: pérdida de conexión no confirma completed', async () => {
  const { queue, actions, confirmations, alerts } = createHarness({
    epoch: async () => { throw new Error('RPC desconectada') },
  })
  queue.runtime('cpu', 'worker', '4.22.0'); queue.epoch(epoch(1))
  queue.evaluation('regression', report); queue.finish('completed')
  await queue.idle()
  assert.deepEqual(actions, ['runtime:cpu', 'finish:failed'])
  assert.deepEqual(confirmations, [])
  assert.match(alerts[0], /RPC desconectada/)
})

test('RNN-5: cancelación conserva estado y bloquea evaluación tardía', async () => {
  const { queue, actions, confirmations } = createHarness()
  queue.runtime('cpu', 'main', '4.22.0'); queue.finish('cancelled')
  queue.epoch(epoch(1)); queue.evaluation('regression', report); queue.finish('completed')
  await queue.idle()
  assert.deepEqual(actions, ['runtime:cpu', 'finish:cancelled'])
  assert.deepEqual(confirmations, ['finish:cancelled'])
})

test('RNN-5: época fuera de secuencia rechazada y run marcada como failed', async () => {
  const { queue, actions, confirmations, alerts } = createHarness()
  queue.runtime('cpu', 'worker', '4.22.0'); queue.epoch(epoch(2)); queue.finish('completed')
  await queue.idle()
  assert.deepEqual(actions, ['runtime:cpu', 'finish:failed'])
  assert.deepEqual(confirmations, [])
  assert.match(alerts[0], /fuera de orden/i)
})

test('RNN-5: error al cerrar run exige advertencia, no éxito ficticio', async () => {
  const { queue, confirmations, alerts } = createHarness({
    epoch: async () => { throw new Error('RPC falló') },
    finish: async () => { throw new Error('Sin confirmación') },
  })
  queue.epoch(epoch(1)); queue.finish('completed'); await queue.idle()
  assert.deepEqual(confirmations, [])
  assert.match(alerts[0], /No se confirmó el cierre remoto/)
})

test('RNN-5: opciones reales y métricas de clasificación/regresión sin NaN ni datos incompletos', () => {
  validateRnnTrainOptions({ epochs: 2, batchSize: 8, learningRate: 0.001 })
  for (const invalid of [
    { epochs: 3, batchSize: 8, learningRate: 0.001 },
    { epochs: 2, batchSize: 3, learningRate: 0.001 },
    { epochs: 2, batchSize: 8, learningRate: 0 },
  ]) assert.throws(() => validateRnnTrainOptions(invalid))
  assert.equal(readRnnEpochMetrics(1, { loss: 1, mae: 0.6, val_loss: 2, val_mae: 1 }, true).validationMetric, 1)
  assert.equal(readRnnEpochMetrics(1, { loss: 1, acc: 0.5, val_loss: 2, val_acc: 0.4 }, false).metric, 0.5)
  assert.throws(() => readRnnEpochMetrics(1, { loss: 1, mae: NaN, val_loss: 2, val_mae: 1 }, true))
  assert.throws(() => readRnnEpochMetrics(1, { loss: 1, val_loss: 2, val_acc: 0.4 }, false))
})

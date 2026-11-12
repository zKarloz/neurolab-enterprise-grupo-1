/** Cola RNN-4B: pruebas sin credenciales ni dependencias npm. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRnnPersistenceQueue } from '../src/ml/rnn/persistenceQueue.ts'

const metric = (epoch) => ({ epoch, loss: 1 / epoch, validationLoss: 1.5 / epoch,
  metric: 0.5 / epoch, validationMetric: 0.7 / epoch })
const report = { kind: 'regression', count: 18, mse: 2, rmse: Math.SQRT2, mae: 1.2, r2: null,
  examples: [{ seriesId: 'sensor_PRIVADO', targetTime: 55, actual: 9, predicted: 10 }] }

function setup(override = {}) {
  const calls = []; const confirmed = []; const warnings = []
  const adapter = {
    runtime: async (_id, b, c, v) => { calls.push(['runtime', b, c, v]) },
    epoch: async (_id, m) => { calls.push(['epoch', m.epoch]) },
    evaluation: async (_id, type, result) => { calls.push(['evaluation', type, result.count]) },
    finish: async (_id, state) => { calls.push(['finish', state]) },
    ...override,
  }
  const queue = createRnnPersistenceQueue('id-rnn', adapter, {
    epochConfirmed: (n) => confirmed.push(`epoch-${n}`),
    evaluationConfirmed: () => confirmed.push('evaluation'),
    finishedConfirmed: (s) => confirmed.push(s),
    failed: (message) => warnings.push(message),
  })
  return { calls, confirmed, warnings, queue }
}

test('RNN-4B: orden exacto runtime, época 1/2, evaluación, finalización; confirmación real', async () => {
  const { calls, confirmed, warnings, queue } = setup()
  queue.runtime('cpu', 'worker', '4.22.0')
  queue.epoch(metric(1)); queue.epoch(metric(2))
  queue.evaluation('regression', report)
  queue.finish('completed', 123)
  await queue.idle()
  assert.deepEqual(calls.map((a) => a[0]), ['runtime', 'epoch', 'epoch', 'evaluation', 'finish'])
  assert.deepEqual(calls.at(-1), ['finish', 'completed'])
  assert.deepEqual(confirmed, ['epoch-1', 'epoch-2', 'evaluation', 'completed'])
  assert.deepEqual(warnings, [])
  assert.equal(queue.terminalQueued, true)
})

test('RNN-4B: cancelación cierra ejecución sin evaluación ni épocas', async () => {
  const { queue, calls, confirmed } = setup()
  queue.finish('cancelled')
  queue.runtime('cpu', 'main', '4.22.0')
  queue.epoch(metric(1))
  queue.finish('completed')
  await queue.idle()
  assert.deepEqual(calls, [['finish', 'cancelled']])
  assert.deepEqual(confirmed, ['cancelled'])
})

test('RNN-4B: métricas fuera de orden cierran fallida, no registran época inventada', async () => {
  const { queue, calls, confirmed, warnings } = setup()
  queue.runtime('cpu', 'worker', '4.22.0')
  queue.epoch(metric(2))
  queue.evaluation('regression', report)
  queue.finish('completed')
  await queue.idle()
  assert.deepEqual(calls.map((item) => item[0]), ['runtime', 'finish'])
  assert.deepEqual(calls.at(-1), ['finish', 'failed'])
  assert.deepEqual(confirmed, [])
  assert.equal(warnings.length, 1)
  assert.equal(queue.hasFailed, true)
})

test('RNN-4B: fallo de RPC no confirma éxito, intenta cerrar run como fallido', async () => {
  const { queue, calls, confirmed, warnings } = setup({
    epoch: async () => { throw new Error('Permiso RLS denegado') },
  })
  queue.runtime('cpu', 'worker', '4.22.0')
  queue.epoch(metric(1)); queue.epoch(metric(2))
  queue.evaluation('regression', report); queue.finish('completed')
  await queue.idle()
  assert.deepEqual(calls.map((item) => item[0]), ['runtime', 'finish'])
  assert.deepEqual(calls.at(-1), ['finish', 'failed'])
  assert.deepEqual(confirmed, [])
  assert.match(warnings[0], /Permiso RLS/)
})

test('RNN-4B: si tampoco puede cerrar, advierte que el estado remoto no está confirmado', async () => {
  const { queue, warnings } = setup({
    runtime: async () => { throw new Error('Sin conexión') },
    finish: async () => { throw new Error('Supabase fuera de servicio') },
  })
  queue.runtime('cpu', 'worker', '4.22.0')
  queue.finish('completed')
  await queue.idle()
  assert.match(warnings[0], /No se confirmó el cierre remoto/)
  assert.equal(queue.hasFailed, true)
})

test('RNN-4B: protección contra doble runtime, doble test y doble cierre', async () => {
  const { queue, calls } = setup()
  queue.runtime('cpu', 'worker', '4.22.0')
  queue.runtime('cpu', 'worker', '4.22.0')
  queue.evaluation('regression', report)
  queue.evaluation('regression', report)
  queue.finish('cancelled')
  queue.finish('completed')
  await queue.idle()
  assert.deepEqual(calls.map((item) => item[0]), ['runtime', 'evaluation', 'finish'])
})

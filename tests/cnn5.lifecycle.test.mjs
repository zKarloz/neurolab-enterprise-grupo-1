/** CNN-5: pruebas reproducibles de la cola y la protección ante fallos de persistencia. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createCnnPersistenceQueue } from '../src/ml/cnn/persistenceQueue.ts'
import { readCnnEpochMetrics, validateCnnTrainOptions } from '../src/ml/cnn/trainingTypes.ts'

const epoch = (index) => ({
  epoch: index, loss: 2 / index, validationLoss: 2.1 / index,
  accuracy: index / 10, validationAccuracy: index / 11,
})

function buildQueue(adapterOverrides = {}) {
  const actions = [], confirmations = [], errors = []
  const adapter = {
    runtime: async (_run, backend) => { actions.push(`runtime:${backend}`) },
    epoch: async (_run, metrics) => { actions.push(`epoch:${metrics.epoch}`) },
    evaluation: async () => { actions.push('evaluation') },
    finish: async (_run, status) => { actions.push(`finish:${status}`) },
    ...adapterOverrides,
  }
  const queue = createCnnPersistenceQueue('run-id-local', adapter, {
    epochConfirmed: (number) => confirmations.push(`epoch:${number}`),
    evaluationConfirmed: () => confirmations.push('evaluation'),
    finishedConfirmed: (status) => confirmations.push(`finish:${status}`),
    failed: (message) => errors.push(message),
  })
  return { queue, actions, confirmations, errors }
}

test('CNN guarda eventos en orden, sin duplicar runtime/evaluación/estado terminal', async () => {
  const { queue, actions, confirmations, errors } = buildQueue()
  queue.runtime('cpu', 'worker', '4.22.0')
  queue.runtime('webgl', 'main', '4.22.0') // No debe reemplazar el backend inicial.
  queue.epoch(epoch(1))
  queue.epoch(epoch(2))
  queue.evaluation({})
  queue.evaluation({})
  queue.finish('completed', 1000)
  queue.finish('failed')
  queue.epoch(epoch(3)) // Nunca escribe tras un estado terminal.
  await queue.idle()
  assert.deepEqual(actions, ['runtime:cpu', 'epoch:1', 'epoch:2', 'evaluation', 'finish:completed'])
  assert.deepEqual(confirmations, ['epoch:1', 'epoch:2', 'evaluation', 'finish:completed'])
  assert.deepEqual(errors, [])
  assert.equal(queue.terminalQueued, true)
})

test('CNN no confirma éxito ni envía evaluación/fin tras fallar una época', async () => {
  const { queue, actions, confirmations, errors } = buildQueue({
    epoch: async () => { throw new Error('Error de conexión a Supabase') },
  })
  queue.runtime('cpu', 'worker', '4.22.0')
  queue.epoch(epoch(1))
  queue.evaluation({})
  queue.finish('completed')
  await queue.idle()
  assert.deepEqual(actions, ['runtime:cpu'])
  assert.deepEqual(confirmations, [])
  assert.deepEqual(errors, ['Error de conexión a Supabase'])
  assert.equal(queue.hasFailed, true)
})

test('Cancelación confirmada no se transforma en completada por evento tardío', async () => {
  const { queue, actions, confirmations } = buildQueue()
  queue.runtime('cpu', 'main', '4.22.0')
  queue.finish('cancelled')
  queue.evaluation({})
  queue.finish('completed')
  await queue.idle()
  assert.deepEqual(actions, ['runtime:cpu', 'finish:cancelled'])
  assert.deepEqual(confirmations, ['finish:cancelled'])
})

test('Rechaza configuración y métricas incompletas sin inventar ceros', () => {
  validateCnnTrainOptions({ samples: 500, epochs: 2, batchSize: 32, learningRate: 0.001 })
  for (const bad of [
    { samples: 99, epochs: 2, batchSize: 32, learningRate: 0.001 },
    { samples: 500, epochs: 99, batchSize: 32, learningRate: 0.001 },
    { samples: 500, epochs: 2, batchSize: 3, learningRate: 0.001 },
    { samples: 500, epochs: 2, batchSize: 32, learningRate: -1 },
  ]) assert.throws(() => validateCnnTrainOptions(bad))
  const correct = readCnnEpochMetrics(1, { loss: 2.3, val_loss: 2.4, acc: 0.15, val_acc: 0.14 })
  assert.equal(correct.validationAccuracy, 0.14)
  assert.throws(() => readCnnEpochMetrics(1, { loss: 2.3, acc: 0.15 }), /métricas/)
  assert.throws(() => readCnnEpochMetrics(1, { loss: NaN, val_loss: 2.4, acc: .15, val_acc: .14 }), /métricas/)
})

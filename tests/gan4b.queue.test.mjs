/** Contratos funcionales de la cola: errores reales no se convierten en éxitos. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createGanPersistenceQueue } from '../src/ml/gan/persistenceQueue.ts'

const metric = (epoch) => ({ epoch, generatorLoss: 0.7, discriminatorLoss: 1.3, realScore: 0.55, fakeScore: 0.44 })
const sample = { dimension: 8, count: 4, pixels: new Uint8Array(4 * 64) }
function fake(planned = 2, failAt = '') {
  const calls = []
  const notifications = []
  const operation = (name, extra) => async () => {
    calls.push(extra === undefined ? name : `${name}:${extra}`)
    if (name === failAt) throw Error(`fallo de ${name}`)
  }
  const adapter = {
    runtime: async (...a) => operation('runtime', a[1])(),
    epoch: async (_id, m) => operation('epoch', m.epoch)(),
    finish: async (_id, s) => operation('finish', s)(),
    summary: async () => operation('summary')(),
  }
  const queue = createGanPersistenceQueue('test-run', planned, adapter, {
    epochConfirmed: (ep) => notifications.push(`epoch:${ep}`),
    finishedConfirmed: (s) => notifications.push(`finish:${s}`),
    failed: (m) => notifications.push(`error:${m}`),
  })
  return { calls, notifications, queue }
}

test('GAN-4B: runtime, dos épocas y completed mantienen el orden de RPC', async () => {
  const { calls, notifications, queue } = fake()
  queue.runtime('cpu', 'worker', '4.0')
  queue.epoch(metric(1)); queue.epoch(metric(2)); queue.finish('completed', 100)
  await queue.idle()
  assert.deepEqual(calls, ['runtime:cpu', 'epoch:1', 'epoch:2', 'finish:completed'])
  assert.deepEqual(notifications, ['epoch:1', 'epoch:2', 'finish:completed'])
  assert.equal(queue.isCompletedConfirmed, true)
  assert.equal(await queue.summary(sample), true)
  assert.equal(await queue.summary(sample), false)
  assert.deepEqual(calls.at(-1), 'summary')
})

test('GAN-4B: no permite registrar resumen antes de completed remoto', async () => {
  const { queue, calls } = fake()
  assert.equal(await queue.summary(sample), false)
  queue.runtime('cpu', 'worker', '4.0'); queue.epoch(metric(1)); queue.epoch(metric(2))
  assert.equal(await queue.summary(sample), false)
  assert.equal(calls.includes('summary'), false)
})

test('GAN-4B: no indica completed cuando falta una época', async () => {
  const { calls, notifications, queue } = fake()
  queue.runtime('cpu', 'worker', '4.0'); queue.epoch(metric(1)); queue.finish('completed')
  await queue.idle()
  assert.equal(queue.isCompletedConfirmed, false)
  assert.ok(calls.includes('finish:failed'))
  assert.ok(!calls.includes('finish:completed'))
  assert.match(notifications.join(' '), /épocas faltantes/i)
})

test('GAN-4B: un rechazo de la RPC de época marca failed sin éxito falso', async () => {
  const { calls, notifications, queue } = fake(2, 'epoch')
  queue.runtime('cpu', 'worker', '4.0'); queue.epoch(metric(1)); queue.epoch(metric(2)); queue.finish('completed')
  await queue.idle()
  assert.deepEqual(calls, ['runtime:cpu', 'epoch:1', 'finish:failed'])
  assert.equal(queue.isCompletedConfirmed, false)
  assert.ok(!notifications.includes('finish:completed'))
  assert.match(notifications.join(' '), /fallo de epoch/)
})

test('GAN-4B: época duplicada o fuera de orden queda rechazada', async () => {
  for (const bad of [0, 2, 3]) {
    const { calls, queue } = fake()
    queue.runtime('cpu', 'worker', '4.0'); queue.epoch(metric(bad))
    await queue.idle()
    assert.equal(queue.hasFailed, true)
    assert.deepEqual(calls, ['runtime:cpu', 'finish:failed'])
  }
})

test('GAN-4B: NaN y probabilidades inválidas no llegan a Supabase', async () => {
  for (const patch of [{ generatorLoss: NaN }, { realScore: 1.8 }]) {
    const { queue, calls } = fake()
    queue.runtime('cpu', 'worker', '4.0'); queue.epoch({ ...metric(1), ...patch }); await queue.idle()
    assert.equal(queue.hasFailed, true)
    assert.equal(calls.some((x) => x.startsWith('epoch:')), false)
  }
})

test('GAN-4B: fallo del resumen no cambia completed remoto ni repite RPC', async () => {
  const { calls, queue } = fake(2, 'summary')
  queue.runtime('cpu', 'worker', '4.0'); queue.epoch(metric(1)); queue.epoch(metric(2)); queue.finish('completed')
  await queue.idle()
  await assert.rejects(queue.summary(sample), /fallo de summary/)
  assert.equal(await queue.summary(sample), false)
  assert.equal(queue.isCompletedConfirmed, true)
  assert.equal(calls.filter(x => x === 'summary').length, 1)
})

test('GAN-4B: cancelación crea estado terminal sin guardar resumen', async () => {
  const { calls, queue } = fake()
  queue.finish('cancelled'); await queue.idle()
  assert.deepEqual(calls, ['finish:cancelled'])
  assert.equal(await queue.summary(sample), false)
})

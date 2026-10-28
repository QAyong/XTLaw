import { describe, expect, it } from 'vitest'
import { BoundedSemaphore, QueueFullError } from '../BoundedSemaphore'

const signal = () => new AbortController().signal

describe('bounded semaphore', () => {
  it('preserves FIFO capacity and removes cancelled waiters', async () => {
    const pool = new BoundedSemaphore(1, 2)
    const release = await pool.acquire(signal())
    const cancelled = new AbortController()
    const second = pool.acquire(cancelled.signal).catch(error => error)
    const third = pool.acquire(signal())
    await expect(pool.acquire(signal())).rejects.toBeInstanceOf(QueueFullError)
    cancelled.abort(new Error('cancelled'))
    expect(await second).toMatchObject({ message: 'cancelled' })
    expect(pool.snapshot).toEqual({ active: 1, queued: 1 })
    release()
    release()
    const finish = await third
    expect(pool.snapshot).toEqual({ active: 1, queued: 0 })
    finish()
    expect(pool.snapshot).toEqual({ active: 0, queued: 0 })
  })

  it('handles cancellation immediately after grant without losing capacity', async () => {
    const pool = new BoundedSemaphore(1, 1)
    const release = await pool.acquire(signal())
    const controller = new AbortController()
    const next = pool.acquire(controller.signal)
    release()
    controller.abort()
    const finish = await next
    finish()
    expect(pool.snapshot).toEqual({ active: 0, queued: 0 })
    await expect(pool.acquire(controller.signal)).rejects.toBe(controller.signal.reason)
  })

  it('runs a burst in admission order without exceeding the limit', async () => {
    const pool = new BoundedSemaphore(3, 30)
    let peak = 0
    const order: number[] = []
    await Promise.all(Array.from({ length: 30 }, async (_, index) => {
      const release = await pool.acquire(signal())
      order.push(index)
      peak = Math.max(peak, pool.snapshot.active)
      await Promise.resolve()
      release()
    }))
    expect(order).toEqual(Array.from({ length: 30 }, (_, index) => index))
    expect(peak).toBe(3)
    expect(pool.snapshot).toEqual({ active: 0, queued: 0 })
  })
})

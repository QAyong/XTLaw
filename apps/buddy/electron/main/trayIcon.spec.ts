import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createEmpty, createFromPath, addRepresentation, readFileSync } = vi.hoisted(() => {
  const addRepresentation = vi.fn()
  const image = { addRepresentation }
  return {
    addRepresentation,
    createEmpty: vi.fn(() => image),
    createFromPath: vi.fn((path: string) => ({ path })),
    readFileSync: vi.fn((path: string) => Buffer.from(String(path))),
  }
})

vi.mock('electron', () => ({
  nativeImage: { createEmpty, createFromPath },
}))
vi.mock('node:fs', () => ({ readFileSync }))

import { createDesktopTrayImage } from './trayIcon'

describe('createDesktopTrayImage', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ['stable', /tray-icon\.png$/, /tray-icon@2x\.png$/],
    ['development', /tray-icon-dev\.png$/, /tray-icon-dev@2x\.png$/],
    ['test', /tray-icon-test\.png$/, /tray-icon-test@2x\.png$/],
  ] as const)('uses the %s profile 1x and 2x assets on macOS', (profile, oneX, twoX) => {
    const image = createDesktopTrayImage('/passed/icon.png', profile, 'darwin')

    expect(image).toBeDefined()
    expect(createEmpty).toHaveBeenCalledOnce()
    expect(createFromPath).not.toHaveBeenCalled()
    expect(readFileSync).toHaveBeenCalledTimes(2)
    expect(readFileSync.mock.calls[0]?.[0]).toMatch(oneX)
    expect(readFileSync.mock.calls[1]?.[0]).toMatch(twoX)
    expect(addRepresentation.mock.calls.map(([representation]) => representation.scaleFactor)).toEqual([1, 2])
  })

  it('uses the caller-provided icon path away from macOS', () => {
    const image = createDesktopTrayImage('/passed/icon.png', 'development', 'linux')

    expect(image).toEqual({ path: '/passed/icon.png' })
    expect(createFromPath).toHaveBeenCalledWith('/passed/icon.png')
    expect(createEmpty).not.toHaveBeenCalled()
    expect(readFileSync).not.toHaveBeenCalled()
  })
})

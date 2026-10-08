import { describe, expect, it } from 'vitest'
import { BROWSER_VIEWPORT_DEVICES, browserPreviewScale, browserViewportDeviceForSize, clampViewportSize, viewportDimensionValid } from '../browserViewport'

const size = { width: 393, height: 852 }
describe('responsive browser preview', () => {
  it('fits inside the padded canvas without changing the logical viewport', () => {
    expect(browserPreviewScale(size, { width: 800, height: 458 }, 'fit')).toBe(0.5)
    expect(size).toEqual({ width: 393, height: 852 })
    expect(browserPreviewScale(size, { width: 4000, height: 4000 }, 'fit')).toBe(1)
  })
  it('handles hidden or tiny canvases without zero or invalid scale', () => {
    expect(browserPreviewScale(size, { width: 0, height: 0 }, 'fit')).toBe(1)
    expect(browserPreviewScale(size, { width: 33, height: 33 }, 'fit')).toBe(0.1)
  })
  it.each([['25', 0.25], ['50', 0.5], ['100', 1], ['200', 2]] as const)('keeps fixed %s%% independent of panel size', (zoom, scale) => {
    expect(browserPreviewScale(size, { width: 100, height: 100 }, zoom)).toBe(scale)
  })
  it('rejects invalid dimensions instead of silently applying a clamped draft', () => {
    expect(viewportDimensionValid('width', 239)).toBe(false)
    expect(viewportDimensionValid('width', 3841)).toBe(false)
    expect(viewportDimensionValid('height', 2161)).toBe(false)
    expect(viewportDimensionValid('width', 393.5)).toBe(false)
    expect(viewportDimensionValid('height', Number.NaN)).toBe(false)
    expect(viewportDimensionValid('width', 3840)).toBe(true)
    expect(viewportDimensionValid('height', 2160)).toBe(true)
  })
  it('matches named device sizes and keeps arbitrary dimensions custom', () => {
    for (const device of BROWSER_VIEWPORT_DEVICES) {
      expect(viewportDimensionValid('width', device.width)).toBe(true)
      expect(viewportDimensionValid('height', device.height)).toBe(true)
      expect(browserViewportDeviceForSize(device)).toBe(device.id)
    }
    expect(browserViewportDeviceForSize({ width: 431, height: 701 })).toBe('custom')
  })

  it('bounds drag dimensions and rounds only the committed logical size', () => {
    expect(clampViewportSize({ width: 50, height: 5000 })).toEqual({ width: 240, height: 2160 })
    expect(clampViewportSize({ width: 393.7, height: 851.2 })).toEqual({ width: 394, height: 851 })
  })
})

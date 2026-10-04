import type { DesktopBrowserViewport } from '@buddy-shared/browser/browserDesktopApi'

export const DEFAULT_RESPONSIVE_VIEWPORT = { width: 393, height: 852, scale: 1 } as const
export const BROWSER_PREVIEW_ZOOMS = ['fit', '25', '50', '75', '100', '125', '150', '200'] as const
export type BrowserPreviewZoom = typeof BROWSER_PREVIEW_ZOOMS[number]
export type BrowserViewportSize = Pick<DesktopBrowserViewport, 'width' | 'height'>

// CSS viewport sizes, not UA, touch, DPR or operating-system emulation.
export const BROWSER_VIEWPORT_DEVICES = [
  { id: 'iphone-se', name: 'iPhone SE', width: 375, height: 667 },
  { id: 'iphone-13', name: 'iPhone 12 / 13 / 14', width: 390, height: 844 },
  { id: 'iphone-14-pro', name: 'iPhone 14 Pro', width: 393, height: 852 },
  { id: 'pixel-7', name: 'Pixel 7', width: 412, height: 915 },
  { id: 'ipad-air', name: 'iPad Air', width: 820, height: 1180 },
  { id: 'desktop', name: 'Desktop', width: 1280, height: 800 },
] as const

export function browserViewportDeviceForSize(size: BrowserViewportSize): string {
  return BROWSER_VIEWPORT_DEVICES.find(device => device.width === size.width && device.height === size.height)?.id ?? 'custom'
}

export function viewportDimensionValid(dimension: keyof BrowserViewportSize, value: number): boolean {
  return Number.isInteger(value) && value >= 240 && value <= (dimension === 'width' ? 3_840 : 2_160)
}

export function clampViewportSize(size: BrowserViewportSize): BrowserViewportSize {
  return {
    width: Math.round(Math.max(240, Math.min(3_840, size.width))),
    height: Math.round(Math.max(240, Math.min(2_160, size.height))),
  }
}

export function browserPreviewScale(size: BrowserViewportSize, canvas: BrowserViewportSize, zoom: BrowserPreviewZoom): number {
  if (zoom !== 'fit')
    return Number(zoom) / 100
  if (canvas.width <= 32 || canvas.height <= 32)
    return 1
  return Math.max(0.1, Math.min(1, (canvas.width - 32) / size.width, (canvas.height - 32) / size.height))
}

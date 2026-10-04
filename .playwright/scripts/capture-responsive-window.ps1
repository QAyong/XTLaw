param([long]$Handle, [string]$Path)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class ResponsivePreviewWindow {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr handle, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle, out Rect rect);
}
'@
$rect = [ResponsivePreviewWindow+Rect]::new()
if (-not [ResponsivePreviewWindow]::GetWindowRect([IntPtr]::new($Handle), [ref]$rect)) { throw 'Cannot read test window bounds.' }
$bitmap = [System.Drawing.Bitmap]::new($rect.Right - $rect.Left, $rect.Bottom - $rect.Top)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $dc = $graphics.GetHdc()
  try {
    if (-not [ResponsivePreviewWindow]::PrintWindow([IntPtr]::new($Handle), $dc, 2)) { throw 'Cannot capture the test window.' }
  }
  finally { $graphics.ReleaseHdc($dc) }
  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}

# Derive Windows icons from the original light assets, removing only outer transparent padding.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$icons = Join-Path $repoRoot 'apps/buddy/resources/icons'
foreach ($profile in @('', '-dev', '-test')) {
    $source = Join-Path $icons "app-icon$profile-light.png"
    $target = Join-Path $icons "app-icon$profile-windows.png"
    $image = [System.Drawing.Bitmap]::new($source)
    $output = $null
    $graphics = $null
    try {
        $minX = $image.Width
        $minY = $image.Height
        $maxX = -1
        $maxY = -1
        for ($y = 0; $y -lt $image.Height; $y++) {
            for ($x = 0; $x -lt $image.Width; $x++) {
                if ($image.GetPixel($x, $y).A -gt 0) {
                    $minX = [Math]::Min($minX, $x)
                    $minY = [Math]::Min($minY, $y)
                    $maxX = [Math]::Max($maxX, $x)
                    $maxY = [Math]::Max($maxY, $y)
                }
            }
        }
        if ($maxX -lt 0) { throw "Empty icon: $source" }
        $width = $maxX - $minX + 1
        $height = $maxY - $minY + 1
        if ($width -ne $height) { throw "Expected square icon content: $source" }
        $output = [System.Drawing.Bitmap]::new(512, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($output)
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $attributes = [System.Drawing.Imaging.ImageAttributes]::new()
        try {
            $attributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
            $graphics.DrawImage($image, [System.Drawing.Rectangle]::new(0, 0, 512, 512), $minX, $minY, $width, $height, [System.Drawing.GraphicsUnit]::Pixel, $attributes)
            $output.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
        }
        finally { $attributes.Dispose() }
        Write-Output "$target (cropped $width x $height to 512 x 512)"
    }
    finally {
        if ($graphics) { $graphics.Dispose() }
        if ($output) { $output.Dispose() }
        $image.Dispose()
    }
}

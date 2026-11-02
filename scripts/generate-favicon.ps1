# Rasterize the matching outline with Windows GDI+; pack PNG layers into an ICO.
Add-Type -AssemblyName System.Drawing
$iconLayers = @()
foreach ($iconSize in @(16,24,32,48,64,128,256)) {
    $bitmap = [System.Drawing.Bitmap]::new($iconSize,$iconSize)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.ScaleTransform($iconSize/64.0,$iconSize/64.0)
    $pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#258ca3'),3.5)
    $pen.StartCap = $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddPolygon([System.Drawing.PointF[]]@([System.Drawing.PointF]::new(9,27),[System.Drawing.PointF]::new(54,10),[System.Drawing.PointF]::new(36,54),[System.Drawing.PointF]::new(27,36)))
    $path.StartFigure(); $path.AddLine(27,36,43,21)
    $path.StartFigure(); $path.AddBezier(8,44,10.333,42,12.666,42,15,44); $path.AddBezier(15,44,17.333,46,19.666,46,22,44)
    $graphics.DrawPath($pen,$path)
    $buffer = [System.IO.MemoryStream]::new()
    $bitmap.Save($buffer,[System.Drawing.Imaging.ImageFormat]::Png)
    $iconLayers += ,@{Size=$iconSize;Data=$buffer.ToArray()}
    $buffer.Dispose(); $path.Dispose(); $pen.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
$iconStream = [System.IO.MemoryStream]::new()
$writer = [System.IO.BinaryWriter]::new($iconStream)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$iconLayers.Count)
$iconOffset = 6+16*$iconLayers.Count
foreach ($layer in $iconLayers) {
    $dimension = if ($layer.Size -eq 256) {0} else {$layer.Size}
    $writer.Write([byte]$dimension); $writer.Write([byte]$dimension); $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$layer.Data.Length); $writer.Write([uint32]$iconOffset)
    $iconOffset += $layer.Data.Length
}
foreach ($layer in $iconLayers) {$writer.Write([byte[]]$layer.Data)}
$writer.Flush()
$iconTarget = Join-Path $PSScriptRoot '..\public\public\favicon.ico'
[System.IO.File]::WriteAllBytes($iconTarget,$iconStream.ToArray())
$writer.Dispose(); $iconStream.Dispose()
Write-Output 'Generated favicon.ico (16–256px)'

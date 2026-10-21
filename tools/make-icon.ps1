# 把一张方形 PNG 转成多个尺寸的 PNG（圆角裁剪 + 四角透明），供 make-icon.js 合成 .ico
# 用法：powershell -File tools/make-icon.ps1 -Source assets/icon/xxx.png -OutDir assets/icon/sizes
param(
  [Parameter(Mandatory=$true)][string]$Source,
  [Parameter(Mandatory=$true)][string]$OutDir
)

Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Image]::FromFile((Resolve-Path $Source).Path)
$W = [int]$src.Width
$H = [int]$src.Height
$inset = [int]($W * 0.02)          # 稍微往里收一点，去掉原图最外的浅色描边
$sw = [int]($W - 2 * $inset)
$sh = [int]($H - 2 * $inset)

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$sizes = @(16, 24, 32, 48, 64, 128, 256)

foreach ($s in $sizes) {
  $bmp = [System.Drawing.Bitmap]::new($s, $s, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  # 圆角遮罩（radius = 20%）
  $r = [int]($s * 0.20)
  $d = [int]($r * 2)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc(0, 0, $d, $d, 180, 90)
  $path.AddArc(($s - $d), 0, $d, $d, 270, 90)
  $path.AddArc(($s - $d), ($s - $d), $d, $d, 0, 90)
  $path.AddArc(0, ($s - $d), $d, $d, 90, 90)
  $path.CloseFigure()
  $g.SetClip($path)

  $dstRect = [System.Drawing.Rectangle]::new(0, 0, $s, $s)
  $srcRect = [System.Drawing.Rectangle]::new($inset, $inset, $sw, $sh)
  $g.DrawImage($src, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

  $g.Dispose()
  $bmp.Save((Join-Path $OutDir ("icon-$s.png")), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $path.Dispose()
}

$src.Dispose()
Write-Output ("已生成尺寸: " + ($sizes -join ', '))

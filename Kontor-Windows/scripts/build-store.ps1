param(
  [ValidatePattern('^[A-Za-z0-9.-]{3,50}$')][string]$IdentityName = 'MichaelNickel.kontor',
  [ValidateNotNullOrEmpty()][string]$Publisher = 'CN=904311B3-822B-45CD-87BF-65B5596E9267',
  [ValidateNotNullOrEmpty()][string]$PublisherDisplayName = 'Michael Nickel',
  [ValidateNotNullOrEmpty()][string]$DisplayName = 'kontor'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path $PSScriptRoot -Parent
$sdk = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
$makeappx = Get-ChildItem "$sdk\*\x64\makeappx.exe" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Name } -Descending | Select-Object -First 1
if (!$makeappx) { throw 'Windows SDK fehlt: MakeAppx.exe wird benoetigt.' }
$version = (Get-Content "$root\package.json" -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Eine numerische Release-Version wird benoetigt.' }
$version = "$version.0"
$stage = Join-Path ([IO.Path]::GetTempPath()) ("kontor-msix-" + [Guid]::NewGuid())
$layout = Join-Path $stage 'layout'
$packages = Join-Path $stage 'packages'
$output = Join-Path $root 'release\store'
function XmlText([string]$value) { return [Security.SecurityElement]::Escape($value) }
Push-Location $root
try {
  # Always build fresh Windows binaries; never package a previous release by accident.
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Frontend-Build fehlgeschlagen.' }
  & npx.cmd --no-install electron-builder --win --x64 --dir --publish never
  if ($LASTEXITCODE -ne 0) { throw 'Windows-Build fehlgeschlagen.' }
  # Exercise the packaged files, not only the unbundled development app.
  $previousAppPath = $env:KONTOR_APP_PATH
  try {
    $env:KONTOR_APP_PATH = "$root\release\win-unpacked\resources\app.asar"
    & node.exe tests/startup.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Starttest der verpackten App fehlgeschlagen.' }
  } finally { $env:KONTOR_APP_PATH = $previousAppPath }

  New-Item -ItemType Directory -Force -Path "$layout\app", "$layout\Assets", $packages, $output | Out-Null
  Copy-Item "$root\release\win-unpacked\*" "$layout\app" -Recurse
  Add-Type -AssemblyName System.Drawing
  $image = [Drawing.Image]::FromFile("$root\resources\icon.png")
  try {
    foreach ($size in @(44, 50, 150)) {
      $bitmap = New-Object Drawing.Bitmap($size, $size)
      $graphics = [Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.Clear([Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.DrawImage($image, 0, 0, $size, $size)
        $bitmap.Save("$layout\Assets\Logo$size.png", [Drawing.Imaging.ImageFormat]::Png)
      } finally { $graphics.Dispose(); $bitmap.Dispose() }
    }
  } finally { $image.Dispose() }
  $manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10" xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10" xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities" IgnorableNamespaces="uap rescap">
  <Identity Name="$(XmlText $IdentityName)" Publisher="$(XmlText $Publisher)" Version="$version" ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>$(XmlText $DisplayName)</DisplayName>
    <PublisherDisplayName>$(XmlText $PublisherDisplayName)</PublisherDisplayName>
    <Logo>Assets\Logo50.png</Logo>
  </Properties>
  <Resources><Resource Language="de-DE" /></Resources>
  <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.22000.0" MaxVersionTested="10.0.26200.0" /></Dependencies>
  <Applications>
    <Application Id="Kontor" Executable="app\Kontor Windows.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="$(XmlText $DisplayName)" Description="Gespräche, Aufgaben und Notizen lokal organisieren." BackgroundColor="#7c5cfc" Square150x150Logo="Assets\Logo150.png" Square44x44Logo="Assets\Logo44.png" />
    </Application>
  </Applications>
  <Capabilities><rescap:Capability Name="runFullTrust" /></Capabilities>
</Package>
"@
  [IO.File]::WriteAllText("$layout\AppxManifest.xml", $manifest, [Text.UTF8Encoding]::new($false))
  # Keep MakeAppx validation enabled. Store signing is performed by Microsoft.
  & $makeappx.FullName pack /o /d $layout /p "$packages\Kontor-$version-x64.msix"
  if ($LASTEXITCODE -ne 0) { throw 'MSIX-Pruefung oder Verpackung fehlgeschlagen.' }
  $bundle = "$output\Kontor-$version-x64.msixbundle"
  & $makeappx.FullName bundle /o /bv $version /d $packages /p $bundle
  if ($LASTEXITCODE -ne 0) { throw 'Bundle-Erstellung fehlgeschlagen.' }
  Copy-Item "$layout\AppxManifest.xml" "$output\AppxManifest.xml"
  Get-FileHash $bundle -Algorithm SHA256 | Format-List
  Write-Host "Store-Upload: $bundle"
} finally {
  Pop-Location
  if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
}

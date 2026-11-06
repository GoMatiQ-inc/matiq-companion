$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
if ($env:COMPANION_RELEASE_VERSION) { $version = $env:COMPANION_RELEASE_VERSION }
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Use a three-part release version.' }
$output = if ($env:COMPANION_RELEASE_OUTPUT) { $env:COMPANION_RELEASE_OUTPUT } else { 'dist' }
if ($output -notin 'dist','upgrade-target') { throw 'Use an owned qualification output directory.' }
$arch = node -p process.arch
if ($LASTEXITCODE -ne 0 -or $arch -notin 'x64','arm64') { throw 'Verify on a native supported Windows architecture.' }
$unpacked = if ($arch -eq 'arm64') { 'win-arm64-unpacked' } else { 'win-unpacked' }
if (-not $env:MATIQ_WINDOWS_PUBLISHER) { throw 'Provide the validated Windows publisher name before verification.' }
$artifact = "MatiQ-Companion-$version-windows-$arch.exe"
$installer = Join-Path $root "$output/$artifact"
$app = Join-Path $root "$output/$unpacked"
if (-not (Test-Path (Join-Path $app 'MatiQ Companion.exe'))) { throw 'Packaged application is missing. Build the signed app before verification.' }
node -e 'require("./scripts/verify-pe-architecture.cjs").verifyPEArchitecture(process.argv[1],process.argv[2]).catch(error=>{console.error(error.message);process.exit(1)})' (Join-Path $app 'MatiQ Companion.exe') $arch
if ($LASTEXITCODE -ne 0) { throw 'The signed application architecture does not match the native target.' }
$files = @(Get-Item $installer) + @(Get-ChildItem $app -Recurse -File | Where-Object { $_.Extension -in '.exe', '.dll', '.node' })
foreach ($file in $files) {
  $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
  if ($signature.Status -ne 'Valid') { throw "Invalid Authenticode signature on $($file.Name): $($signature.Status)." }
  if ($signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) -ne $env:MATIQ_WINDOWS_PUBLISHER) { throw "Unexpected publisher on $($file.Name). Use the validated company signing profile." }
  if (-not $signature.TimeStamperCertificate) { throw "Missing timestamp on $($file.Name). Timestamp every signed binary and installer." }
}
node --input-type=module -e 'import {verifyUpdateAssets} from "./scripts/verify-update-assets.mjs";await verifyUpdateAssets(process.argv[1],process.argv[2],"win32",process.argv[3])' (Join-Path $root $output) $version $arch
if ($LASTEXITCODE -ne 0) { throw 'Update metadata does not match the signed installer bytes.' }
$assets = @{}
$assetFiles = @($artifact,'latest.yml')
if (Test-Path (Join-Path $root "$output/$artifact.blockmap")) { $assetFiles += "$artifact.blockmap" }
foreach ($name in $assetFiles) { $assets[$name] = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root "$output/$name")).Hash.ToLowerInvariant() }
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installer).Hash.ToLowerInvariant()
@{ nativeArchitectureVerified=$true; assets=$assets; arch=$arch; platform='win32'; version=$version; artifact=$artifact; sha256=$hash; signed=$true; timestamped=$true; publisher=$env:MATIQ_WINDOWS_PUBLISHER; filesChecked=$files.Count } | ConvertTo-Json | Set-Content (Join-Path $root "$output/windows-signature.json") -Encoding utf8NoBOM
Write-Output "Verified company Authenticode signatures and timestamps on $($files.Count) packaged files and installer."

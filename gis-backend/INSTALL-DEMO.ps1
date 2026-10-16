$ErrorActionPreference = 'Stop'
Set-Location 'C:\sikma-main2\gis-backend'

Write-Host 'Target folder:' (Get-Location) -ForegroundColor Cyan
Write-Host 'PENTING: jalankan hanya pada working copy DEMO, bukan simiti.id produksi.' -ForegroundColor Yellow

if (-not (Test-Path '.\server.js')) { throw 'server.js tidak ditemukan.' }
if (-not (Test-Path '.\externalApiManagement.js')) { throw 'externalApiManagement.js belum ada. Extract file dari ZIP ke folder backend terlebih dahulu.' }
if (-not (Test-Path '.\externalApiManagement.sql')) { throw 'externalApiManagement.sql belum ada. Extract file dari ZIP ke folder backend terlebih dahulu.' }

$server = Get-Content '.\server.js' -Raw
if ($server.Contains('createExternalApiManagementRouter')) {
  throw 'Mount External API tampaknya sudah ada. Tidak ada perubahan pada server.js.'
}

$pattern = '(?ms)(const requireAdminMemberRegistration = \(req, res, next\) => \{.*?^\};\s*)(app\.post\("/api/member-registrations")'
$mount = @'
$1
// SIMITI External API Management (isolated module; existing routes are preserved)
const { createExternalApiManagementRouter } = require("./externalApiManagement");
app.use(
  "/api/external-management",
  createExternalApiManagementRouter({ pool, adminOnly: requireAdminMemberRegistration }),
);

$2
'@
$updated = [regex]::Replace($server, $pattern, $mount, 1)
if ($updated -eq $server) {
  throw 'Marker middleware tidak ditemukan persis. server.js tidak diubah; lakukan patch manual setelah middleware requireAdminMemberRegistration.'
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = ".\server.js.external-api-backup-$stamp.bak"
Copy-Item '.\server.js' $backup
Set-Content '.\server.js' -Value $updated -Encoding UTF8
Write-Host "Backup dibuat: $backup" -ForegroundColor Green
Write-Host 'Mount ditambahkan. SQL belum dijalankan dan endpoint layanan eksternal tetap nonaktif.' -ForegroundColor Yellow

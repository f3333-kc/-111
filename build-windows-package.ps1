$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceDir = (Get-ChildItem (Join-Path $root 'dist') | Where-Object { $_.Name -like '*win32-x64' } | Select-Object -First 1).FullName
$zipPath = Join-Path $root 'dist\guard-admin-package.zip'
$guidePath = Join-Path $root 'dist\install-notes.txt'

if (-not $sourceDir -or -not (Test-Path $sourceDir)) {
    throw "Cannot find packaged app folder in dist."
}

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Compress-Archive -Path $sourceDir -DestinationPath $zipPath -Force

@'
Guard Admin Windows Package

How to use:
1. Unzip guard-admin-package.zip
2. Open the extracted folder
3. Run GuardAdmin.exe
4. Login:
   Username: admin
   Password: admin123

Notes:
- This is a single-user distributable desktop version.
- Data is stored locally in the app folder.
- It is intended for the single-admin shared mode.
'@ | Set-Content -Encoding UTF8 $guidePath

Write-Host "Package created: $zipPath"
Write-Host "Install notes created: $guidePath"

[CmdletBinding()]
param(
  [string]$Email = "",
  [int]$Port = 4174,
  [switch]$ConfigureOnly
)

$ErrorActionPreference = "Stop"
$appDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $appDirectory ".gmail-config.json"

if (-not $Email -and (Get-Command gh -ErrorAction SilentlyContinue)) {
  try { $Email = (gh api user --jq .email 2>$null).Trim() } catch { $Email = "" }
}

do {
  $prompt = if ($Email) { "Gmail sender and report recipient [$Email]" } else { "Gmail sender and report recipient" }
  $enteredEmail = Read-Host $prompt
  if ($enteredEmail) { $Email = $enteredEmail.Trim() }
} while ($Email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$')

Write-Host "Create a Google App Password at https://myaccount.google.com/apppasswords" -ForegroundColor Cyan
Write-Host "Use the 16-character App Password, not your normal Gmail password." -ForegroundColor DarkGray
$securePassword = Read-Host "Gmail App Password" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) -replace '\s', ''
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}

if ($plainPassword.Length -ne 16) {
  throw "A Gmail App Password must contain 16 characters. No configuration was saved."
}

$normalizedPassword = ConvertTo-SecureString $plainPassword -AsPlainText -Force
$encryptedPassword = $normalizedPassword | ConvertFrom-SecureString
$plainPassword = $null
$configuration = [ordered]@{
  gmailUser = $Email
  reportRecipient = $Email
  appPasswordDpapi = $encryptedPassword
}
$configuration | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
Write-Host "Encrypted Gmail configuration saved for the current Windows user." -ForegroundColor Green

if ($ConfigureOnly) { return }

while (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
  $Port += 1
}

$python = (Get-Command python -ErrorAction Stop).Source
$serverPath = Join-Path $appDirectory "server.py"
$env:AEROCHEM_PORT = [string]$Port
Start-Process -FilePath $python -ArgumentList @("-u", $serverPath) -WorkingDirectory $appDirectory -WindowStyle Hidden | Out-Null

$url = "http://127.0.0.1:$Port/"
$statusUrl = "${url}api/report/status"
$ready = $false
for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
  Start-Sleep -Milliseconds 300
  try {
    $status = Invoke-RestMethod -Uri $statusUrl -TimeoutSec 2
    if ($status.configured) { $ready = $true; break }
  } catch { }
}

if (-not $ready) {
  throw "The server started, but Gmail configuration could not be verified."
}

Write-Host "Automatic formatted Gmail reports are ready at $url" -ForegroundColor Green
Start-Process $url

[CmdletBinding()]
param(
  [string]$Email = "",
  [int]$Port = 4173,
  [switch]$ConfigureOnly
)

$ErrorActionPreference = "Stop"
$appDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $appDirectory ".gmail-config.json"

if (-not $Email -and (Get-Command gh -ErrorAction SilentlyContinue)) {
  try { $Email = (gh api user --jq .email 2>$null).Trim() } catch { $Email = "" }
}

do {
  $prompt = if ($Email) {
    "Gmail address [$Email] - press Enter to accept"
  } else {
    "Gmail address (not the App Password)"
  }
  $enteredEmail = (Read-Host $prompt).Trim()
  if (-not $enteredEmail -and $Email -match '^[^\s@]+@[^\s@]+\.[^\s@]+$') { break }
  if (($enteredEmail -replace '\s', '') -match '^[A-Za-z]{16}$' -and $enteredEmail -notmatch '@') {
    Write-Warning "That looks like an App Password. Do not enter it here. Press Enter to accept the email; the hidden password prompt is next."
    continue
  }
  if ($enteredEmail -match '^[^\s@]+@[^\s@]+\.[^\s@]+$') {
    $Email = $enteredEmail
    break
  }
  Write-Warning "Enter a valid email address, or press Enter to accept the address in brackets."
} while ($true)

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

$url = "http://127.0.0.1:$Port/"
$statusUrl = "${url}api/report/status"
$ready = $false
try {
  $status = Invoke-RestMethod -Uri $statusUrl -TimeoutSec 2
  if ($status.configured) { $ready = $true }
} catch { }

if ($ConfigureOnly) { return }

if (-not $ready) {
  while (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    $Port += 1
  }
  $python = (Get-Command python -ErrorAction Stop).Source
  $serverPath = Join-Path $appDirectory "server.py"
  $env:AEROCHEM_PORT = [string]$Port
  Start-Process -FilePath $python -ArgumentList @("-u", $serverPath) -WorkingDirectory $appDirectory -WindowStyle Hidden | Out-Null
  $url = "http://127.0.0.1:$Port/"
  $statusUrl = "${url}api/report/status"
}

for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
  if ($ready) { break }
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

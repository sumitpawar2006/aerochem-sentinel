[CmdletBinding()]
param(
  [string]$Model = "gpt-5.6-terra",
  [int]$Port = 4173,
  [switch]$ConfigureOnly
)

$ErrorActionPreference = "Stop"
$appDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $appDirectory ".ai-config.json"

Write-Host "Create an OpenAI API key at https://platform.openai.com/api-keys" -ForegroundColor Cyan
Write-Host "API usage is billed by OpenAI. Paste the key only into the hidden prompt below." -ForegroundColor DarkGray
$secureKey = Read-Host "OpenAI API key" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
  $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}

if (-not $plainKey.StartsWith("sk-") -or $plainKey.Length -lt 20) {
  throw "The value does not look like an OpenAI API key. No configuration was saved."
}

$normalizedKey = ConvertTo-SecureString $plainKey -AsPlainText -Force
$encryptedKey = $normalizedKey | ConvertFrom-SecureString
$plainKey = $null
$configuration = [ordered]@{
  apiKeyDpapi = $encryptedKey
  model = $Model
}
$configuration | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
Write-Host "Encrypted AI configuration saved for the current Windows user." -ForegroundColor Green

$url = "http://127.0.0.1:$Port/"
$statusUrl = "${url}api/chat/status"
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
  $statusUrl = "${url}api/chat/status"
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
  throw "The server started, but the AI configuration could not be verified."
}

Write-Host "General Sentinel AI is ready at $url" -ForegroundColor Green
Start-Process $url

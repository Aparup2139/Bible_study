# Run SQL against your Supabase database from PowerShell (same as the web SQL Editor).
#
# Setup (once per terminal): set a Supabase PERSONAL ACCESS TOKEN (starts with sbp_):
#   get it from https://supabase.com/dashboard/account/tokens
#   $env:SUPABASE_ACCESS_TOKEN = "sbp_xxxxxxxx"
#
# Usage:
#   ./db-query.ps1 "select id, email, email_confirmed_at from auth.users order by created_at desc limit 5;"
#   ./db-query.ps1 "update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where email_confirmed_at is null;"
param([Parameter(Mandatory = $true)][string]$Sql)

$PAT = $env:SUPABASE_ACCESS_TOKEN
if (-not $PAT) {
  Write-Error "Set a personal access token first:  `$env:SUPABASE_ACCESS_TOKEN = 'sbp_...'  (https://supabase.com/dashboard/account/tokens)"
  exit 1
}

# Derive the project ref from SUPABASE_URL in .env (e.g. https://<ref>.supabase.co)
$envPath = Join-Path $PSScriptRoot '.env'
$supaUrl = ((Get-Content $envPath | Where-Object { $_ -match '^SUPABASE_URL=' }) -replace '^SUPABASE_URL=','').Trim().Trim('"')
if ($supaUrl -notmatch 'https://([a-z0-9]+)\.supabase\.co') {
  Write-Error "Could not read project ref from SUPABASE_URL in $envPath"
  exit 1
}
$ref = $Matches[1]

$body = @{ query = $Sql } | ConvertTo-Json
try {
  $r = Invoke-RestMethod -Method Post `
    -Uri "https://api.supabase.com/v1/projects/$ref/database/query" `
    -Headers @{ Authorization = "Bearer $PAT" } `
    -ContentType 'application/json' -Body $body
  if ($null -eq $r -or ($r -is [array] -and $r.Count -eq 0)) {
    Write-Host "OK (no rows returned)." -ForegroundColor Green
  } else {
    $r | Format-Table -AutoSize
  }
} catch {
  Write-Host "Query failed:" -ForegroundColor Red
  if ($_.Exception.Response) {
    $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
    Write-Host $sr.ReadToEnd()
  } else { Write-Host $_.Exception.Message }
}

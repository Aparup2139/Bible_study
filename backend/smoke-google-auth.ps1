# Google auth smoke test - verifies the whole config chain the app relies on,
# without a real browser login (that part is native-only, test on a dev build).
#   cd backend ; ./smoke-google-auth.ps1
# Checks: Frontend/.env client ID, Supabase Google provider enabled, Supabase's
# client ID matches the app's, and the id_token exchange endpoint validates tokens.

$frontEnv = Join-Path $PSScriptRoot '..\Frontend\.env'
function Get-EnvVal($path, $k) {
  ((Get-Content $path | Where-Object { $_ -match "^$k=" }) -replace "^$k=","").Trim().Trim('"')
}
$SUPA = Get-EnvVal $frontEnv 'EXPO_PUBLIC_SUPABASE_URL'
$ANON = Get-EnvVal $frontEnv 'EXPO_PUBLIC_SUPABASE_ANON_KEY'
$WEB_CLIENT_ID = Get-EnvVal $frontEnv 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'

$script:pass = 0; $script:fail = 0
function Assert($name, $cond, $detail) {
  if ($cond) { Write-Host "PASS  $name" -ForegroundColor Green; $script:pass++ }
  else { Write-Host "FAIL  $name  $detail" -ForegroundColor Red; $script:fail++ }
}

Write-Host "`n== Config ==" -ForegroundColor Cyan
Write-Host "Supabase:  $SUPA"
Write-Host "Client ID: $WEB_CLIENT_ID"

Write-Host "`n== 1. App env ==" -ForegroundColor Cyan
Assert "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID set" ([bool]$WEB_CLIENT_ID) "missing from Frontend/.env - signInWithGoogle() returns 'not configured yet'"
Assert "client ID is a Web OAuth client" ($WEB_CLIENT_ID -match '^\d+-\w+\.apps\.googleusercontent\.com$') "got '$WEB_CLIENT_ID'"
Assert "Supabase URL + anon key set" ([bool]$SUPA -and [bool]$ANON) "missing from Frontend/.env"

Write-Host "`n== 2. Supabase Google provider enabled ==" -ForegroundColor Cyan
# /authorize redirects (302) to accounts.google.com when the provider is enabled;
# returns 400 when it is not.
$authorizeUrl = "$SUPA/auth/v1/authorize?provider=google" + '&redirect_to=https://example.com'
$location = ''
try {
  $r = Invoke-WebRequest -UseBasicParsing -MaximumRedirection 0 -ErrorAction SilentlyContinue $authorizeUrl -Headers @{ apikey = $ANON }
  $location = $r.Headers['Location']
} catch {
  $resp = $_.Exception.Response
  if ($resp) { $location = $resp.Headers['Location'] }
}
Assert "authorize redirects to Google (provider enabled)" ($location -match 'accounts\.google\.com') "Location: '$location' - is Google enabled in Supabase -> Auth -> Providers?"

Write-Host "`n== 3. Supabase client ID matches the app's ==" -ForegroundColor Cyan
$supaClientId = ''
if ($location -match 'client_id=([^&]+)') { $supaClientId = [uri]::UnescapeDataString($Matches[1]) }
Assert "Supabase Google client_id == app's web client ID" ($supaClientId -eq $WEB_CLIENT_ID) "Supabase uses '$supaClientId' - signInWithIdToken will reject tokens minted for '$WEB_CLIENT_ID'"

Write-Host "`n== 4. id_token exchange endpoint (what signInWithGoogle calls) ==" -ForegroundColor Cyan
# A bogus token must be REJECTED as an invalid token (proves the endpoint is live
# and validating), not with 'provider is not enabled'.
$body = @{ provider = 'google'; id_token = 'bogus.id.token' } | ConvertTo-Json
$tokenUrl = "$SUPA/auth/v1/token?grant_type=id_token"
try {
  $r = Invoke-WebRequest -UseBasicParsing -Method POST $tokenUrl -Headers @{ apikey = $ANON } -Body $body -ContentType 'application/json'
  $status = [int]$r.StatusCode; $respBody = $r.Content
} catch {
  $resp = $_.Exception.Response
  $status = if ($resp) { [int]$resp.StatusCode.value__ } else { 0 }
  try { $sr = New-Object IO.StreamReader($resp.GetResponseStream()); $respBody = $sr.ReadToEnd() } catch { $respBody = $_.Exception.Message }
}
Assert "bogus id_token rejected 4xx" ($status -ge 400 -and $status -lt 500) "got $status : $respBody"
Assert "rejection is token-validation (provider IS enabled)" ($respBody -notmatch 'not enabled|unsupported' -and $respBody -match 'token|OIDC|JWT|jwt') "got: $respBody"

Write-Host "`n========================================" -ForegroundColor Cyan
$summaryColor = if ($script:fail -eq 0) { 'Green' } else { 'Red' }
Write-Host "  $script:pass passed, $script:fail failed" -ForegroundColor $summaryColor
Write-Host "========================================`n" -ForegroundColor Cyan
Write-Host "NOTE: the interactive Google account-picker + token mint is native-only;" -ForegroundColor Yellow
Write-Host "verify that part once on a dev build (Expo Go cannot run it at all)." -ForegroundColor Yellow
if ($script:fail -gt 0) { exit 1 }

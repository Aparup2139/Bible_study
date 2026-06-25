# BibleWay backend smoke test — run on YOUR machine with the API running (npm run dev).
#   cd backend ; npm run dev          (in one terminal)
#   cd backend ; ./smoke-test.ps1     (in another)
# Optional env overrides: BIBLEWAY_API, BIBLEWAY_TEST_EMAIL, BIBLEWAY_TEST_PASSWORD, BIBLEWAY_TEST_USERNAME

$API = if ($env:BIBLEWAY_API) { $env:BIBLEWAY_API } else { 'http://localhost:3000' }
$envPath = Join-Path $PSScriptRoot '.env'
function Get-EnvVal($k) {
  ((Get-Content $envPath | Where-Object { $_ -match "^$k=" }) -replace "^$k=","").Trim().Trim('"')
}
$SUPA = Get-EnvVal 'SUPABASE_URL'
$ANON = Get-EnvVal 'SUPABASE_ANON_KEY'
$EMAIL = if ($env:BIBLEWAY_TEST_EMAIL) { $env:BIBLEWAY_TEST_EMAIL } else { 'aparupghosh85@gmail.com' }
$PWD_  = if ($env:BIBLEWAY_TEST_PASSWORD) { $env:BIBLEWAY_TEST_PASSWORD } else { 'Passw0rd!23' }
$UNAME = if ($env:BIBLEWAY_TEST_USERNAME) { $env:BIBLEWAY_TEST_USERNAME } else { 'sunny_test' }

$script:pass = 0; $script:fail = 0
function Req($method, $uri, $headers, $body) {
  try {
    $p = @{ Method = $method; Uri = $uri; UseBasicParsing = $true }
    if ($headers) { $p.Headers = $headers }
    if ($body)    { $p.Body = ($body | ConvertTo-Json); $p.ContentType = 'application/json' }
    $r = Invoke-WebRequest @p
    return @{ status = [int]$r.StatusCode; body = $r.Content }
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $sc = [int]$resp.StatusCode.value__
      try { $sr = New-Object IO.StreamReader($resp.GetResponseStream()); $b = $sr.ReadToEnd() } catch { $b = '' }
      return @{ status = $sc; body = $b }
    }
    return @{ status = 0; body = $_.Exception.Message }
  }
}
function Assert($name, $cond, $detail) {
  if ($cond) { Write-Host "PASS  $name" -ForegroundColor Green; $script:pass++ }
  else { Write-Host "FAIL  $name  $detail" -ForegroundColor Red; $script:fail++ }
}

Write-Host "`n== Config ==" -ForegroundColor Cyan
Write-Host "API:      $API"
Write-Host "Supabase: $SUPA"
Write-Host "Anon key: $(if ($ANON) { 'loaded (' + $ANON.Length + ' chars)' } else { 'MISSING' })"

Write-Host "`n== 1. Health ==" -ForegroundColor Cyan
$h = Req 'GET' "$API/health"
Assert "GET /health = 200" ($h.status -eq 200) "got $($h.status)"
Assert "health supabaseConfigured = true" ($h.body -match '"supabaseConfigured":true') $h.body

Write-Host "`n== 2. Sign in (get token) ==" -ForegroundColor Cyan
$signin = Req 'POST' "$SUPA/auth/v1/token?grant_type=password" @{ apikey = $ANON } @{ email = $EMAIL; password = $PWD_ }
Assert "Supabase password sign-in = 200" ($signin.status -eq 200) "got $($signin.status): $($signin.body)"
$TOKEN = $null
if ($signin.status -eq 200) { $TOKEN = ($signin.body | ConvertFrom-Json).access_token }
$AUTH = @{ Authorization = "Bearer $TOKEN" }
Assert "access token present" ([bool]$TOKEN) "no token (is the user confirmed? is email/password right?)"

if ($TOKEN) {
  Write-Host "`n== 3. Authed profile ==" -ForegroundColor Cyan
  $me = Req 'GET' "$API/api/v1/profiles/me" $AUTH
  Assert "GET /profiles/me = 200" ($me.status -eq 200) "got $($me.status): $($me.body)"
  Assert "profile has id+handle" ($me.body -match '"id"' -and $me.body -match '"handle"') $me.body

  Write-Host "`n== 4. JWT verification (fast path vs fallback both must accept a valid token) ==" -ForegroundColor Cyan
  Assert "valid token accepted on protected route" ($me.status -eq 200) "got $($me.status)"

  Write-Host "`n== 5. Profile update + privileged-field guard ==" -ForegroundColor Cyan
  $stamp = "smoke $(Get-Date -Format o)"
  $upd = Req 'PATCH' "$API/api/v1/profiles/me" $AUTH @{ bio = $stamp }
  Assert "PATCH /profiles/me bio = 200" ($upd.status -eq 200) "got $($upd.status): $($upd.body)"
  Assert "bio persisted" ($upd.body -match [regex]::Escape($stamp)) $upd.body
  $bad = Req 'PATCH' "$API/api/v1/profiles/me" $AUTH @{ isVerified = $true; subscriberCount = 99999 }
  Assert "privileged fields ignored (isVerified stays false)" ($bad.body -match '"isVerified":false') $bad.body
  Assert "privileged fields ignored (subscriberCount not 99999)" ($bad.body -notmatch '"subscriberCount":99999') $bad.body
}

Write-Host "`n== 6. Public username availability ==" -ForegroundColor Cyan
$taken = Req 'GET' "$API/api/v1/auth/check-handle?handle=$UNAME"
Assert "check-handle taken = 200" ($taken.status -eq 200) "got $($taken.status): $($taken.body)"
Assert "existing username reported unavailable" ($taken.body -match '"available":false') $taken.body
$free = Req 'GET' "$API/api/v1/auth/check-handle?handle=zz_free_$(Get-Random)"
Assert "random username reported available" ($free.body -match '"available":true') $free.body
$invalid = Req 'GET' "$API/api/v1/auth/check-handle?handle=ab"
Assert "invalid handle rejected = 400" ($invalid.status -eq 400) "got $($invalid.status)"

Write-Host "`n== 7. Username login shim ==" -ForegroundColor Cyan
$ulogin = Req 'POST' "$API/api/v1/auth/sign-in-with-username" $null @{ username = $UNAME; password = $PWD_ }
Assert "username+password sign-in = 2xx" ($ulogin.status -ge 200 -and $ulogin.status -lt 300) "got $($ulogin.status): $($ulogin.body)"
Assert "returns accessToken + refreshToken" ($ulogin.body -match '"accessToken"' -and $ulogin.body -match '"refreshToken"') $ulogin.body
$ubad = Req 'POST' "$API/api/v1/auth/sign-in-with-username" $null @{ username = $UNAME; password = 'wrong-password-xyz' }
Assert "wrong password = 401 (generic)" ($ubad.status -eq 401) "got $($ubad.status): $($ubad.body)"
$unouser = Req 'POST' "$API/api/v1/auth/sign-in-with-username" $null @{ username = 'no_such_user_zz'; password = $PWD_ }
Assert "unknown username = 401 (no enumeration)" ($unouser.status -eq 401) "got $($unouser.status)"

Write-Host "`n== 8. Guard: missing / bad token rejected ==" -ForegroundColor Cyan
$noauth = Req 'GET' "$API/api/v1/profiles/me"
Assert "no token = 401" ($noauth.status -eq 401) "got $($noauth.status)"
$badauth = Req 'GET' "$API/api/v1/profiles/me" @{ Authorization = 'Bearer not.a.jwt' }
Assert "bad token = 401 (not 500)" ($badauth.status -eq 401) "got $($badauth.status): $($badauth.body)"

Write-Host "`n== 9. Other feature endpoints reachable ==" -ForegroundColor Cyan
$den = Req 'GET' "$API/api/v1/denominations"
Assert "GET /denominations = 200" ($den.status -eq 200) "got $($den.status)"
$pod = Req 'GET' "$API/api/v1/podcasts/episodes"
Assert "GET /podcasts/episodes = 200" ($pod.status -eq 200) "got $($pod.status)"
$cat = Req 'GET' "$API/api/v1/podcasts/categories"
Assert "GET /podcasts/categories = 200" ($cat.status -eq 200) "got $($cat.status)"

Write-Host "`n== 10. Security headers (Helmet) ==" -ForegroundColor Cyan
try {
  $hdrs = (Invoke-WebRequest -UseBasicParsing "$API/health").Headers
  Assert "X-Content-Type-Options present" ($hdrs['X-Content-Type-Options']) ''
  Assert "X-Frame-Options present" ($hdrs['X-Frame-Options']) ''
  Assert "Content-Security-Policy present" ($hdrs['Content-Security-Policy']) ''
} catch { Assert "security headers" $false $_.Exception.Message }

Write-Host "`n========================================" -ForegroundColor Cyan
$summaryColor = if ($script:fail -eq 0) { 'Green' } else { 'Red' }
Write-Host "  $script:pass passed, $script:fail failed" -ForegroundColor $summaryColor
Write-Host "========================================`n" -ForegroundColor Cyan
if ($script:fail -gt 0) { exit 1 }

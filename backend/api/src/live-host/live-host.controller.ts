import { Controller, Get, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

/**
 * Expo Go demo path for *broadcasting* on Android.
 *
 * Expo Go's Android WebView never answers getUserMedia (the camera permission
 * prompt is swallowed), so the host can't publish from inside the app. The app
 * instead opens this page in Chrome, which handles camera permission properly.
 *
 * Credentials ride in the URL *fragment* (#appId=…&channel=…&token=…&uid=…),
 * which browsers never send to the server — this route only serves static HTML
 * and never sees the Agora token. The token itself is short-lived and scoped to
 * one channel (minted by POST /streams/go-live).
 *
 * The dev-client / EAS build never uses this: it publishes via native Agora.
 */
const AGORA_WEB_SDK_URL = 'https://download.agora.io/sdk/release/AgoraRTC_N-4.20.0.js';

const PAGE = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<title>InspiredbyChrist · Live</title>
<script src="${AGORA_WEB_SDK_URL}"></script>
<style>
  html, body { margin: 0; height: 100%; background: #050505; color: #f4efe6; font-family: system-ui, sans-serif; overflow: hidden; }
  #stage { position: fixed; inset: 0; background: #050505; }
  video { object-fit: cover; width: 100%; height: 100%; }
  #bar { position: fixed; left: 0; right: 0; bottom: 0; padding: 20px 20px 32px; display: flex; flex-direction: column; align-items: center; gap: 14px;
         background: linear-gradient(transparent, rgba(0,0,0,0.85)); }
  #status { font-size: 14px; letter-spacing: 0.3px; text-align: center; line-height: 1.5; }
  #live { display: none; position: fixed; top: 18px; left: 18px; padding: 5px 12px; border-radius: 999px; background: rgba(5,5,5,0.7);
          border: 1px solid rgba(255,255,255,0.3); font-size: 11px; letter-spacing: 2px; color: #d9b46a; }
  button { font: inherit; font-size: 13px; letter-spacing: 1.5px; padding: 14px 30px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.45);
           background: rgba(5,5,5,0.72); color: #d9b46a; }
  #flip { display: none; }
</style>
</head>
<body>
<div id="stage"></div>
<div id="live">● LIVE</div>
<div id="bar">
  <div id="status">Starting…</div>
  <div style="display:flex; gap:12px">
    <button id="flip">FLIP</button>
    <button id="end">END</button>
  </div>
</div>
<script>
(function () {
  var statusEl = document.getElementById('status');
  var liveEl = document.getElementById('live');
  var endBtn = document.getElementById('end');
  var flipBtn = document.getElementById('flip');
  function setStatus(t) { statusEl.textContent = t; }

  var params = new URLSearchParams(location.hash.slice(1));
  var cfg = { appId: params.get('appId'), channel: params.get('channel'), token: params.get('token'), uid: Number(params.get('uid') || 1) };
  // Drop credentials from the visible URL / history once read.
  history.replaceState(null, '', location.pathname);

  var client = null, micTrack = null, camTrack = null, facing = 'user', ended = false;

  async function start() {
    try {
      if (!cfg.appId || !cfg.channel || !cfg.token) throw new Error('Missing stream details — start again from the app.');
      if (typeof AgoraRTC === 'undefined') throw new Error('Could not load the Agora SDK. Check your connection.');
      setStatus('Opening camera…');
      micTrack = await AgoraRTC.createMicrophoneAudioTrack({ AEC: true, ANS: true });
      camTrack = await AgoraRTC.createCameraVideoTrack({ facingMode: facing, encoderConfig: '720p_1' });
      camTrack.play('stage');
      flipBtn.style.display = 'inline-block';

      setStatus('Connecting…');
      client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      await client.setClientRole('host');
      await client.join(cfg.appId, cfg.channel, cfg.token, cfg.uid);
      await client.publish([micTrack, camTrack]);
      liveEl.style.display = 'block';
      setStatus('You are live. Keep this tab open — switching away pauses your camera.');
      client.on('token-privilege-did-expire', function () { stop('Stream token expired (1 hour). Start a new stream from the app.'); });
    } catch (e) {
      var msg = (e && e.message) ? e.message : String(e);
      if (e && (e.name === 'NotAllowedError' || /PERMISSION_DENIED/.test(msg))) msg = 'Camera/microphone permission was denied. Allow it for this site in Chrome, then reload.';
      stop('Could not go live: ' + msg);
    }
  }

  async function stop(message) {
    if (ended) return;
    ended = true;
    try { if (micTrack) micTrack.close(); if (camTrack) camTrack.close(); if (client) await client.leave(); } catch (e) {}
    liveEl.style.display = 'none';
    flipBtn.style.display = 'none';
    endBtn.style.display = 'none';
    setStatus(message + ' You can return to the app now.');
  }

  endBtn.onclick = function () { stop('Stream ended.'); };
  flipBtn.onclick = async function () {
    if (!camTrack) return;
    facing = facing === 'user' ? 'environment' : 'user';
    try {
      var devices = await AgoraRTC.getCameras();
      var want = devices.find(function (d) { return /back|rear|environment/i.test(d.label) === (facing === 'environment'); });
      if (want) await camTrack.setDevice(want.deviceId);
    } catch (e) { /* keep current camera */ }
  };
  window.addEventListener('pagehide', function () { stop('Stream ended.'); });

  start();
})();
</script>
</body>
</html>`;

// Inline scripts + Agora's SDK/edge servers; helmet's default CSP blocks both.
const CSP = [
  "default-src 'self'",
  // 'unsafe-eval': the Agora SDK builds some helpers at runtime.
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://download.agora.io`,
  "style-src 'unsafe-inline'",
  'connect-src https: wss:',
  'media-src blob: mediastream:',
  'img-src data: blob:',
  'worker-src blob:',
].join('; ');

@Controller('live-host')
export class LiveHostController {
  @Get()
  page(@Res() reply: FastifyReply): void {
    void reply
      .header('content-security-policy', CSP)
      .header('permissions-policy', 'camera=(self), microphone=(self)')
      .header('cache-control', 'no-store')
      .type('text/html; charset=utf-8')
      .send(PAGE);
  }
}

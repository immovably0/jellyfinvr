/*
 * Jellyfin supports plugins for VR v1
 */
(function () {
  'use strict';

  if (window.__JELLYFIN_VR_V42__) return;
  window.__JELLYFIN_VR_V42__ = true;

  const VERSION = 'v4.10-playback-quality';
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.min.js';
  const BUTTON_ID = 'jvr-v4-button';
  const OVERLAY_ID = 'jvr-v4-overlay';
  const PANEL_WIDTH = 1.12;
  const PANEL_HEIGHT = 0.504;
  const PANEL_HOME = { x: 0, y: -0.36, z: -1.45 };
  const TIMELINE = { x: 80, y: 164, width: 1440, height: 76, trackY: 192, trackHeight: 20 };

  let overlay = null;
  let statusEl = null;
  let sourceVideo = null;
  let activeVideo = null;
  let compatVideo = null;
  let originalState = null;
  let compatUrl = '';
  let compatOffset = 0;
  let sourceMode = 'original';
  let savedVideoId = '';
  let loadSerial = 0;

  let world = null;
  let camera = null;
  let renderer = null;
  let videoTexture = null;
  let mediaLayer = null;
  let mediaLayerKey = '';
  let mediaLayerVideo = null;
  let mediaLayerNote = 'Canvas';
  let fpsPresentedFrames = 0;
  let playbackQualityBaseline = null;
  let textureVideo = null;
  let videoFrameCanvas = null;
  let videoFrameContext = null;
  let videoFrameCallback = null;
  let videoFrameDirty = false;
  let videoFrameTime = -1;
  let videoFrameFailed = false;
  let fpsMesh = null;
  let fpsCanvas = null;
  let fpsContext = null;
  let fpsTexture = null;
  let fpsLabel = null;
  let fpsStart = null;
  let fpsFrames = 0;
  let fpsVideoFrames = 0;
  let perfSamples = {};
  let decodeTotal = 0;
  let decodeCount = 0;

  function recordCost(name, milliseconds) {
    const sample = perfSamples[name] || (perfSamples[name] = { total: 0, count: 0, max: 0 });
    sample.total += milliseconds;
    sample.count += 1;
    sample.max = Math.max(sample.max, milliseconds);
  }

  function costLabel(name) {
    const sample = perfSamples[name];
    return sample?.count ? `${(sample.total / sample.count).toFixed(1)}/${sample.max.toFixed(1)}` : '--';
  }
  let videoRoot = null;
  let videoMeshes = [];
  let controllers = [];
  let panelMesh = null;
  let panelCanvas = null;
  let panelContext = null;
  let panelTexture = null;
  let panelBorder = null;
  let panelCursor = null;
  let panelVisible = false;
  // Diagnostic stats (HUD in VR + label in the toolbar) are hidden by default.
  let statsVisible = false;
  let panelButtons = [];
  let hoverAction = '';
  let lastPanelDraw = 0;
  let lastStickAction = 0;
  let xrSession = null;
  let xrEntering = false;
  let xrEntryTask = null;
  let xrPanelTimer = null;
  let closing = false;
  let opening = false;

  let scanTimer = 0;
  let resizeHandler = null;
  const inputStates = new WeakMap();
  const triggerStates = new WeakMap();
  const gripTimers = new WeakMap();
  const dragState = {
    controller: null,
    type: '',
    startTime: 0,
    startDirection: null,
    startYaw: 0,
    startPitch: 0,
    startPanelPosition: null,
    startPanelQuaternion: null,
    seekTime: 0,
    moved: false
  };
  const currentMode = { projection: '180', stereo: 'sbs', swap: false };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.THREE?.WebGLRenderer) return resolve();
      const existing = Array.from(document.scripts).find((item) => item.src === src);
      const script = existing || document.createElement('script');
      if (!existing) {
        script.src = src;
        script.crossOrigin = 'anonymous';
        document.head.appendChild(script);
      }
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => reject(new Error('Échec du chargement de Three.js')), { once: true });
    });
  }

  async function ensureThree() {
    if (!window.THREE?.WebGLRenderer) await loadScript(THREE_URL);
    if (!window.THREE?.WebGLRenderer) throw new Error('Échec de l’initialisation de Three.js');
  }

  function findVideo() {
    const videos = Array.from(document.querySelectorAll('video')).filter((video) => video.id !== 'jvr-compat-video');
    return videos.find((video) => video.currentSrc && !video.paused)
        || videos.find((video) => video.currentSrc || video.src)
        || null;
  }

  function formatTime(value) {
    if (!Number.isFinite(value)) return '0:00';
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const seconds = Math.floor(value % 60).toString().padStart(2, '0');
    return hours
        ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds}`
        : `${minutes}:${seconds}`;
  }

  function setQueryParam(url, name, value) {
    Array.from(url.searchParams.keys()).forEach((key) => {
      if (key.toLowerCase() === name.toLowerCase()) url.searchParams.delete(key);
    });
    if (value !== null && value !== undefined) url.searchParams.set(name, String(value));
  }

  function buildCompatStreamUrl(video) {
    const raw = video?.currentSrc || video?.src;
    if (!raw) return '';
    try {
      const url = new URL(raw, location.href);
      const match = url.pathname.match(/^(.*\/Videos\/)([^/]+)\/stream(?:\.[^/]*)?$/i);
      if (!match) return '';
      url.pathname = `${match[1]}${match[2]}/stream.mp4`;
      setQueryParam(url, 'Static', 'false');
      setQueryParam(url, 'VideoCodec', 'h264');
      setQueryParam(url, 'AudioCodec', 'aac');
      setQueryParam(url, 'EnableAutoStreamCopy', 'false');
      setQueryParam(url, 'AllowVideoStreamCopy', 'false');
      setQueryParam(url, 'AllowAudioStreamCopy', 'false');
      setQueryParam(url, 'MaxVideoBitDepth', '8');
      setQueryParam(url, 'RequireAvc', 'true');
      setQueryParam(url, 'VideoBitRate', '40000000');
      setQueryParam(url, 'AudioBitRate', '320000');
      setQueryParam(url, 'AudioChannels', '2');
      setQueryParam(url, 'MaxWidth', '4096');
      setQueryParam(url, 'MaxHeight', '4096');
      setQueryParam(url, 'Context', 'Streaming');
      setQueryParam(url, 'SubtitleStreamIndex', null);
      setQueryParam(url, 'SubtitleMethod', null);
      setQueryParam(url, 'StartTimeTicks', null);
      return url.href;
    } catch (_) {
      return '';
    }
  }

  function getCurrentTime() {
    if (!activeVideo) return 0;
    return sourceMode === 'compat'
        ? compatOffset + (activeVideo.currentTime || 0)
        : (activeVideo.currentTime || 0);
  }

  function getDuration() {
    return originalState?.duration || sourceVideo?.duration || activeVideo?.duration || 0;
  }

  function addStyles() {
    if (document.getElementById('jvr-v4-style')) return;
    const style = document.createElement('style');
    style.id = 'jvr-v4-style';
    style.textContent = `
      #${OVERLAY_ID}{position:fixed;inset:0;z-index:2147483646;background:#000;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden}
      #${OVERLAY_ID} .jvr-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
      #${OVERLAY_ID} .jvr-bar{position:absolute;top:0;left:0;right:0;z-index:5;display:flex;align-items:center;gap:7px;padding:10px;background:linear-gradient(#000e,transparent);pointer-events:auto}
      #${OVERLAY_ID} button{border:1px solid #ffffff45;border-radius:7px;background:#17191ddd;color:#fff;padding:8px 10px;font:inherit;cursor:pointer}
      #${OVERLAY_ID} button.active{border-color:#20b9ed;background:#075c78}
      #${OVERLAY_ID} button:disabled{opacity:.4;cursor:not-allowed}
      #${OVERLAY_ID} .jvr-enter{margin-left:auto;background:#008fbd;font-weight:700}
      #${OVERLAY_ID} .jvr-close{font-size:20px;padding:4px 12px}
      #${OVERLAY_ID} .jvr-status{position:absolute;left:50%;bottom:20px;z-index:5;transform:translateX(-50%);padding:8px 12px;border-radius:7px;background:#111e;color:#ccd3da;font-size:13px;white-space:nowrap;pointer-events:none}
      @media(max-width:780px){#${OVERLAY_ID} .jvr-bar{flex-wrap:wrap}.jvr-label{display:none}}
    `;
    document.head.appendChild(style);
  }

  function createButton(label, action, value) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.action = action;
    if (value) button.dataset.value = value;
    return button;
  }

  function buildOverlay() {
    addStyles();
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    const bar = document.createElement('div');
    bar.className = 'jvr-bar';
    const close = createButton('←', 'exit');
    close.className = 'jvr-close';
    bar.append(close);
    const version = document.createElement('span');
    version.className = 'jvr-label';
    version.textContent = `Jellyfin VR ${VERSION}`;
    bar.append(version);
    fpsLabel = document.createElement('span');
    fpsLabel.className = 'jvr-label';
    fpsLabel.textContent = 'Rendu -- FPS · Mise à jour vidéo -- FPS';
    fpsLabel.style.display = statsVisible ? '' : 'none';
    bar.append(fpsLabel);
    [['360°', '360'], ['180° équirect.', '180'], ['180° fisheye', 'fisheye'], ['Cinéma', 'flat']]
        .forEach(([label, value]) => bar.append(createButton(label, 'projection', value)));
    [['Mono', 'mono'], ['SBS', 'sbs'], ['OU', 'ou']]
        .forEach(([label, value]) => bar.append(createButton(label, 'stereo', value)));
    bar.append(createButton('Échanger les yeux', 'swap'));
    const stats = createButton('Stats', 'stats');
    stats.id = 'jvr-stats-toggle';
    bar.append(stats);
    const source = createButton('Source d’origine', 'source');
    source.id = 'jvr-source-toggle';
    bar.append(source);
    const enter = createButton('Entrer en VR', 'enter');
    enter.className = 'jvr-enter';
    bar.append(enter);
    statusEl = document.createElement('div');
    statusEl.className = 'jvr-status';
    statusEl.textContent = 'Initialisation du moteur de rendu WebXR natif…';
    overlay.append(bar, statusEl);
    document.body.appendChild(overlay);
    bar.addEventListener('click', handleToolbar);
  }

  function createPanel() {
    panelCanvas = document.createElement('canvas');
    panelCanvas.width = 1600;
    panelCanvas.height = 720;
    panelContext = panelCanvas.getContext('2d');
    panelTexture = new THREE.CanvasTexture(panelCanvas);
    panelTexture.colorSpace = THREE.SRGBColorSpace;
    const geometry = new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT);
    const material = new THREE.MeshBasicMaterial({
      map: panelTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    panelMesh = new THREE.Mesh(geometry, material);
    panelMesh.name = 'jvr-control-panel';
    panelMesh.position.set(PANEL_HOME.x, PANEL_HOME.y, PANEL_HOME.z);
    panelMesh.renderOrder = 10000;
    panelMesh.visible = false;
    camera.add(panelMesh);

    const borderGeometry = new THREE.EdgesGeometry(geometry);
    const borderMaterial = new THREE.LineBasicMaterial({ color: 0x35cfff, transparent: true, opacity: 0.95, depthTest: false });
    panelBorder = new THREE.LineSegments(borderGeometry, borderMaterial);
    panelBorder.name = 'jvr-panel-drag-border';
    panelBorder.position.z = 0.006;
    panelBorder.renderOrder = 10002;
    panelMesh.add(panelBorder);

    const cursorGeometry = new THREE.RingGeometry(0.013, 0.023, 32);
    const cursorMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
    panelCursor = new THREE.Mesh(cursorGeometry, cursorMaterial);
    panelCursor.name = 'jvr-panel-cursor';
    panelCursor.position.z = 0.012;
    panelCursor.renderOrder = 10003;
    panelCursor.visible = false;
    const cursorDot = new THREE.Mesh(
        new THREE.CircleGeometry(0.008, 24),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false, depthWrite: false })
    );
    cursorDot.position.z = 0.001;
    panelCursor.add(cursorDot);
    panelMesh.add(panelCursor);
    drawPanel();
  }

  function roundedRect(context, x, y, width, height, radius) {
    context.beginPath();
    if (typeof context.roundRect === 'function') {
      context.roundRect(x, y, width, height, radius);
      return;
    }
    const r = Math.min(radius, width / 2, height / 2);
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  function addPanelButton(x, y, width, height, label, action, color = '#27303a') {
    const context = panelContext;
    const hovered = hoverAction === action;
    roundedRect(context, x, y, width, height, 18);
    context.fillStyle = hovered ? '#008fc2d9' : `${color}a6`;
    context.fill();
    context.strokeStyle = hovered ? '#83ddff' : '#ffffff30';
    context.lineWidth = hovered ? 5 : 2;
    context.stroke();
    context.fillStyle = '#fff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    // Auto-shrink so longer (translated) labels never overflow the button.
    fillFittedText(context, label, x + width / 2, y + height / 2, width - 36, 44, 26);
    panelButtons.push({ x, y, width, height, action });
  }

  function fillFittedText(context, text, centerX, centerY, maxWidth, startSize, minSize = 26) {
    let size = startSize;
    do {
      context.font = `${size}px system-ui, sans-serif`;
      if (context.measureText(text).width <= maxWidth) break;
      size -= 2;
    } while (size > minSize);
    let output = text;
    if (context.measureText(output).width > maxWidth) {
      while (output.length > 4 && context.measureText(`${output}…`).width > maxWidth) output = output.slice(0, -1);
      output += '…';
    }
    context.fillText(output, centerX, centerY);
  }

  function drawPanel() {
    if (!panelContext || !panelTexture) return;
    const context = panelContext;
    panelButtons = [];
    context.clearRect(0, 0, panelCanvas.width, panelCanvas.height);
    roundedRect(context, 0, 0, 1600, 720, 30);
    context.fillStyle = '#10151b73';
    context.fill();
    context.strokeStyle = '#36d2ffff';
    context.lineWidth = 12;
    context.stroke();
    context.fillStyle = '#12384880';
    context.fillRect(28, 18, 1544, 16);
    context.fillStyle = '#5edcff';
    context.font = '28px system-ui, sans-serif';
    context.textAlign = 'right';
    context.fillText('Maintenez le bord pour déplacer le panneau', 1530, 52);
    context.fillStyle = '#fff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const title = (document.title || 'Jellyfin VR').replace(/\s+/g, ' ');
    fillFittedText(context, title, 800, 76, 1440, 52, 30);
    context.fillStyle = '#aeb9c4';
    context.font = '42px system-ui, sans-serif';
    const shownTime = dragState.type === 'seek' ? dragState.seekTime : getCurrentTime();
    context.fillText(`${formatTime(shownTime)} / ${formatTime(getDuration())}`, 800, 125);
    const duration = getDuration();
    const progress = duration > 0 ? THREE.MathUtils.clamp(shownTime / duration, 0, 1) : 0;
    roundedRect(context, TIMELINE.x, TIMELINE.trackY, TIMELINE.width, TIMELINE.trackHeight, 10);
    context.fillStyle = '#34414c';
    context.fill();
    roundedRect(context, TIMELINE.x, TIMELINE.trackY, Math.max(20, TIMELINE.width * progress), TIMELINE.trackHeight, 10);
    context.fillStyle = '#f5f8fb';
    context.fill();
    context.beginPath();
    context.arc(TIMELINE.x + TIMELINE.width * progress, TIMELINE.trackY + TIMELINE.trackHeight / 2, 24, 0, Math.PI * 2);
    context.fillStyle = '#fff';
    context.fill();
    context.strokeStyle = '#171d22';
    context.lineWidth = 5;
    context.stroke();
    addPanelButton(55, 275, 170, 105, '-10', 'back');
    addPanelButton(245, 275, 220, 105, activeVideo?.paused ? 'LIRE' : 'PAUSE', 'play', '#006f96');
    addPanelButton(485, 275, 170, 105, '+10', 'forward');
    addPanelButton(675, 275, 210, 105, activeVideo?.muted ? 'MUET' : 'SON', 'mute');
    addPanelButton(905, 275, 210, 105, currentMode.projection.toUpperCase(), 'projection');
    addPanelButton(1135, 275, 180, 105, currentMode.stereo.toUpperCase(), 'stereo');
    addPanelButton(1335, 275, 210, 105, sourceMode === 'compat' ? 'H264' : 'SOURCE', 'source', '#25536a');
    addPanelButton(55, 435, 282, 105, 'ÉCHANGER YEUX', 'swap');
    addPanelButton(357, 435, 282, 105, 'RÉINITIALISER', 'reset', '#365061');
    addPanelButton(659, 435, 282, 105, statsVisible ? 'MASQUER STATS' : 'STATS', 'stats', '#25536a');
    addPanelButton(961, 435, 282, 105, 'MASQUER', 'hide');
    addPanelButton(1263, 435, 282, 105, 'QUITTER VR', 'exit-vr', '#652d34');
    context.fillStyle = '#81909f';
    context.font = '36px system-ui, sans-serif';
    fillFittedText(context, 'Barre de temps : glisser · Gâchette maintenue : déplacer la vue · Grip maintenu : tout réinitialiser', 800, 635, 1500, 36, 24);
    panelTexture.needsUpdate = true;
  }

  function buildRenderer() {
    world = new THREE.Scene();
    world.background = new THREE.Color(0x000000);
    camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.01, 120);
    camera.position.set(0, 1.6, 0);
    camera.layers.enable(0);
    camera.layers.enable(1);
    world.add(camera);
    videoRoot = new THREE.Group();
    videoRoot.name = 'jvr-video-view-root';
    videoRoot.position.set(0, 1.6, 0);
    world.add(videoRoot);
    // r160 does not forward an xrCompatible renderer option to getContext().
    // Supply the context explicitly and avoid the XR MSAA resolve path, which
    // can produce flashing blocks on affected Meta browser/GPU combinations.
    const canvas = document.createElement('canvas');
    const contextOptions = {
      xrCompatible: true,
      antialias: false,
      alpha: true,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance'
    };
    const context = canvas.getContext('webgl2', contextOptions)
        || canvas.getContext('webgl', contextOptions);
    if (!context) throw new Error('Impossible de créer un contexte WebGL compatible WebXR.');
    renderer = new THREE.WebGLRenderer({ canvas, context, ...contextOptions });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    // Diagnostic compatibility setting: avoid reduced-resolution peripheral
    // rendering while investigating the blocks at the top of the headset view.
    // Set before setSession(), so it applies when Three.js creates the XR layer.
    renderer.xr.setFoveation(0);
    renderer.domElement.className = 'jvr-canvas';
    overlay.prepend(renderer.domElement);
    createFpsDisplay();
    renderer.xr.addEventListener('sessionstart', resetFps);
    renderer.xr.addEventListener('sessionend', resetFps);
    createPanel();
    setupControllers();
    resizeHandler = () => {
      if (!renderer || !camera) return;
      // XR owns the framebuffer dimensions until the session has ended.
      if (xrSession || renderer.xr.isPresenting) return;
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    };
    renderer.xr.addEventListener('sessionend', resizeHandler);
    window.addEventListener('resize', resizeHandler);
    renderer.setAnimationLoop(renderFrame);
  }

  function resetFps() {
    fpsStart = null;
    playbackQualityBaseline = null;
    fpsFrames = 0;
    fpsVideoFrames = 0;
    perfSamples = {};
    decodeTotal = decodeCount = 0;
    fpsPresentedFrames = 0;
  }

  // totalVideoFrames includes dropped frames. Subtract interval drops to
  // estimate effective video FPS; this is not a headset/compositor counter.
  function samplePlaybackQuality(time) {
    const video = textureVideo;
    let quality;
    try { quality = video?.getVideoPlaybackQuality?.(); }
    catch (_) { quality = null; }
    if (!quality || !Number.isFinite(quality.totalVideoFrames)
        || !Number.isFinite(quality.droppedVideoFrames)) {
      playbackQualityBaseline = null;
      return 'Stats vidéo -- · compteur d’images non fourni par le navigateur';
    }
    const total = quality.totalVideoFrames;
    const dropped = quality.droppedVideoFrames;
    const previous = playbackQualityBaseline;
    playbackQualityBaseline = { video, time, total, dropped };
    if (!previous || previous.video !== video || time <= previous.time
        || total < previous.total || dropped < previous.dropped) {
      return `Stats vidéo : échantillonnage · images perdues (cumul) ${dropped}`;
    }
    const frameDelta = total - previous.total;
    const dropDelta = dropped - previous.dropped;
    if (dropDelta > frameDelta) return `Stats vidéo : nouvel échantillonnage · images perdues (cumul) ${dropped}`;
    const elapsed = time - previous.time;
    const effectiveFps = (frameDelta - dropDelta) * 1000 / elapsed;
    const dropRate = frameDelta ? dropDelta * 100 / frameDelta : 0;
    return `Vidéo effective ${effectiveFps.toFixed(1)} FPS · perdues sur la période ${dropDelta}/${frameDelta} (${dropRate.toFixed(1)} %) · cumul ${dropped}`;
  }

  function createFpsDisplay() {
    fpsCanvas = document.createElement('canvas');
    fpsCanvas.width = 1024;
    fpsCanvas.height = 300;
    fpsContext = fpsCanvas.getContext('2d');
    fpsTexture = new THREE.CanvasTexture(fpsCanvas);
    fpsTexture.colorSpace = THREE.SRGBColorSpace;
    fpsTexture.generateMipmaps = false;
    fpsTexture.minFilter = THREE.LinearFilter;
    fpsMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1.35, 0.3955),
        new THREE.MeshBasicMaterial({ map: fpsTexture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false })
    );
    fpsMesh.name = 'jvr-fps-display';
    fpsMesh.position.set(0, -0.76, -1.45);
    fpsMesh.renderOrder = 10004;
    fpsMesh.visible = statsVisible;
    camera.add(fpsMesh);
    resetFps();
    drawFps('Rendu -- FPS · Rappels vidéo -- FPS\nStats vidéo : échantillonnage');
  }

  function drawFps(text) {
    if (!statsVisible) return;
    if (fpsLabel) { fpsLabel.textContent = text.replace(/\n/g, ' · '); fpsLabel.style.whiteSpace = 'pre-wrap'; }
    if (!fpsContext || !fpsTexture) return;
    fpsContext.clearRect(0, 0, 1024, 300);
    fpsContext.fillStyle = '#10151bd9';
    fpsContext.fillRect(0, 0, 1024, 300);
    fpsContext.fillStyle = '#91f2c2';
    fpsContext.font = '30px system-ui, sans-serif';
    fpsContext.textAlign = 'center';
    fpsContext.textBaseline = 'middle';
    text.split('\n').forEach((line, index) => fpsContext.fillText(line, 512, 30 + index * 58, 1000));
    fpsTexture.needsUpdate = true;
  }

  function updateFps(time) {
    if (!Number.isFinite(time)) return;
    if (fpsStart === null || time < fpsStart || time - fpsStart > 5000) {
      resetFps();
      fpsStart = time;
      samplePlaybackQuality(time);
      return;
    }
    fpsFrames += 1;
    const elapsed = time - fpsStart;
    if (elapsed < 1000) return;
    const playbackQualityText = samplePlaybackQuality(time);
    // Count submitted render frames and actual canvas video-frame copies.
    // This is not the compositor's display rate or the file's nominal FPS.
    drawFps(`Rendu ${(fpsFrames * 1000 / elapsed).toFixed(1)} FPS · Rappels vidéo ${(fpsPresentedFrames * 1000 / elapsed).toFixed(1)} FPS${mediaLayer ? '' : ` · Copie ${(fpsVideoFrames * 1000 / elapsed).toFixed(1)} FPS`}\n${playbackQualityText}\nCopie ${costLabel('copy')} · Envoi GPU ${costLabel('upload')} ms moy/max\nRendu ${costLabel('render')} ms moy/max · Latence décodage ${decodeCount ? (decodeTotal / decodeCount).toFixed(1) : '--'} ms\n${mediaLayerNote} · Source ${textureVideo?.videoWidth || '?'}×${textureVideo?.videoHeight || '?'}${mediaLayer ? '' : ` → Texture ${videoFrameCanvas?.width || '?'}×${videoFrameCanvas?.height || '?'}`}`);
    fpsStart = time;
    fpsFrames = 0;
    fpsVideoFrames = 0;
    perfSamples = {};
    decodeTotal = decodeCount = 0;
    fpsPresentedFrames = 0;
  }

  function makeGeometry(projection, eye) {
    let geometry;
    if (projection === '360') {
      geometry = new THREE.SphereGeometry(50, 64, 32, 0, Math.PI * 2, 0, Math.PI);
      geometry.scale(-1, 1, 1);
    } else if (projection === 'flat') {
      geometry = new THREE.PlaneGeometry(7.2, 4.05, 1, 1);
    } else {
      geometry = new THREE.SphereGeometry(50, 64, 32, -Math.PI / 2, Math.PI, 0, Math.PI);
      geometry.scale(-1, 1, 1);
    }
    if (currentMode.stereo !== 'mono') {
      const selectedEye = currentMode.swap ? 1 - eye : eye;
      const uv = geometry.attributes.uv;
      for (let index = 0; index < uv.count; index += 1) {
        let u = uv.getX(index);
        let v = uv.getY(index);
        if (currentMode.stereo === 'sbs') u = u * 0.5 + selectedEye * 0.5;
        else v = v * 0.5 + (selectedEye === 0 ? 0.5 : 0);
        uv.setXY(index, u, v);
      }
      uv.needsUpdate = true;
    }
    return geometry;
  }

  function makeMaterial(eye) {
    if (currentMode.projection !== 'fisheye') {
      return new THREE.MeshBasicMaterial({
        map: videoTexture,
        side: currentMode.projection === 'flat' ? THREE.DoubleSide : THREE.FrontSide,
        // The video is a background, not occluding scene geometry. Do not
        // submit its large sphere/plane triangles to the depth buffer.
        depthTest: false,
        depthWrite: false,
        toneMapped: false
      });
    }
    const selectedEye = currentMode.swap ? 1 - eye : eye;
    const stereoLine = currentMode.stereo === 'sbs'
        ? `p.x=p.x*0.5+${selectedEye ? '0.5' : '0.0'};`
        : currentMode.stereo === 'ou'
            ? `p.y=p.y*0.5+${selectedEye ? '0.0' : '0.5'};`
            : '';
    return new THREE.ShaderMaterial({
      side: THREE.FrontSide,
      depthTest: false,
      depthWrite: false,
      uniforms: { map: { value: videoTexture } },
      vertexShader: `varying vec3 vLocal;void main(){vLocal=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform sampler2D map;varying vec3 vLocal;void main(){vec2 p=vLocal.xy*0.5+0.5;${stereoLine}gl_FragColor=texture2D(map,p);}`
    });
  }

  function disposeVideoMeshes() {
    videoMeshes.forEach((mesh) => {
      videoRoot?.remove(mesh);
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    });
    videoMeshes = [];
  }

  function rebuildVideoMeshes() {
    if (!world || !videoTexture) return;
    disposeVideoMeshes();
    const stereo = currentMode.stereo !== 'mono';
    const left = new THREE.Mesh(makeGeometry(currentMode.projection, 0), makeMaterial(0));
    left.name = 'jvr-left-video';
    left.renderOrder = -1000;
    if (currentMode.projection === 'flat') left.position.set(0, 0, -4.5);
    else if (currentMode.projection !== '360') left.rotation.y = Math.PI / 2;
    left.layers.set(stereo ? 1 : 0);
    videoRoot.add(left);
    videoMeshes.push(left);
    if (stereo) {
      const right = new THREE.Mesh(makeGeometry(currentMode.projection, 1), makeMaterial(1));
      right.name = 'jvr-right-video';
      right.renderOrder = -1000;
      if (currentMode.projection === 'flat') right.position.set(0, 0, -4.5);
      else if (currentMode.projection !== '360') right.rotation.y = Math.PI / 2;
      right.layers.set(2);
      videoRoot.add(right);
      videoMeshes.push(right);
    }
    updateToolbar();
    drawPanel();
  }

  async function prepareOriginalCors(video) {
    const raw = video.currentSrc || video.src;
    if (!raw) return;
    const url = new URL(raw, location.href);
    if (!/^https?:$/.test(url.protocol) || video.crossOrigin) return;
    let needsCors = url.origin !== location.origin;
    if (video.readyState >= 2) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d');
      try {
        context.drawImage(video, 0, 0, 1, 1);
        context.getImageData(0, 0, 1, 1);
      } catch (error) {
        if (error.name !== 'SecurityError') throw error;
        needsCors = true;
      }
    }
    if (!needsCors) return;
    const position = video.currentTime;
    const rate = video.playbackRate;
    video.pause();
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener('loadedmetadata', ready);
        video.removeEventListener('error', failed);
      };
      const ready = () => {
        cleanup();
        if (!video.isConnected) return reject(new Error('La vidéo d’origine n’est plus dans la page'));
        try {
          video.currentTime = Number.isFinite(video.duration)
              ? Math.min(position, Math.max(0, video.duration - 0.01)) : position;
          video.playbackRate = rate;
          resolve();
        } catch (error) { reject(error); }
      };
      const failed = () => {
        cleanup();
        reject(new Error('Échec du chargement CORS de la vidéo d’origine : vérifiez que les réponses du serveur vidéo incluent les en-têtes d’autorisation cross-origin.'));
      };
      const timer = setTimeout(failed, 20000);
      video.addEventListener('loadedmetadata', ready);
      video.addEventListener('error', failed);
      // Keep the same element and exact URL. No new codec, bitrate or stream parameters.
      video.crossOrigin = 'anonymous';
      video.src = raw;
      video.load();
    });
  }

  function replaceVideoTexture(video) {
    if (!video || !world || video.readyState < 2) return false;
    if (textureVideo === video && videoTexture) return true;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d');
    try {
      context.drawImage(video, 0, 0, 1, 1);
      context.getImageData(0, 0, 1, 1);
    } catch (error) {
      statusEl.textContent = error.name === 'SecurityError'
          ? 'La lecture de l’image de la vidéo d’origine est toujours refusée par CORS : vérifiez les en-têtes de réponse du serveur vidéo.'
          : `Image de la vidéo d’origine pas encore disponible : ${error.message || error}`;
      return false;
    }
    if (mediaLayer) clearMediaLayer();
    stopVideoFrameUpdates();
    videoTexture?.dispose?.();
    // Snapshot decoded frames into a canvas instead of directly importing the
    // decoder's video surface into WebGL during an XR eye draw.
    textureVideo = video;
    videoFrameCanvas = canvas;
    videoFrameContext = context;
    videoFrameDirty = true;
    videoFrameTime = -1;
    videoFrameFailed = false;
    resetFps();
    videoTexture = new THREE.CanvasTexture(canvas);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.generateMipmaps = false;
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    if (typeof video.requestVideoFrameCallback === 'function') {
      const onFrame = (now, metadata) => {
        if (textureVideo !== video || closing) return;
        videoFrameDirty = true;
        fpsPresentedFrames += 1;
        if (Number.isFinite(metadata?.processingDuration)) {
          decodeTotal += metadata.processingDuration * 1000;
          decodeCount += 1;
        }
        videoFrameCallback = video.requestVideoFrameCallback(onFrame);
      };
      videoFrameCallback = video.requestVideoFrameCallback(onFrame);
    }
    updateVideoFrame();
    rebuildVideoMeshes();
    return true;
  }

  function stopVideoFrameUpdates() {
    if (videoFrameCallback !== null) textureVideo?.cancelVideoFrameCallback?.(videoFrameCallback);
    videoFrameCallback = null;
    textureVideo = null;
  }

  function updateVideoFrame() {
    const video = textureVideo;
    if (mediaLayer) return;
    if (!video || !videoTexture || videoFrameFailed || video.readyState < 2 || video.seeking) return;
    if (typeof video.requestVideoFrameCallback !== 'function' && video.currentTime !== videoFrameTime) {
      videoFrameDirty = true;
    }
    if (!videoFrameDirty || !video.videoWidth || !video.videoHeight) return;
    try {
      const maxSize = renderer.capabilities.maxTextureSize;
      const scale = Math.min(1, maxSize / video.videoWidth, maxSize / video.videoHeight);
      const width = Math.max(1, Math.floor(video.videoWidth * scale));
      const height = Math.max(1, Math.floor(video.videoHeight * scale));
      if (videoFrameCanvas.width !== width || videoFrameCanvas.height !== height) {
        videoFrameCanvas.width = width;
        videoFrameCanvas.height = height;
        // Three.js requires reallocation when a texture's dimensions change.
        videoTexture.dispose();
      }
      const copyStart = performance.now();
      videoFrameContext.drawImage(video, 0, 0, width, height);
      recordCost('copy', performance.now() - copyStart);
      fpsVideoFrames += 1;
      videoTexture.needsUpdate = true;
      videoFrameTime = video.currentTime;
      videoFrameDirty = false;
    } catch (error) {
      videoFrameFailed = true;
      if (statusEl) statusEl.textContent = `Échec de la copie de l’image vidéo : ${error.message || error}`;
      console.error('[Jellyfin VR] Canvas video frame failed', error);
    }
  }

  function clearMediaLayer(restore = true) {
    if (mediaLayer && restore && xrSession && renderer) {
      xrSession.updateRenderState({ layers: [renderer.xr.getBaseLayer()] });
    }
    mediaLayer?.destroy?.();
    mediaLayer = null;
    mediaLayerKey = '';
    mediaLayerVideo = null;
    mediaLayerNote = 'Canvas';
    if (videoRoot) videoRoot.visible = true;
    if (world) world.background = new THREE.Color(0x000000);
  }

  function syncMediaLayer() {
    if (!xrSession || !renderer?.xr.isPresenting || !textureVideo) return;
    const key = `${currentMode.projection}/${currentMode.stereo}/${currentMode.swap}`;
    if (mediaLayerKey !== key || mediaLayerVideo !== textureVideo) {
      clearMediaLayer();
      // Cache failed attempts too; do not retry an unsupported API every frame.
      mediaLayerKey = key;
      mediaLayerVideo = textureVideo;
      if (!['180', '360'].includes(currentMode.projection)) {
        mediaLayerNote = 'Canvas (projection actuelle)';
      } else if (typeof window.XRMediaBinding !== 'function' || !renderer.xr.getBinding?.()) {
        mediaLayerNote = 'Canvas (Media Layers indisponible)';
      } else {
        let candidate = null;
        try {
          const binding = new window.XRMediaBinding(xrSession);
          candidate = binding.createEquirectLayer(textureVideo, {
            space: renderer.xr.getReferenceSpace(),
            layout: currentMode.stereo === 'sbs' ? 'stereo-left-right'
                : currentMode.stereo === 'ou' ? 'stereo-top-bottom' : 'mono',
            invertStereo: currentMode.swap,
            centralHorizontalAngle: currentMode.projection === '180' ? Math.PI : 2 * Math.PI,
            upperVerticalAngle: Math.PI / 2,
            lowerVerticalAngle: -Math.PI / 2,
            radius: 0
          });
          // Video behind a transparent Three.js projection layer for controls.
          const controlsLayer = renderer.xr.getBaseLayer();
          controlsLayer.blendTextureSourceAlpha = true;
          xrSession.updateRenderState({ layers: [candidate, controlsLayer] });
          mediaLayer = candidate;
          videoRoot.visible = false;
          world.background = null;
          renderer.setClearColor(0x000000, 0);
          mediaLayerNote = 'Media Layers ✓';
          resetFps();
        } catch (error) {
          candidate?.destroy?.();
          mediaLayerNote = 'Canvas (échec de création Media Layers)';
          console.warn('[Jellyfin VR] Media Layers fallback', error);
        }
      }
      if (statusEl) statusEl.textContent = `Chemin d’affichage VR : ${mediaLayerNote}`;
    }
    if (mediaLayer) {
      const q = videoRoot.quaternion;
      mediaLayer.transform = new XRRigidTransform(
          { x: videoRoot.position.x, y: videoRoot.position.y, z: videoRoot.position.z },
          { x: q.x, y: q.y, z: q.z, w: q.w }
      );
    }
  }

  function configureEyeLayers() {
    if (!renderer?.xr?.isPresenting || !camera) return;
    const xrCamera = renderer.xr.getCamera(camera);
    const eyeCameras = xrCamera?.cameras || [];
    eyeCameras.forEach((eyeCamera, index) => {
      eyeCamera.layers.disableAll();
      eyeCamera.layers.enable(0);
      if (currentMode.stereo !== 'mono') eyeCamera.layers.enable(index === 0 ? 1 : 2);
    });
  }

  function setupControllers() {
    for (let index = 0; index < 2; index += 1) {
      const controller = renderer.xr.getController(index);
      const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0028, 0.0028, 5, 8, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthTest: false, depthWrite: false })
      );
      beam.name = 'jvr-ray';
      beam.rotation.x = -Math.PI / 2;
      beam.position.z = -2.5;
      beam.renderOrder = 9998;
      beam.visible = false;
      controller.add(beam);
      controller.addEventListener('selectstart', () => beginTrigger(controller));
      controller.addEventListener('selectend', () => endTrigger(controller));
      controller.addEventListener('squeezestart', () => {
        panelVisible ? hidePanel() : showPanel();
        const oldTimer = gripTimers.get(controller);
        if (oldTimer) clearTimeout(oldTimer);
        gripTimers.set(controller, setTimeout(() => {
          gripTimers.delete(controller);
          resetAll();
        }, 1200));
      });
      controller.addEventListener('squeezeend', () => {
        const timer = gripTimers.get(controller);
        if (timer) clearTimeout(timer);
        gripTimers.delete(controller);
      });
      world.add(controller);
      controllers.push(controller);
    }
  }

  // Reused across frames: this runs once per controller per frame while the
  // panel is visible, so allocating here would feed the garbage collector.
  let panelRaycaster = null;
  let panelRayRotation = null;

  function raycastPanel(controller) {
    if (!panelVisible || !panelMesh?.visible) return null;
    panelRaycaster = panelRaycaster || new THREE.Raycaster();
    panelRayRotation = panelRayRotation || new THREE.Matrix4();
    panelRayRotation.extractRotation(controller.matrixWorld);
    panelRaycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    panelRaycaster.ray.direction.set(0, 0, -1).applyMatrix4(panelRayRotation);
    return panelRaycaster.intersectObject(panelMesh, false)[0] || null;
  }

  function panelActionFromIntersection(intersection) {
    if (!intersection?.uv) return '';
    const x = intersection.uv.x * panelCanvas.width;
    const y = (1 - intersection.uv.y) * panelCanvas.height;
    return panelButtons.find((button) => x >= button.x && x <= button.x + button.width && y >= button.y && y <= button.y + button.height)?.action || '';
  }

  function isTimelineArea(intersection) {
    const point = panelPoint(intersection);
    return Boolean(point
        && point.x >= TIMELINE.x - 35
        && point.x <= TIMELINE.x + TIMELINE.width + 35
        && point.y >= TIMELINE.y - 28
        && point.y <= TIMELINE.y + TIMELINE.height);
  }

  function timelineTimeFromIntersection(intersection) {
    const point = panelPoint(intersection);
    if (!point || !getDuration()) return getCurrentTime();
    const ratio = THREE.MathUtils.clamp((point.x - TIMELINE.x) / TIMELINE.width, 0, 1);
    return ratio * getDuration();
  }

  function panelPoint(intersection) {
    if (!intersection?.uv) return null;
    return {
      x: intersection.uv.x * panelCanvas.width,
      y: (1 - intersection.uv.y) * panelCanvas.height
    };
  }

  function isPanelDragArea(intersection) {
    const point = panelPoint(intersection);
    if (!point) return false;
    const edge = 62;
    return point.x < edge || point.x > panelCanvas.width - edge
        || point.y < 105 || point.y > panelCanvas.height - edge;
  }

  function controllerDirection(controller) {
    const direction = new THREE.Vector3(0, 0, -1);
    const quaternion = new THREE.Quaternion();
    controller.getWorldQuaternion(quaternion);
    return direction.applyQuaternion(quaternion).normalize();
  }

  function beginTrigger(controller) {
    if (dragState.controller) return;
    const intersection = raycastPanel(controller);
    const action = panelActionFromIntersection(intersection);
    dragState.controller = controller;
    dragState.type = panelVisible && intersection && isTimelineArea(intersection)
        ? 'seek'
        : panelVisible && intersection && isPanelDragArea(intersection) && !action
            ? 'panel'
            : panelVisible ? 'panel-click' : 'view';
    dragState.startTime = performance.now();
    dragState.startDirection = controllerDirection(controller);
    dragState.startYaw = videoRoot?.rotation.y || 0;
    dragState.startPitch = videoRoot?.rotation.x || 0;
    dragState.startPanelPosition = panelMesh?.position.clone() || null;
    dragState.startPanelQuaternion = panelMesh?.quaternion.clone() || null;
    dragState.seekTime = dragState.type === 'seek' ? timelineTimeFromIntersection(intersection) : getCurrentTime();
    dragState.moved = false;
    triggerStates.set(controller, { intersection, action });
  }

  function updateTriggerDrag() {
    const controller = dragState.controller;
    if (!controller) return;
    const elapsed = performance.now() - dragState.startTime;
    if (dragState.type === 'seek') {
      const intersection = raycastPanel(controller);
      if (intersection) {
        const nextTime = timelineTimeFromIntersection(intersection);
        dragState.moved = dragState.moved || Math.abs(nextTime - dragState.seekTime) > Math.max(1, getDuration() * 0.002);
        dragState.seekTime = nextTime;
        drawPanel();
      }
      return;
    }
    if (dragState.type === 'panel') {
      const direction = controllerDirection(controller);
      const distance = dragState.startPanelPosition?.length() || 1.35;
      const targetWorld = new THREE.Vector3().copy(direction).multiplyScalar(distance);
      const cameraWorld = new THREE.Vector3();
      camera.getWorldPosition(cameraWorld);
      targetWorld.add(cameraWorld);
      camera.worldToLocal(targetWorld);
      if (panelMesh && dragState.startPanelPosition) {
        panelMesh.position.lerp(targetWorld, 0.35);
        panelMesh.lookAt(cameraWorld);
        dragState.moved = dragState.moved || panelMesh.position.distanceToSquared(dragState.startPanelPosition) > 0.0004;
      }
      return;
    }
    if (dragState.type !== 'view' || elapsed < 280 || !videoRoot) return;
    const current = controllerDirection(controller);
    const start = dragState.startDirection;
    const startYaw = Math.atan2(start.x, -start.z);
    const currentYaw = Math.atan2(current.x, -current.z);
    const startPitch = Math.asin(THREE.MathUtils.clamp(start.y, -1, 1));
    const currentPitch = Math.asin(THREE.MathUtils.clamp(current.y, -1, 1));
    videoRoot.rotation.y = dragState.startYaw - (currentYaw - startYaw) * 1.35;
    videoRoot.rotation.x = THREE.MathUtils.clamp(dragState.startPitch + (currentPitch - startPitch) * 1.1, -Math.PI / 2, Math.PI / 2);
    dragState.moved = dragState.moved || Math.abs(currentYaw - startYaw) > 0.025 || Math.abs(currentPitch - startPitch) > 0.025;
  }

  function endTrigger(controller) {
    if (dragState.controller !== controller) return;
    const elapsed = performance.now() - dragState.startTime;
    const stored = triggerStates.get(controller) || {};
    if (dragState.type === 'seek') {
      seekAbsolute(dragState.seekTime);
      drawPanel();
    } else if (dragState.type === 'panel-click' && !dragState.moved) {
      const currentIntersection = raycastPanel(controller);
      const currentAction = panelActionFromIntersection(currentIntersection);
      if (stored.action && currentAction === stored.action) runAction(currentAction);
      else if (!stored.action && elapsed < 650) hidePanel();
    } else if (dragState.type === 'panel' && !dragState.moved && elapsed < 650) {
      hidePanel();
    } else if (dragState.type === 'view' && elapsed < 280 && !dragState.moved) {
      showPanel();
    }
    triggerStates.delete(controller);
    dragState.controller = null;
    dragState.type = '';
    dragState.startDirection = null;
    dragState.startPanelPosition = null;
    dragState.startPanelQuaternion = null;
    dragState.seekTime = 0;
    dragState.moved = false;
  }

  function updateControllerHover() {
    if (!panelVisible) {
      if (panelCursor) panelCursor.visible = false;
      return;
    }
    let nextHover = '';
    let cursorIntersection = null;
    for (const controller of controllers) {
      const intersection = raycastPanel(controller);
      const ray = controller.getObjectByName('jvr-ray');
      if (ray) {
        const distance = intersection ? Math.max(0.03, intersection.distance) : 5;
        ray.scale.y = distance / 5;
        ray.position.z = -distance / 2;
      }
      if (intersection && !cursorIntersection) cursorIntersection = intersection;
      nextHover = panelActionFromIntersection(intersection);
      if (nextHover) { cursorIntersection = intersection; break; }
    }
    if (panelCursor) {
      panelCursor.visible = Boolean(cursorIntersection?.uv);
      if (cursorIntersection?.uv) {
        panelCursor.position.x = (cursorIntersection.uv.x - 0.5) * PANEL_WIDTH;
        panelCursor.position.y = (cursorIntersection.uv.y - 0.5) * PANEL_HEIGHT;
      }
    }
    if (nextHover !== hoverAction) {
      hoverAction = nextHover;
      drawPanel();
    }
  }

  function pollGamepads() {
    if (!xrSession) return;
    for (const inputSource of xrSession.inputSources) {
      const gamepad = inputSource.gamepad;
      if (!gamepad) continue;
      const previous = inputStates.get(inputSource) || [];
      const pressed = gamepad.buttons.map((button) => button.pressed);
      if (pressed[4] && !previous[4]) runAction('play');
      if (pressed[5] && !previous[5]) panelVisible ? hidePanel() : showPanel();
      const x = Math.abs(gamepad.axes[2] || 0) > Math.abs(gamepad.axes[0] || 0) ? gamepad.axes[2] : gamepad.axes[0];
      if (Date.now() - lastStickAction > 650) {
        if (x > 0.8) { lastStickAction = Date.now(); runAction('forward'); }
        else if (x < -0.8) { lastStickAction = Date.now(); runAction('back'); }
      }
      inputStates.set(inputSource, pressed);
    }
  }

  function showPanel() {
    panelVisible = true;
    if (panelMesh) panelMesh.visible = true;
    controllers.forEach((controller) => {
      const ray = controller.getObjectByName('jvr-ray');
      if (ray) ray.visible = true;
    });
    drawPanel();
  }

  function hidePanel() {
    panelVisible = false;
    hoverAction = '';
    if (panelMesh) panelMesh.visible = false;
    if (panelCursor) panelCursor.visible = false;
    controllers.forEach((controller) => {
      const ray = controller.getObjectByName('jvr-ray');
      if (ray) { ray.visible = false; ray.scale.y = 1; ray.position.z = -2.5; }
    });
  }

  function resetAll() {
    if (videoRoot) videoRoot.rotation.set(0, 0, 0);
    if (panelMesh) {
      panelMesh.position.set(PANEL_HOME.x, PANEL_HOME.y, PANEL_HOME.z);
      panelMesh.quaternion.identity();
      panelMesh.scale.set(1, 1, 1);
    }
    showPanel();
    if (statusEl) statusEl.textContent = 'Panneau de contrôle et vue vidéo réinitialisés.';
    drawPanel();
  }

  function renderFrame(time) {
    if (!renderer || !world || !camera) return;
    configureEyeLayers();
    pollGamepads();
    updateTriggerDrag();
    updateControllerHover();
    if (panelVisible && time - lastPanelDraw > 250) {
      lastPanelDraw = time;
      drawPanel();
    }
    syncMediaLayer();
    updateVideoFrame();
    updateFps(time);
    // Upload ordinary canvas textures before any scene draw. Both eyes then
    // sample the same completed snapshot; no video upload is interleaved.
    if (videoTexture && !mediaLayer) {
      const needsUpload = videoTexture.version !== videoTexture.userData.diagnosticVersion;
      const uploadStart = performance.now();
      renderer.initTexture(videoTexture);
      if (needsUpload) recordCost('upload', performance.now() - uploadStart);
      videoTexture.userData.diagnosticVersion = videoTexture.version;
    }
    if (panelTexture && panelMesh?.visible) renderer.initTexture(panelTexture);
    if (fpsTexture && statsVisible) renderer.initTexture(fpsTexture);
    const renderStart = performance.now();
    renderer.render(world, camera);
    recordCost('render', performance.now() - renderStart);
  }

  // Repainting the 1600x720 panel canvas is wasted work while it is hidden.
  function refreshPanel() {
    if (panelVisible) drawPanel();
  }

  function bindMediaEvents(video, enabled) {
    if (!video) return;
    const method = enabled ? 'addEventListener' : 'removeEventListener';
    video[method]('timeupdate', refreshPanel);
    video[method]('play', handleMediaReady);
    video[method]('pause', refreshPanel);
    video[method]('loadedmetadata', handleMediaReady);
    video[method]('canplay', handleMediaReady);
    video[method]('error', handleMediaError);
  }

  function handleMediaReady() {
    if (this !== activeVideo) return;
    if (!replaceVideoTexture(activeVideo)) return;
    const label = sourceMode === 'compat' ? 'Source compatible H.264/8 bits' : 'Source d’origine';
    statusEl.textContent = `${label} connectée · ${activeVideo.videoWidth || '?'}×${activeVideo.videoHeight || '?'} · prête pour la VR`;
    drawPanel();
  }

  function handleMediaError() {
    if (this !== activeVideo) return;
    const code = activeVideo.error?.code;
    statusEl.textContent = `Échec de lecture de la source vidéo${code ? ` (MediaError ${code})` : ''}. Consultez les journaux de transcodage de Jellyfin.`;
  }

  async function startCompatAt(position, shouldPlay = true) {
    if (!compatUrl) throw new Error('Impossible de générer une source compatible H264 Jellyfin à partir de cette adresse');
    const serial = ++loadSerial;
    const duration = getDuration();
    const target = Math.max(0, Math.min(Number(position) || 0, duration ? duration - 0.25 : Infinity));
    const url = new URL(compatUrl);
    setQueryParam(url, 'StartTimeTicks', Math.round(target * 10000000));
    const muted = activeVideo?.muted ?? sourceVideo.muted;
    const volume = activeVideo?.volume ?? sourceVideo.volume;
    bindMediaEvents(activeVideo, false);
    activeVideo?.pause?.();
    if (compatVideo) {
      compatVideo.removeAttribute('src');
      compatVideo.load();
      compatVideo.remove();
    }
    compatVideo = document.createElement('video');
    compatVideo.id = 'jvr-compat-video';
    compatVideo.preload = 'auto';
    compatVideo.playsInline = true;
    compatVideo.setAttribute('playsinline', '');
    compatVideo.setAttribute('webkit-playsinline', '');
    compatVideo.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:.01;pointer-events:none;z-index:-1';
    compatVideo.muted = muted;
    compatVideo.volume = volume;
    compatOffset = target;
    sourceMode = 'compat';
    activeVideo = compatVideo;
    bindMediaEvents(activeVideo, true);
    overlay.appendChild(compatVideo);
    replaceVideoTexture(activeVideo);
    updateToolbar();
    statusEl.textContent = `Démarrage du transcodage H.264/8 bits à partir de ${formatTime(target)}…`;
    compatVideo.src = url.href;
    compatVideo.load();
    if (shouldPlay) {
      try {
        await compatVideo.play();
      } catch (_) {
        if (serial === loadSerial) statusEl.textContent = 'Source compatible prête ; appuyez sur LIRE pour démarrer la lecture.';
      }
    }
  }

  async function useOriginalSource() {
    const position = getCurrentTime();
    const shouldPlay = !activeVideo?.paused;
    const muted = activeVideo?.muted ?? false;
    const volume = activeVideo?.volume ?? 1;
    ++loadSerial;
    bindMediaEvents(activeVideo, false);
    activeVideo?.pause?.();
    sourceMode = 'original';
    sourceVideo.currentTime = Math.max(0, Math.min(position, sourceVideo.duration || position));
    sourceVideo.muted = muted;
    sourceVideo.volume = volume;
    activeVideo = sourceVideo;
    bindMediaEvents(activeVideo, true);
    replaceVideoTexture(activeVideo);
    updateToolbar();
    statusEl.textContent = 'Retour à la source d’origine.';
    if (shouldPlay) await sourceVideo.play().catch(() => {});
  }

  function toggleSource() {
    if (!compatUrl) return;
    const position = getCurrentTime();
    const shouldPlay = !activeVideo?.paused;
    if (sourceMode === 'compat') useOriginalSource();
    else startCompatAt(position, shouldPlay).catch((error) => {
      statusEl.textContent = `Échec du démarrage de la source compatible : ${error?.message || error}`;
    });
  }

  function seekAbsolute(position) {
    const target = Math.max(0, Math.min(Number(position) || 0, getDuration() || Infinity));
    if (sourceMode !== 'compat') {
      activeVideo.currentTime = target;
      return;
    }
    const relative = target - compatOffset;
    if (relative >= 0 && Number.isFinite(activeVideo.duration) && relative <= activeVideo.duration) {
      activeVideo.currentTime = relative;
    } else {
      startCompatAt(target, !activeVideo.paused).catch((error) => {
        statusEl.textContent = `Échec du déplacement dans la source compatible : ${error?.message || error}`;
      });
    }
  }

  function cycleProjection() {
    const values = ['360', '180', 'fisheye', 'flat'];
    currentMode.projection = values[(values.indexOf(currentMode.projection) + 1) % values.length];
    rebuildVideoMeshes();
  }

  function cycleStereo() {
    const values = ['mono', 'sbs', 'ou'];
    currentMode.stereo = values[(values.indexOf(currentMode.stereo) + 1) % values.length];
    rebuildVideoMeshes();
  }

  function toggleStats() {
    statsVisible = !statsVisible;
    if (fpsMesh) fpsMesh.visible = statsVisible;
    if (fpsLabel) fpsLabel.style.display = statsVisible ? '' : 'none';
    updateToolbar();
    drawPanel();
  }

  function runAction(action) {
    if (!activeVideo) return;
    if (action === 'play') activeVideo.paused ? activeVideo.play().catch(() => {}) : activeVideo.pause();
    else if (action === 'back') seekAbsolute(getCurrentTime() - 10);
    else if (action === 'forward') seekAbsolute(getCurrentTime() + 10);
    else if (action === 'mute') activeVideo.muted = !activeVideo.muted;
    else if (action === 'projection') cycleProjection();
    else if (action === 'stereo') cycleStereo();
    else if (action === 'swap') { currentMode.swap = !currentMode.swap; rebuildVideoMeshes(); }
    else if (action === 'source') toggleSource();
    else if (action === 'stats') toggleStats();
    else if (action === 'reset') resetAll();
    else if (action === 'hide') hidePanel();
    else if (action === 'exit-vr') exitVrOnly(true);
    drawPanel();
  }

  function updateToolbar() {
    if (!overlay) return;
    overlay.querySelectorAll('[data-action="projection"][data-value]').forEach((button) => {
      button.classList.toggle('active', button.dataset.value === currentMode.projection);
    });
    overlay.querySelectorAll('[data-action="stereo"][data-value]').forEach((button) => {
      button.classList.toggle('active', button.dataset.value === currentMode.stereo);
    });
    overlay.querySelector('#jvr-stats-toggle')?.classList.toggle('active', statsVisible);
    const sourceButton = overlay.querySelector('#jvr-source-toggle');
    if (sourceButton) {
      sourceButton.textContent = sourceMode === 'compat' ? 'Source H264 ✓' : 'Source d’origine';
      sourceButton.classList.toggle('active', sourceMode === 'compat');
      sourceButton.disabled = !compatUrl;
    }
  }

  function enterVr() {
    if (closing || xrEntering) return;
    if (!window.isSecureContext) return alert('WebXR nécessite HTTPS.');
    if (!navigator.xr) return alert('Ce navigateur ne prend pas en charge WebXR.');
    if (!renderer) return alert('Le moteur de rendu WebXR n’est pas encore initialisé.');
    if (xrSession || renderer.xr.isPresenting || renderer.xr.getSession?.()) {
      if (statusEl) statusEl.textContent = 'Une session VR existe déjà : quittez d’abord la VR actuelle.';
      return;
    }
    const targetRenderer = renderer;
    xrEntering = true;
    xrEntryTask = (async () => {
      let session = null;
      try {
        // requestSession must run directly in the Enter VR click's user-activation task.
        const sessionPromise = navigator.xr.requestSession('immersive-vr', {
          optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers']
        });
        activeVideo?.play?.().catch(() => {});
        session = await sessionPromise;
        xrSession = session;
        session.addEventListener('end', () => {
          if (xrSession !== session) return;
          clearMediaLayer(false);
          xrSession = null;
          clearTimeout(xrPanelTimer);
          xrPanelTimer = null;
          hidePanel();
          if (!closing && statusEl) statusEl.textContent = 'VR quittée : vous pouvez y retourner ou revenir à Jellyfin.';
        }, { once: true });
        // closePlayer waits for this task before disposing the renderer.
        if (closing || renderer !== targetRenderer) {
          await session.end();
          return;
        }
        await targetRenderer.xr.setSession(session);
        if (closing || xrSession !== session) return;
        syncMediaLayer();
        statusEl.textContent = `En VR · ${mediaLayerNote}. Appuyez sur la gâchette pour ouvrir le panneau de contrôle.`;
        xrPanelTimer = setTimeout(() => {
          xrPanelTimer = null;
          if (!closing && xrSession === session) showPanel();
        }, 350);
      } catch (error) {
        // setSession can fail after requestSession has already acquired the
        // immersive session. Release it before permitting another attempt.
        if (session) {
          try { await session.end(); }
          catch (endError) { console.error('[Jellyfin VR] Session cleanup failed', endError); }
        }
        if (!closing) alert(`Échec de l’entrée en VR : ${error?.message || error}`);
      } finally {
        xrEntering = false;
      }
    })();
    return xrEntryTask;
  }

  async function exitVrOnly(closeAfter = false) {
    try {
      const session = xrSession || renderer?.xr?.getSession?.();
      if (session) await session.end();
    } catch (_) {}
    if (closeAfter) await closePlayer();
  }

  function handleToolbar(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, value } = button.dataset;
    if (action === 'exit') closePlayer();
    else if (action === 'enter') enterVr();
    else if (action === 'projection') { currentMode.projection = value; rebuildVideoMeshes(); }
    else if (action === 'stereo') { currentMode.stereo = value; rebuildVideoMeshes(); }
    else if (action === 'swap') { currentMode.swap = !currentMode.swap; rebuildVideoMeshes(); }
    else if (action === 'source') toggleSource();
    else if (action === 'stats') toggleStats();
  }

  async function openPlayer() {
    if (overlay || opening || closing) return;
    sourceVideo = findVideo();
    if (!sourceVideo) return alert('Lancez d’abord la lecture d’une vidéo dans Jellyfin.');
    opening = true;
    savedVideoId = sourceVideo.id;
    try {
      activeVideo = sourceVideo;
      compatUrl = buildCompatStreamUrl(sourceVideo);
      originalState = {
        currentTime: sourceVideo.currentTime || 0,
        duration: sourceVideo.duration || 0,
        paused: sourceVideo.paused,
        muted: sourceVideo.muted,
        volume: sourceVideo.volume
      };
      await prepareOriginalCors(sourceVideo);
      await ensureThree();
      buildOverlay();
      savedVideoId = sourceVideo.id;
      if (!sourceVideo.id) sourceVideo.id = 'jvr-source-video';
      buildRenderer();
      bindMediaEvents(sourceVideo, true);
      updateToolbar();
      statusEl.textContent = `${VERSION} · Connexion à la source d’origine…`;
      handleMediaReady.call(sourceVideo);
      sourceVideo.play().catch(() => {});
    } catch (error) {
      closePlayer();
      alert(`Échec de l’initialisation du lecteur VR : ${error?.message || error}`);
    } finally {
      opening = false;
    }
  }

  async function closePlayer() {
    if (closing) return;
    closing = true;
    const finalTime = getCurrentTime();
    const finalMuted = activeVideo?.muted;
    const finalVolume = activeVideo?.volume;
    clearTimeout(xrPanelTimer);
    xrPanelTimer = null;
    // A pending request or setSession must settle before session teardown and
    // renderer disposal. Otherwise the late result leaves an orphan session.
    if (xrEntryTask) await xrEntryTask;
    const session = xrSession || renderer?.xr?.getSession?.();
    if (session) {
      try { await session.end(); }
      catch (error) { console.error('[Jellyfin VR] Session end failed', error); }
    }
    clearMediaLayer(false);
    xrSession = null;
    ++loadSerial;
    bindMediaEvents(activeVideo, false);
    if (compatVideo) {
      compatVideo.pause();
      compatVideo.removeAttribute('src');
      compatVideo.load();
      compatVideo.remove();
      compatVideo = null;
    }
    if (sourceVideo) {
      bindMediaEvents(sourceVideo, false);
      if (Number.isFinite(finalTime)) sourceVideo.currentTime = Math.min(finalTime, sourceVideo.duration || finalTime);
      if (typeof finalMuted === 'boolean') sourceVideo.muted = finalMuted;
      if (Number.isFinite(finalVolume)) sourceVideo.volume = finalVolume;
      sourceVideo.id = savedVideoId;
      sourceVideo.play().catch(() => {});
    }
    renderer?.setAnimationLoop?.(null);
    stopVideoFrameUpdates();
    disposeVideoMeshes();
    videoTexture?.dispose?.();
    panelMesh?.geometry?.dispose?.();
    panelMesh?.material?.dispose?.();
    panelBorder?.geometry?.dispose?.();
    panelBorder?.material?.dispose?.();
    panelCursor?.traverse?.((object) => {
      if (object !== panelCursor) object.geometry?.dispose?.();
      if (object !== panelCursor) object.material?.dispose?.();
    });
    panelCursor?.geometry?.dispose?.();
    panelCursor?.material?.dispose?.();
    panelTexture?.dispose?.();
    fpsMesh?.geometry?.dispose?.();
    fpsMesh?.material?.dispose?.();
    fpsTexture?.dispose?.();
    controllers.forEach((controller) => {
      const gripTimer = gripTimers.get(controller);
      if (gripTimer) clearTimeout(gripTimer);
      gripTimers.delete(controller);
      controller.children.forEach((child) => {
        child.geometry?.dispose?.();
        child.material?.dispose?.();
      });
    });
    if (resizeHandler) renderer?.xr?.removeEventListener('sessionend', resizeHandler);
    renderer?.xr?.removeEventListener('sessionstart', resetFps);
    renderer?.xr?.removeEventListener('sessionend', resetFps);
    renderer?.dispose?.();
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);
    overlay?.remove();
    overlay = null;
    statusEl = null;
    sourceVideo = null;
    activeVideo = null;
    originalState = null;
    compatUrl = '';
    compatOffset = 0;
    sourceMode = 'original';
    savedVideoId = '';
    world = null;
    camera = null;
    renderer = null;
    videoTexture = null;
    videoFrameCanvas = null;
    videoFrameContext = null;
    videoFrameDirty = false;
    videoFrameTime = -1;
    videoFrameFailed = false;
    fpsMesh = null;
    fpsCanvas = null;
    fpsContext = null;
    fpsTexture = null;
    fpsLabel = null;
    resetFps();
    videoMeshes = [];
    videoRoot = null;
    controllers = [];
    panelMesh = null;
    panelCanvas = null;
    panelContext = null;
    panelTexture = null;
    panelBorder = null;
    panelCursor = null;
    panelButtons = [];
    panelVisible = false;
    hoverAction = '';
    resizeHandler = null;
    xrEntryTask = null;
    dragState.controller = null;
    dragState.type = '';
    dragState.startDirection = null;
    dragState.startPanelPosition = null;
    dragState.startPanelQuaternion = null;
    dragState.seekTime = 0;
    dragState.moved = false;
    closing = false;
  }

  function isVisibleControl(element) {
    if (!element?.isConnected || element.closest('[hidden], [aria-hidden="true"]')) return false;
    if (!element.getClientRects().length) return false;
    for (let current = element; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    }
    return true;
  }

  function locateControls() {
    const fullscreen = Array.from(document.querySelectorAll('.btnFullscreen,[aria-label="Fullscreen"],[aria-label="Plein écran"],[title="Fullscreen"],[title="Plein écran"],.button-fullscreen')).find(isVisibleControl);
    if (fullscreen?.parentElement) return { parent: fullscreen.parentElement, before: fullscreen };
    const bar = Array.from(document.querySelectorAll('.videoOsdBottom .buttons,.videoOsdBottom,.osdControls,.videoControls,[class*="videoOsdBottom"]')).find(isVisibleControl);
    return bar ? { parent: bar, before: null } : null;
  }

  function addVrButton() {
    if (!findVideo()) return;
    const target = locateControls();
    let button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = document.createElement('button');
      button.id = BUTTON_ID;
      button.type = 'button';
      button.textContent = 'VR';
      button.title = `Jellyfin VR Player ${VERSION}`;
      button.setAttribute('aria-label', 'VR Player');
      button.onclick = openPlayer;
    }
    const mode = target ? 'toolbar' : 'floating';
    if (button.dataset.placement !== mode) {
      button.dataset.placement = mode;
      if (target) {
        button.className = 'autoSize paper-icon-button-light';
        button.style.cssText = 'min-width:42px;height:42px;border:0;background:transparent;color:inherit;font-weight:800;font-size:13px;cursor:pointer';
      } else {
        button.className = '';
        button.style.cssText = 'position:fixed;right:18px;bottom:90px;z-index:2147483000;width:50px;height:50px;border:1px solid #ffffff55;border-radius:50%;background:#006d91e8;color:#fff;font-weight:800;cursor:pointer';
      }
    }
    const fullscreenRoot = document.fullscreenElement;
    const parent = target?.parent || (fullscreenRoot && !fullscreenRoot.matches('video,canvas,iframe') ? fullscreenRoot : document.body);
    // Avoid repeated writes: our own DOM mutations also trigger scan().
    if (button.parentElement !== parent || (target?.before && button.nextSibling !== target.before)) {
      parent.insertBefore(button, target?.before || null);
    }
  }

  function scan() {
    const button = document.getElementById(BUTTON_ID);
    if (findVideo()) addVrButton();
    else button?.remove();
  }

  // scan() queries the DOM and calls getComputedStyle(). Jellyfin Web mutates
  // the DOM constantly (progress bar, OSD), so coalesce bursts into one scan.
  let scanQueued = false;
  function scheduleScan() {
    if (scanQueued) return;
    scanQueued = true;
    setTimeout(() => { scanQueued = false; scan(); }, 150);
  }

  function init() {
    scan();
    new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
    scanTimer = setInterval(scan, 1000);
    document.addEventListener('fullscreenchange', scheduleScan);
    ['loadedmetadata', 'emptied', 'play'].forEach((event) => document.addEventListener(event, scheduleScan, true));
    window.addEventListener('beforeunload', () => clearInterval(scanTimer), { once: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

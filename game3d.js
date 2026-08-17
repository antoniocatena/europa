(function(){
"use strict";

/* ============================================================
   EUROPA 2025 — 3D (Three.js)
   EXP-07 repara su nave con 10 piezas, viaja a Júpiter,
   combate a un alienígena y gana un cañón de plasma para el brazo.
   ============================================================ */

const canvasStage = document.getElementById('stage');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const storyText = document.getElementById('storyText');
const hud = document.getElementById('hud');
const msgBox = document.getElementById('msgBox');
const partsCountEl = document.getElementById('partsCount');
const energyBarInner = document.getElementById('energyBarInner');
const mmCanvas = document.getElementById('minimap');
const mmCtx = mmCanvas.getContext('2d');
const alienHud = document.getElementById('alienHud');
const alienBarInner = document.getElementById('alienBarInner');
const alienLabelEl = document.getElementById('alienLabel');
const fadeOverlay = document.getElementById('fadeOverlay');
const crosshair = document.getElementById('crosshair');

const VIEW_W = 960, VIEW_H = 600;
const WORLD_W = 240, WORLD_D = 150; // Europa (x east-west, z north-south)
const JWORLD_W = 90, JWORLD_D = 90; // Jupiter arena
const UWORLD_W = 100, UWORLD_D = 100; // Uranus arena — bigger, tougher final leg
const SWORLD_W = 110, SWORLD_D = 110; // Saturn arena — final leg, room for the whole swarm
const TOTAL_PARTS = 10;

// ---------- seeded RNG ----------
function mulberry32(seed){
  return function(){
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20250815);

// ---------- audio ----------
let audioCtx = null;
function ensureAudio(){
  if(!audioCtx){
    try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){}
  }
}
function beep(freq, dur, type, vol, delay){
  if(!audioCtx) return;
  const t0 = audioCtx.currentTime + (delay||0);
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type||'sine';
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol||0.15, t0+0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t0+dur);
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.start(t0); osc.stop(t0+dur+0.05);
}
function sfxPickup(){ beep(880,0.18,'triangle',0.18); beep(1320,0.18,'triangle',0.12,0.06); }
function sfxHazard(){ beep(140,0.3,'sawtooth',0.2); }
function sfxWin(){ [523,659,784,1046].forEach((f,i)=>beep(f,0.35,'triangle',0.16,i*0.14)); }
function sfxRepair(){ [330,440,554,660].forEach((f,i)=>beep(f,0.25,'square',0.1,i*0.09)); }
function sfxLaunch(){ beep(90,1.1,'sawtooth',0.16); beep(180,0.9,'sawtooth',0.1,0.15); }
function sfxShoot(){ beep(920,0.08,'square',0.12); }
function sfxAlienShoot(){ beep(260,0.22,'sawtooth',0.16); }
function sfxAlienCharge(){ beep(180,0.5,'sine',0.1); }
function sfxAlienHit(){ beep(600,0.1,'triangle',0.14); }
function sfxAlienDeath(){ [400,300,220,140].forEach((f,i)=>beep(f,0.3,'sawtooth',0.16,i*0.12)); }
function sfxEquip(){ beep(500,0.15,'square',0.14); beep(760,0.25,'square',0.16,0.1); }

// ---------- messages ----------
let msgTimer = 0;
function showMessage(text, dur){
  msgBox.textContent = text;
  msgBox.classList.add('show');
  msgTimer = dur || 3.2;
}

// ============================================================
// THREE.JS SETUP
// ============================================================
const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
renderer.setSize(VIEW_W, VIEW_H);
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
canvasStage.insertBefore(renderer.domElement, canvasStage.firstChild);
renderer.domElement.id = 'glcanvas';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030711);
scene.fog = new THREE.FogExp2(0x0a1626, 0.0055);

const camera = new THREE.PerspectiveCamera(58, VIEW_W/VIEW_H, 0.1, 6000); // far plane pushed out so the true-scale solar system backdrop doesn't clip

// ---------- lights ----------
const ambient = new THREE.HemisphereLight(0xbfe0ff, 0x1a2a33, 0.75);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xdfeeff, 0.9);
sun.position.set(-80, 120, -40);
sun.castShadow = true;
sun.shadow.camera.left = -140; sun.shadow.camera.right = 140;
sun.shadow.camera.top = 140; sun.shadow.camera.bottom = -140;
sun.shadow.camera.far = 400;
sun.shadow.mapSize.set(1024,1024);
scene.add(sun);

function setLightingMode(mode){
  if(mode === 'jupiter'){
    ambient.color.set(0xffb98a);
    ambient.groundColor.set(0x2a1030);
    ambient.intensity = 0.65;
    sun.color.set(0xffcf9e);
    sun.intensity = 0.55;
    scene.fog.color.set(0x1a0f22);
    scene.background.set(0x0a040c);
  } else if(mode === 'uranus'){
    ambient.color.set(0xbfe9f2);
    ambient.groundColor.set(0x0f2a33);
    ambient.intensity = 0.7;
    sun.color.set(0xdff6ff);
    sun.intensity = 0.7;
    scene.fog.color.set(0x081a22);
    scene.background.set(0x030c12);
  } else if(mode === 'saturn'){
    ambient.color.set(0xf2dfa8);
    ambient.groundColor.set(0x332a12);
    ambient.intensity = 0.72;
    sun.color.set(0xffe9b8);
    sun.intensity = 0.75;
    scene.fog.color.set(0x1c1608);
    scene.background.set(0x0c0906);
  } else {
    ambient.color.set(0xbfe0ff);
    ambient.groundColor.set(0x1a2a33);
    ambient.intensity = 0.75;
    sun.color.set(0xdfeeff);
    sun.intensity = 0.9;
    scene.fog.color.set(0x0a1626);
    scene.background.set(0x030711);
  }
}

// ---------- starfield ----------
function buildStars(){
  const geo = new THREE.BufferGeometry();
  const N = 1800;
  const pos = new Float32Array(N*3);
  for(let i=0;i<N;i++){
    const r = 700 + rng()*500;
    const theta = rng()*Math.PI*2;
    const phi = Math.acos(rng()*1.6-0.8);
    pos[i*3] = r*Math.sin(phi)*Math.cos(theta);
    pos[i*3+1] = Math.abs(r*Math.cos(phi))*0.6 + 40;
    pos[i*3+2] = r*Math.sin(phi)*Math.sin(theta);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  const mat = new THREE.PointsMaterial({ color:0xffffff, size:1.6, sizeAttenuation:false, transparent:true, opacity:0.85 });
  return new THREE.Points(geo, mat);
}
scene.add(buildStars());

// ============================================================
// SOLAR SYSTEM — every body is built at a real, consistent scale:
// 1 game unit = 1000 km (i.e. radius_units = real_radius_km / 1000).
// So Jupiter, Europa (the moon) and Uranus are always TRUE spheres at
// that fixed scale — "looming" close-ups move the camera-relative
// distance closer, they never inflate the sphere's actual radius.
// ============================================================
const KM_SCALE = 1/1000;
function realRadius(km){ return km * KM_SCALE; }

function buildBandTexture(bands, waveFreq){
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  for(let y=0;y<256;y++){
    ctx.fillStyle = bands[Math.floor((y/256)*bands.length + Math.sin(y*(waveFreq||0.2))*0.4 + bands.length) % bands.length];
    ctx.fillRect(0,y,256,2);
  }
  return new THREE.CanvasTexture(c);
}
function buildRing(innerR, outerR, color, opacity, tiltZ){
  const geo = new THREE.RingGeometry(innerR, outerR, 48);
  const mat = new THREE.MeshBasicMaterial({ color, transparent:true, opacity, side:THREE.DoubleSide, fog:false });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = Math.PI/2;
  const holder = new THREE.Group();
  holder.add(ring);
  holder.rotation.z = tiltZ || 0;
  return holder;
}

// ---------- Jupiter (true scale: radius 69,911 km / 1000) ----------
const JUPITER_RADIUS = realRadius(69911);
function buildJupiter(){
  const bands = ['#caa06a','#b8875a','#e8c9a0','#a97748','#d9b98a','#8a5a38','#efd9b0'];
  const tex = buildBandTexture(bands, 0.2);
  const geo = new THREE.SphereGeometry(JUPITER_RADIUS, 32, 32);
  const mat = new THREE.MeshBasicMaterial({ map: tex, fog:false });
  return new THREE.Mesh(geo, mat);
}
const jupiterPlanet = buildJupiter();
scene.add(jupiterPlanet);
function setJupiterDistant(){
  jupiterPlanet.position.set(121, 314, -574);
}
function setJupiterLooming(){
  jupiterPlanet.position.set(JWORLD_W/2 + 25, 95, JWORLD_D/2 - 130);
}

// ---------- Uranus (true scale: radius 25,362 km / 1000) ----------
const URANUS_RADIUS = realRadius(25362);
function buildUranusPlanet(){
  const bands = ['#bfe9f2','#a8d9e8','#d6f3fa','#93c8db','#c3e8f0','#8fc0d4'];
  const tex = buildBandTexture(bands, 0.15);
  const geo = new THREE.SphereGeometry(URANUS_RADIUS, 32, 32);
  const mat = new THREE.MeshBasicMaterial({ map: tex, fog:false });
  const group = new THREE.Group();
  const planetMesh = new THREE.Mesh(geo, mat);
  planetMesh.rotation.z = 1.4; // Uranus' extreme axial tilt — its rings read almost vertical
  group.add(planetMesh);
  const ring = buildRing(URANUS_RADIUS*1.21, URANUS_RADIUS*1.58, 0xbfe9f2, 0.26);
  planetMesh.add(ring);
  return group;
}
const uranusPlanet = buildUranusPlanet();
scene.add(uranusPlanet);
function setUranusDistant(){
  uranusPlanet.position.set(-58, 107, -218);
}
function setUranusLooming(){
  uranusPlanet.position.set(UWORLD_W/2 + 15, 55, UWORLD_D/2 - 75);
}
// set both distant planet props to their default "far away" spot right away —
// otherwise they sit at their THREE.Group default (0,0,0), right on top of
// the player during the very first Europa playthrough (resetGame(), which
// also does this, only runs on replay after a win/loss, not on first start).
setJupiterDistant();
setUranusDistant();

// ---------- Europa, the moon EXP-07 is exploring (radius 1,560 km / 1000) ----------
function buildEuropaMoon(){
  const geo = new THREE.SphereGeometry(realRadius(1560), 20, 20);
  const mat = new THREE.MeshBasicMaterial({ color:0xcfe8ee, fog:false });
  return new THREE.Mesh(geo, mat);
}
const europaMoonProp = buildEuropaMoon();
europaMoonProp.position.set(140, 200, -320);
scene.add(europaMoonProp);

// ---------- the rest of the solar system, always visible in the background ----------
const sunGroup = new THREE.Group();
const sunCore = new THREE.Mesh(new THREE.SphereGeometry(realRadius(696000), 24, 24), new THREE.MeshBasicMaterial({ color:0xffd54a, fog:false }));
sunGroup.add(sunCore);
const sunHalo = new THREE.Mesh(new THREE.SphereGeometry(realRadius(696000)*1.3, 24, 24), new THREE.MeshBasicMaterial({ color:0xffb347, transparent:true, opacity:0.4, fog:false }));
sunGroup.add(sunHalo);
sunGroup.position.set(-900, 700, -2600);
scene.add(sunGroup);

const mercuryProp = new THREE.Mesh(new THREE.SphereGeometry(realRadius(2440), 14, 14), new THREE.MeshBasicMaterial({ color:0x9c9186, fog:false }));
mercuryProp.position.set(-700, 300, -1900);
scene.add(mercuryProp);

const venusProp = new THREE.Mesh(new THREE.SphereGeometry(realRadius(6052), 16, 16), new THREE.MeshBasicMaterial({ color:0xe8d2a0, fog:false }));
venusProp.position.set(-500, 320, -1750);
scene.add(venusProp);

function buildEarth(){
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a5ea8';
  ctx.fillRect(0,0,256,256);
  ctx.fillStyle = '#3f8f4f';
  for(let i=0;i<14;i++){
    const x=rng()*256, y=rng()*256, w=18+rng()*40, h=14+rng()*28;
    ctx.beginPath();
    ctx.ellipse(x,y,w,h,rng()*Math.PI,0,Math.PI*2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  const geo = new THREE.SphereGeometry(realRadius(6371), 18, 18);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map:tex, fog:false }));
}
const earthProp = buildEarth();
earthProp.position.set(-300, 340, -1650);
scene.add(earthProp);

const marsProp = new THREE.Mesh(new THREE.SphereGeometry(realRadius(3390), 14, 14), new THREE.MeshBasicMaterial({ color:0xb1502f, fog:false }));
marsProp.position.set(-100, 300, -1550);
scene.add(marsProp);

function buildSaturn(){
  const bands = ['#e8d3a0','#d9c48a','#f0e0b8','#cbb87c'];
  const tex = buildBandTexture(bands, 0.18);
  const r = realRadius(58232);
  const geo = new THREE.SphereGeometry(r, 26, 26);
  const group = new THREE.Group();
  const planetMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map:tex, fog:false }));
  planetMesh.rotation.z = 0.47; // Saturn's real ~27° axial tilt
  group.add(planetMesh);
  const ring = buildRing(r*1.2, r*2.3, 0xe8d8ad, 0.55);
  planetMesh.add(ring);
  return group;
}
const saturnProp = buildSaturn();
scene.add(saturnProp);
// saturnProp does double duty, just like jupiterPlanet/uranusPlanet above:
// a small distant dot from the other worlds, and a big "looming" presence
// during Saturn's own arrival cutscene.
function setSaturnDistant(){
  saturnProp.position.set(500, 420, -2000);
}
function setSaturnLooming(){
  saturnProp.position.set(SWORLD_W/2 + 20, 90, SWORLD_D/2 - 120);
}
setSaturnDistant();

const neptuneProp = new THREE.Mesh(new THREE.SphereGeometry(realRadius(24622), 18, 18), new THREE.MeshBasicMaterial({ color:0x3b5fcf, fog:false }));
neptuneProp.position.set(800, 450, -2300);
scene.add(neptuneProp);

// ---------- asteroid belt — a wide scattered band of rocky debris, always
// visible in the background between Mars and Jupiter ----------
function buildAsteroidBelt(){
  const count = 320;
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({ color:0x8f8779, roughness:0.95, metalness:0.05, fog:false });
  const belt = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  const beltRadius = 130, beltThickness = 55, beltHeight = 22;
  for(let i=0;i<count;i++){
    const ang = rng()*Math.PI*2;
    const r = beltRadius + (rng()-0.5)*beltThickness;
    const y = (rng()-0.5)*beltHeight;
    dummy.position.set(Math.cos(ang)*r, y, Math.sin(ang)*r);
    const s = 1.4 + rng()*3.6;
    dummy.scale.set(s, s*(0.55+rng()*0.6), s);
    dummy.rotation.set(rng()*Math.PI, rng()*Math.PI, rng()*Math.PI);
    dummy.updateMatrix();
    belt.setMatrixAt(i, dummy.matrix);
  }
  belt.instanceMatrix.needsUpdate = true;
  return belt;
}
const asteroidBelt = buildAsteroidBelt();
asteroidBelt.position.set(-90, 305, -1050); // roughly between Mars and Jupiter's backdrop spots
scene.add(asteroidBelt);

// ============================================================
// WORLD GROUPS
// ============================================================
const europaGroup = new THREE.Group();
const jupiterGroup = new THREE.Group();
const uranusGroup = new THREE.Group();
const saturnGroup = new THREE.Group();
scene.add(europaGroup, jupiterGroup, uranusGroup, saturnGroup);
jupiterGroup.visible = false;
uranusGroup.visible = false;
saturnGroup.visible = false;
let missionStage = 'europa'; // 'europa' | 'jupiter' | 'uranus' | 'saturn' — drives which decor/rock list & arena is active

// ============================================================
// CURVED WORLDS — every arena you actually walk on (Europa, Júpiter's
// cloud-deck, Urano) is a true round little planet, not a flat plane.
// All movement/collision/hazard math stays in a flat (x,z) "map" space
// exactly as before (so none of that tuned logic has to change) — the
// map is then wrapped onto a sphere purely for rendering: sphereFrame()
// turns a flat (x,z) map coordinate into an absolute world position plus
// a consistent local orientation (up/right/forward), and every mesh that
// used to sit at (x, height, z) now sits at that wrapped position,
// oriented so "up" is the true outward direction from the little
// planet's center instead of always straight world-Y.
// ============================================================
// Radii are big relative to the map so gameplay near the player stays
// comfortable (a tight radius made the horizon so steep the camera ended
// up tilted ~30° and the ground looked like a warped dome up close) —
// they're still small enough that the curve is clearly visible from a
// wide/elevated view (see the alien-reveal "looming" shots).
const PLANET_RADIUS_EUROPA = 900;
const PLANET_RADIUS_JUPITER = 340;
const PLANET_RADIUS_URANUS = 380;
const PLANET_RADIUS_SATURN = 400;
const AXIS_X = new THREE.Vector3(1,0,0), AXIS_Z_UP = new THREE.Vector3(0,0,1);
function sphereFrame(x, z, w, d, radius){
  const cx = x - w/2, cz = z - d/2;
  const angX = cz / radius;
  const angZ = -cx / radius;
  const qx = new THREE.Quaternion().setFromAxisAngle(AXIS_X, angX);
  const qz = new THREE.Quaternion().setFromAxisAngle(AXIS_Z_UP, angZ);
  const quat = qz.multiply(qx);
  const local = new THREE.Vector3(0, radius, 0).applyQuaternion(quat);
  const up = local.clone().normalize();
  const center = new THREE.Vector3(w/2, -radius, d/2);
  const pos = center.clone().add(local);
  return { pos, up, quat };
}
// orient + position any Object3D on the current curved world: frame is a
// sphereFrame() result, height is how far above the local surface, yaw is
// the existing flat-world facing angle (rotation around the local "up").
function placeOnSphere(obj, frame, height, yaw){
  obj.position.copy(frame.pos).addScaledVector(frame.up, height || 0);
  obj.quaternion.copy(frame.quat);
  if(yaw) obj.rotateY(yaw);
}

let worldBounds = { w: WORLD_W, d: WORLD_D, radius: PLANET_RADIUS_EUROPA };
function clampToWorld(x,z){
  return [Math.max(2, Math.min(worldBounds.w-2, x)), Math.max(2, Math.min(worldBounds.d-2, z))];
}
function currentFrame(x,z){
  return sphereFrame(x, z, worldBounds.w, worldBounds.d, worldBounds.radius);
}
// builds a curved ground cap whose vertices are wrapped with sphereFrame(),
// so it exactly matches the surface every other object gets placed on.
// heightFn(x,z) is an optional small bump offset applied along the local
// "up" normal (replaces the old flat per-vertex Z-noise on the flat plane).
function buildCurvedGround(w, d, radius, segW, segD, heightFn, marginX, marginZ){
  // marginX/marginZ let the visible ground disc extend past the actual
  // playable/clamped bounds (0..w, 0..d), using the SAME sphereFrame(x,z,w,d,radius)
  // formula (same w/d "center"), so the extra rim seamlessly continues the
  // sphere cap. Without this, the edge of the playable rectangle — now a
  // curved rim instead of a flat straight line — can be visible from near
  // the corners, reading as a warped "dome" against the black sky.
  marginX = marginX || 0; marginZ = marginZ || 0;
  const nx = segW+1, nz = segD+1;
  const positions = new Float32Array(nx*nz*3);
  const normals = new Float32Array(nx*nz*3);
  const uvs = new Float32Array(nx*nz*2);
  let p = 0, u = 0;
  for(let j=0;j<nz;j++){
    for(let i=0;i<nx;i++){
      const x = -marginX + (i/segW)*(w+2*marginX), z = -marginZ + (j/segD)*(d+2*marginZ);
      const h = heightFn ? heightFn(x,z) : 0;
      const frame = sphereFrame(x, z, w, d, radius);
      const wp = frame.pos.clone().addScaledVector(frame.up, h);
      positions[p]=wp.x; positions[p+1]=wp.y; positions[p+2]=wp.z;
      normals[p]=frame.up.x; normals[p+1]=frame.up.y; normals[p+2]=frame.up.z;
      p += 3;
      uvs[u]=i/segW; uvs[u+1]=j/segD; u += 2;
    }
  }
  const indices = [];
  for(let j=0;j<segD;j++){
    for(let i=0;i<segW;i++){
      const a=j*nx+i, b=a+1, c=a+nx, e=c+1;
      indices.push(a,c,b, b,c,e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals,3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs,2));
  return geo;
}

// ============================================================
// EUROPA GROUND / TERRAIN
// ============================================================
function buildIceTexture(){
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const tctx = c.getContext('2d');
  const grad = tctx.createLinearGradient(0,0,size,size);
  grad.addColorStop(0,'#e6f5ff');
  grad.addColorStop(0.5,'#c3e2f2');
  grad.addColorStop(1,'#9fc9de');
  tctx.fillStyle = grad;
  tctx.fillRect(0,0,size,size);
  for(let i=0;i<220;i++){
    const x = rng()*size, y = rng()*size, r = 8+rng()*30;
    tctx.beginPath();
    tctx.fillStyle = rng()>0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(70,110,140,0.10)';
    tctx.ellipse(x,y,r,r*0.6,rng()*Math.PI,0,Math.PI*2);
    tctx.fill();
  }
  tctx.strokeStyle = 'rgba(60,95,120,0.30)';
  tctx.lineWidth = 1.4;
  for(let i=0;i<40;i++){
    let x=rng()*size,y=rng()*size;
    tctx.beginPath(); tctx.moveTo(x,y);
    let ang = rng()*Math.PI*2;
    for(let s=0;s<4;s++){
      ang += (rng()-0.5)*1.2;
      x += Math.cos(ang)*(10+rng()*20);
      y += Math.sin(ang)*(10+rng()*20);
      tctx.lineTo(x,y);
    }
    tctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14,9);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

// small bumps only — kept subtle on purpose: the player's feet are locked
// to a perfectly flat height (GROUND_Y=0) by the untouched flat-physics
// movement code, so any visual bump taller than that reads as feet sinking
// into (or floating above) the ice.
const groundGeo = buildCurvedGround(WORLD_W, WORLD_D, PLANET_RADIUS_EUROPA, 100, 70,
  (x,z)=> (Math.sin(x*0.15)+Math.cos(z*0.18))*0.035 + (rng()-0.5)*0.04, 160, 110);
const groundMat = new THREE.MeshStandardMaterial({ map: buildIceTexture(), roughness:0.65, metalness:0.05, side: THREE.DoubleSide });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.receiveShadow = true;
europaGroup.add(ground);

// ---------- decorative rocks (Europa) ----------
const rockGroup = new THREE.Group();
europaGroup.add(rockGroup);
const decorRocks = [];
const rockGeo = new THREE.ConeGeometry(1,1,6);
for(let i=0;i<55;i++){
  const x = 6 + rng()*(WORLD_W-12);
  const z = 6 + rng()*(WORLD_D-12);
  const r = 0.8 + rng()*1.6;
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.55, 0.15, 0.55+rng()*0.25), roughness:0.8 });
  const mesh = new THREE.Mesh(rockGeo, mat);
  mesh.scale.set(r, r*1.4, r);
  placeOnSphere(mesh, sphereFrame(x,z,WORLD_W,WORLD_D,PLANET_RADIUS_EUROPA), r*0.7, rng()*Math.PI);
  mesh.castShadow = true; mesh.receiveShadow = true;
  rockGroup.add(mesh);
  decorRocks.push({x,z,r:r*0.9});
}

// ---------- hazards (ice crevices) ----------
const hazardDefs = [
  [70,30,18,4,0.3],[115,52,22,3.6,-0.2],[160,26,16,4.2,0.6],
  [50,90,20,3.8,-0.5],[190,76,24,4,0.15],[130,115,19,3.6,0.4],
  [90,130,21,4,-0.3],[205,100,17,3.8,0.5]
];
const hazards = hazardDefs.map(([cx,cz,w,d,rot])=>({cx,cz,w,d,rot}));
const hazardGroup = new THREE.Group();
europaGroup.add(hazardGroup);
hazards.forEach(hz=>{
  const geo = new THREE.BoxGeometry(hz.w, 0.6, hz.d);
  const mat = new THREE.MeshStandardMaterial({ color:0x0d1f2b, roughness:0.9, emissive:0x081018, emissiveIntensity:0.4 });
  const mesh = new THREE.Mesh(geo, mat);
  placeOnSphere(mesh, sphereFrame(hz.cx,hz.cz,WORLD_W,WORLD_D,PLANET_RADIUS_EUROPA), -0.15, hz.rot);
  mesh.receiveShadow = true;
  hazardGroup.add(mesh);
});
function pointInCrevice(px,pz,hz){
  const dx = px-hz.cx, dz = pz-hz.cz;
  const cos = Math.cos(-hz.rot), sin = Math.sin(-hz.rot);
  const lx = dx*cos - dz*sin;
  const lz = dx*sin + dz*cos;
  return Math.abs(lx) < hz.w/2 && Math.abs(lz) < hz.d/2;
}

// ============================================================
// SHIP PARTS (replaces crystals) — 10 mechanical components
// ============================================================
const partDefs = [
  [43,26],[105,18],[175,42],[60,105],[145,90],[210,125],
  [30,130],[220,55],[95,70],[160,12]
];
function buildPartMesh(){
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color:0xcfd6dc, metalness:0.7, roughness:0.3 });
  const glowMat = new THREE.MeshStandardMaterial({ color:0xffb454, emissive:0xff9a2e, emissiveIntensity:1.6 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.3,1.0,0.7), bodyMat);
  g.add(box);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.5,0.75), glowMat);
  g.add(panel);
  [[-0.7,0.6,0],[0.7,0.6,0]].forEach(([x,y,z])=>{
    const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.6,6), bodyMat);
    prong.position.set(x,y,z);
    g.add(prong);
  });
  return g;
}
let parts = partDefs.map(([x,z],i)=>{
  const mesh = buildPartMesh();
  placeOnSphere(mesh, sphereFrame(x,z,WORLD_W,WORLD_D,PLANET_RADIUS_EUROPA), 1.4, 0);
  mesh.castShadow = true;
  europaGroup.add(mesh);
  return { x, z, mesh, collected:false, id:i, pulse: rng()*Math.PI*2, spin:0 };
});

// ============================================================
// CAPSULE / SHIP TO REPAIR
// ============================================================
const capsulePos = { x: 18, z: 18 };
function buildCapsule(){
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color:0xc7ccd1, metalness:0.6, roughness:0.35 });
  const bodyGeo = new THREE.CylinderGeometry(2.4,2.4,4.2,16);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.rotation.z = Math.PI/2;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  const capGeo = new THREE.SphereGeometry(2.4,16,16,0,Math.PI*2,0,Math.PI/2);
  const cap1 = new THREE.Mesh(capGeo, bodyMat);
  cap1.rotation.z = -Math.PI/2; cap1.position.x = 2.1;
  const cap2 = new THREE.Mesh(capGeo, bodyMat);
  cap2.rotation.z = Math.PI/2; cap2.position.x = -2.1;
  g.add(cap1, cap2);
  const stripeGeo = new THREE.CylinderGeometry(2.45,2.45,0.5,16);
  const stripeMat = new THREE.MeshStandardMaterial({ color:0xd9463c, roughness:0.5 });
  const stripe = new THREE.Mesh(stripeGeo, stripeMat);
  stripe.rotation.z = Math.PI/2;
  g.add(stripe);
  const hatchMat = new THREE.MeshStandardMaterial({ color:0x12202a, roughness:0.8 });
  const hatch = new THREE.Mesh(new THREE.SphereGeometry(1.5,12,12), hatchMat);
  hatch.position.set(-2.6, 0, 0);
  g.add(hatch);
  // engine nozzle — dim red while damaged, bright blue once repaired
  const engineMat = new THREE.MeshStandardMaterial({ color:0x552222, emissive:0xff2200, emissiveIntensity:0.35 });
  const engine = new THREE.Mesh(new THREE.ConeGeometry(1.6,1.6,12), engineMat);
  engine.rotation.z = -Math.PI/2;
  engine.position.set(2.9,0,0);
  g.add(engine);
  const frame = sphereFrame(capsulePos.x, capsulePos.z, WORLD_W, WORLD_D, PLANET_RADIUS_EUROPA);
  g.userData = { engine, engineMat, frame };
  placeOnSphere(g, frame, 2.6, 0.5);
  return g;
}
// raise/lower the capsule along the LOCAL "up" of Europa's curved ground
// (replaces flat capsuleMesh.position.y = ... assignments used during the
// intro descent and the launch-to-Jupiter cutscene).
function setCapsuleHeight(h){
  const f = capsuleMesh.userData.frame;
  capsuleMesh.position.copy(f.pos).addScaledVector(f.up, h);
}
const capsuleMesh = buildCapsule();
europaGroup.add(capsuleMesh);

// ============================================================
// JUPITER ARENA — ground, rocks, atmosphere
// ============================================================
function buildAlienGroundTexture(){
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const tctx = c.getContext('2d');
  const grad = tctx.createLinearGradient(0,0,size,size);
  grad.addColorStop(0,'#241726');
  grad.addColorStop(0.5,'#1a1020');
  grad.addColorStop(1,'#120a18');
  tctx.fillStyle = grad;
  tctx.fillRect(0,0,size,size);
  for(let i=0;i<180;i++){
    const x = rng()*size, y = rng()*size, r = 6+rng()*26;
    tctx.beginPath();
    tctx.fillStyle = rng()>0.5 ? 'rgba(80,50,90,0.18)' : 'rgba(10,5,15,0.25)';
    tctx.ellipse(x,y,r,r*0.6,rng()*Math.PI,0,Math.PI*2);
    tctx.fill();
  }
  return { map: tctx, canvas: c };
}
function buildAlienGroundMaps(){
  const size = 512;
  const base = buildAlienGroundTexture();
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = size; glowCanvas.height = size;
  const gctx = glowCanvas.getContext('2d');
  gctx.fillStyle = '#000';
  gctx.fillRect(0,0,size,size);
  gctx.strokeStyle = 'rgba(255,120,40,0.9)';
  gctx.lineWidth = 2;
  for(let i=0;i<26;i++){
    let x=rng()*size,y=rng()*size;
    base.map.beginPath(); // no-op, keep base ctx untouched here
    gctx.beginPath(); gctx.moveTo(x,y);
    let ang = rng()*Math.PI*2;
    for(let s=0;s<5;s++){
      ang += (rng()-0.5)*1.1;
      x += Math.cos(ang)*(14+rng()*24);
      y += Math.sin(ang)*(14+rng()*24);
      gctx.lineTo(x,y);
    }
    gctx.stroke();
    base.map.strokeStyle = 'rgba(255,150,60,0.5)';
    base.map.lineWidth = 2;
    base.map.stroke();
  }
  const map = new THREE.CanvasTexture(base.canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(8,8);
  map.encoding = THREE.sRGBEncoding;
  const emissiveMap = new THREE.CanvasTexture(glowCanvas);
  emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping;
  emissiveMap.repeat.set(8,8);
  return { map, emissiveMap };
}
const jGroundMaps = buildAlienGroundMaps();
const jGroundGeo = buildCurvedGround(JWORLD_W, JWORLD_D, PLANET_RADIUS_JUPITER, 70, 70, null, 90, 90);
const jGroundMat = new THREE.MeshStandardMaterial({
  map: jGroundMaps.map, emissiveMap: jGroundMaps.emissiveMap,
  emissive: 0xff8030, emissiveIntensity: 0.8, roughness:0.8, metalness:0.1, side: THREE.DoubleSide
});
const jGround = new THREE.Mesh(jGroundGeo, jGroundMat);
jGround.receiveShadow = true;
jupiterGroup.add(jGround);

const jRockGroup = new THREE.Group();
jupiterGroup.add(jRockGroup);
const jDecorRocks = [];
for(let i=0;i<26;i++){
  const x = 6 + rng()*(JWORLD_W-12);
  const z = 6 + rng()*(JWORLD_D-12);
  const r = 1.0 + rng()*2.2;
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.78, 0.3, 0.18+rng()*0.12), roughness:0.75 });
  const mesh = new THREE.Mesh(rockGeo, mat);
  mesh.scale.set(r, r*1.6, r);
  placeOnSphere(mesh, sphereFrame(x,z,JWORLD_W,JWORLD_D,PLANET_RADIUS_JUPITER), r*0.8, rng()*Math.PI);
  mesh.castShadow = true; mesh.receiveShadow = true;
  jRockGroup.add(mesh);
  jDecorRocks.push({x,z,r:r*0.85});
}

// ============================================================
// URANUS GROUND / TERRAIN — pale, icy, cold-blue final arena
// ============================================================
function buildUranusGroundTexture(){
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const tctx = c.getContext('2d');
  const grad = tctx.createLinearGradient(0,0,size,size);
  grad.addColorStop(0,'#1c313c');
  grad.addColorStop(0.5,'#162530');
  grad.addColorStop(1,'#0f1b22');
  tctx.fillStyle = grad;
  tctx.fillRect(0,0,size,size);
  for(let i=0;i<180;i++){
    const x = rng()*size, y = rng()*size, r = 6+rng()*26;
    tctx.beginPath();
    tctx.fillStyle = rng()>0.5 ? 'rgba(120,205,225,0.15)' : 'rgba(6,16,22,0.28)';
    tctx.ellipse(x,y,r,r*0.6,rng()*Math.PI,0,Math.PI*2);
    tctx.fill();
  }
  return { map: tctx, canvas: c };
}
function buildUranusGroundMaps(){
  const size = 512;
  const base = buildUranusGroundTexture();
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = size; glowCanvas.height = size;
  const gctx = glowCanvas.getContext('2d');
  gctx.fillStyle = '#000';
  gctx.fillRect(0,0,size,size);
  gctx.strokeStyle = 'rgba(130,225,255,0.9)';
  gctx.lineWidth = 2;
  for(let i=0;i<26;i++){
    let x=rng()*size,y=rng()*size;
    gctx.beginPath(); gctx.moveTo(x,y);
    let ang = rng()*Math.PI*2;
    for(let s=0;s<5;s++){
      ang += (rng()-0.5)*1.1;
      x += Math.cos(ang)*(14+rng()*24);
      y += Math.sin(ang)*(14+rng()*24);
      gctx.lineTo(x,y);
    }
    gctx.stroke();
    base.map.strokeStyle = 'rgba(150,230,255,0.5)';
    base.map.lineWidth = 2;
    base.map.stroke();
  }
  const map = new THREE.CanvasTexture(base.canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(8,8);
  map.encoding = THREE.sRGBEncoding;
  const emissiveMap = new THREE.CanvasTexture(glowCanvas);
  emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping;
  emissiveMap.repeat.set(8,8);
  return { map, emissiveMap };
}
const uGroundMaps = buildUranusGroundMaps();
const uGroundGeo = buildCurvedGround(UWORLD_W, UWORLD_D, PLANET_RADIUS_URANUS, 70, 70, null, 100, 100);
const uGroundMat = new THREE.MeshStandardMaterial({
  map: uGroundMaps.map, emissiveMap: uGroundMaps.emissiveMap,
  emissive: 0x40c8ff, emissiveIntensity: 0.55, roughness:0.75, metalness:0.15, side: THREE.DoubleSide
});
const uGround = new THREE.Mesh(uGroundGeo, uGroundMat);
uGround.receiveShadow = true;
uranusGroup.add(uGround);

const uRockGroup = new THREE.Group();
uranusGroup.add(uRockGroup);
const uDecorRocks = [];
for(let i=0;i<30;i++){
  const x = 6 + rng()*(UWORLD_W-12);
  const z = 6 + rng()*(UWORLD_D-12);
  const r = 1.0 + rng()*2.4;
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.55, 0.28, 0.2+rng()*0.14), roughness:0.7, metalness:0.15 });
  const mesh = new THREE.Mesh(rockGeo, mat);
  mesh.scale.set(r, r*1.6, r);
  placeOnSphere(mesh, sphereFrame(x,z,UWORLD_W,UWORLD_D,PLANET_RADIUS_URANUS), r*0.8, rng()*Math.PI);
  mesh.castShadow = true; mesh.receiveShadow = true;
  uRockGroup.add(mesh);
  uDecorRocks.push({x,z,r:r*0.85});
}

// ============================================================
// SATURN ARENA — golden/champagne dunes, final leg, swarm battlefield
// ============================================================
function buildSaturnGroundTexture(){
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const tctx = c.getContext('2d');
  const grad = tctx.createLinearGradient(0,0,size,size);
  grad.addColorStop(0,'#3a3018');
  grad.addColorStop(0.5,'#2c2412');
  grad.addColorStop(1,'#1e180c');
  tctx.fillStyle = grad;
  tctx.fillRect(0,0,size,size);
  for(let i=0;i<180;i++){
    const x = rng()*size, y = rng()*size, r = 6+rng()*26;
    tctx.beginPath();
    tctx.fillStyle = rng()>0.5 ? 'rgba(232,211,160,0.16)' : 'rgba(20,15,6,0.26)';
    tctx.ellipse(x,y,r,r*0.6,rng()*Math.PI,0,Math.PI*2);
    tctx.fill();
  }
  return { map: tctx, canvas: c };
}
function buildSaturnGroundMaps(){
  const size = 512;
  const base = buildSaturnGroundTexture();
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = size; glowCanvas.height = size;
  const gctx = glowCanvas.getContext('2d');
  gctx.fillStyle = '#000';
  gctx.fillRect(0,0,size,size);
  gctx.strokeStyle = 'rgba(255,215,140,0.9)';
  gctx.lineWidth = 2;
  for(let i=0;i<26;i++){
    let x=rng()*size,y=rng()*size;
    gctx.beginPath(); gctx.moveTo(x,y);
    let ang = rng()*Math.PI*2;
    for(let s=0;s<5;s++){
      ang += (rng()-0.5)*1.1;
      x += Math.cos(ang)*(14+rng()*24);
      y += Math.sin(ang)*(14+rng()*24);
      gctx.lineTo(x,y);
    }
    gctx.stroke();
    base.map.strokeStyle = 'rgba(255,225,160,0.5)';
    base.map.lineWidth = 2;
    base.map.stroke();
  }
  const map = new THREE.CanvasTexture(base.canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(8,8);
  map.encoding = THREE.sRGBEncoding;
  const emissiveMap = new THREE.CanvasTexture(glowCanvas);
  emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping;
  emissiveMap.repeat.set(8,8);
  return { map, emissiveMap };
}
const sGroundMaps = buildSaturnGroundMaps();
const sGroundGeo = buildCurvedGround(SWORLD_W, SWORLD_D, PLANET_RADIUS_SATURN, 70, 70, null, 100, 100);
const sGroundMat = new THREE.MeshStandardMaterial({
  map: sGroundMaps.map, emissiveMap: sGroundMaps.emissiveMap,
  emissive: 0xffcf80, emissiveIntensity: 0.5, roughness:0.8, metalness:0.1, side: THREE.DoubleSide
});
const sGround = new THREE.Mesh(sGroundGeo, sGroundMat);
sGround.receiveShadow = true;
saturnGroup.add(sGround);

const sRockGroup = new THREE.Group();
saturnGroup.add(sRockGroup);
const sDecorRocks = [];
for(let i=0;i<30;i++){
  const x = 6 + rng()*(SWORLD_W-12);
  const z = 6 + rng()*(SWORLD_D-12);
  const r = 1.0 + rng()*2.3;
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.12, 0.35, 0.24+rng()*0.14), roughness:0.75, metalness:0.1 });
  const mesh = new THREE.Mesh(rockGeo, mat);
  mesh.scale.set(r, r*1.6, r);
  placeOnSphere(mesh, sphereFrame(x,z,SWORLD_W,SWORLD_D,PLANET_RADIUS_SATURN), r*0.8, rng()*Math.PI);
  mesh.castShadow = true; mesh.receiveShadow = true;
  sRockGroup.add(mesh);
  sDecorRocks.push({x,z,r:r*0.85});
}

// ============================================================
// ROBOT (EXP-07) — bipedal humanoid, with arm weapon slots
// ============================================================
function buildRobot(){
  const g = new THREE.Group();
  const silver = new THREE.MeshStandardMaterial({ color:0xeef2f5, metalness:0.75, roughness:0.35 });
  const darkSilver = new THREE.MeshStandardMaterial({ color:0x8a97a5, metalness:0.7, roughness:0.4 });
  const red = new THREE.MeshStandardMaterial({ color:0xd9463c, metalness:0.4, roughness:0.4 });
  const visorMat = new THREE.MeshStandardMaterial({ color:0x0c2233, metalness:0.3, roughness:0.6 });
  const glowMat = new THREE.MeshStandardMaterial({ color:0x4fd8ff, emissive:0x4fd8ff, emissiveIntensity:2.2 });
  const cannonMat = new THREE.MeshStandardMaterial({ color:0x3a2a4a, metalness:0.6, roughness:0.35 });
  const plasmaMat = new THREE.MeshStandardMaterial({ color:0xff5cf0, emissive:0xff2fd8, emissiveIntensity:2.4 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.6,2.0,0.9), silver);
  torso.position.y = 2.6;
  torso.castShadow = true;
  g.add(torso);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.65,0.3,0.95), red);
  stripe.position.y = 3.5;
  g.add(stripe);
  const chestLight = new THREE.Mesh(new THREE.SphereGeometry(0.18,12,12), glowMat);
  chestLight.position.set(0,2.7,0.48);
  g.add(chestLight);

  const head = new THREE.Mesh(new THREE.BoxGeometry(1.0,0.85,0.9), silver);
  head.position.y = 4.05;
  head.castShadow = true;
  g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.75,0.3,0.94), visorMat);
  visor.position.set(0,4.05,0.02);
  g.add(visor);
  const visorGlow = new THREE.Mesh(new THREE.BoxGeometry(0.6,0.14,0.96), glowMat);
  visorGlow.position.set(0,4.05,0.05);
  g.add(visorGlow);

  function makeLeg(sign){
    const pivot = new THREE.Group();
    pivot.position.set(0.45*sign, 1.6, 0);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.5,1.1,0.55), darkSilver);
    thigh.position.y = -0.55;
    thigh.castShadow = true;
    pivot.add(thigh);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.42,1.0,0.46), darkSilver);
    shin.position.y = -1.5;
    shin.castShadow = true;
    pivot.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.55,0.25,0.85), new THREE.MeshStandardMaterial({color:0x5f6b78, metalness:0.6, roughness:0.4}));
    foot.position.set(0,-2.05,0.15);
    foot.castShadow = true;
    pivot.add(foot);
    return pivot;
  }
  const legL = makeLeg(-1), legR = makeLeg(1);
  g.add(legL, legR);

  function makeArm(sign){
    const pivot = new THREE.Group();
    pivot.position.set(0.95*sign, 3.35, 0);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.38,1.0,0.42), darkSilver);
    upper.position.y = -0.5;
    upper.castShadow = true;
    pivot.add(upper);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.32,0.9,0.36), darkSilver);
    lower.position.y = -1.35;
    lower.castShadow = true;
    pivot.add(lower);
    return pivot;
  }
  const armL = makeArm(-1), armR = makeArm(1);
  g.add(armL, armR);

  // small default wrist blaster (visible from the start)
  const wristBlaster = new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.16,0.6,8), darkSilver);
  wristBlaster.rotation.x = Math.PI/2;
  wristBlaster.position.set(0, -1.95, 0.35);
  armR.add(wristBlaster);

  // plasma cannon reward (hidden until earned)
  const plasmaCannon = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.26,1.3,10), cannonMat);
  barrel.rotation.x = Math.PI/2;
  barrel.position.set(0,0,0.5);
  plasmaCannon.add(barrel);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.55,0.5,0.7), cannonMat);
  housing.position.set(0,-0.05,-0.15);
  plasmaCannon.add(housing);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.2,10,10), plasmaMat);
  tip.position.set(0,0,1.15);
  plasmaCannon.add(tip);
  plasmaCannon.position.set(0,-1.9,0.3);
  plasmaCannon.visible = false;
  armR.add(plasmaCannon);

  g.userData = { legL, legR, armL, armR, wristBlaster, plasmaCannon };
  return g;
}
const robot = buildRobot();
robot.visible = false;
scene.add(robot);
const ROBOT_Y_OFFSET = 0.575; // lines the feet up with the ground (see leg geometry above)
let robotShouldShow = false;

// ============================================================
// ALIEN ENEMY — dark, glossy biomechanical monster (generic archetype,
// stylistically inspired by classic movie-creature design: elongated
// smooth head, ribbed exoskeleton torso, long tail, clawed digitigrade
// limbs — deliberately not a literal reproduction of any specific
// copyrighted character, and never named as one in-game).
// buildAlien(cfg) is a factory so both bosses share the same "species"
// but read as distinct individuals via accent glow color / eye color.
// ============================================================
function buildAlien(cfg){
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color:0x0d0f14, roughness:0.22, metalness:0.85, emissive:0x05060a, emissiveIntensity:0.35 });
  const shellRib = new THREE.MeshStandardMaterial({ color:0x181c24, roughness:0.3, metalness:0.75 });
  const jointGloss = new THREE.MeshStandardMaterial({ color:0x2a2f3a, roughness:0.12, metalness:0.9 });
  const vein = new THREE.MeshStandardMaterial({ color:cfg.glow, emissive:cfg.glowEmissive, emissiveIntensity:1.7 });
  const eyeMat = new THREE.MeshStandardMaterial({ color:cfg.eyeColor, emissive:cfg.eyeColor, emissiveIntensity:2.0 });
  const clawMat = new THREE.MeshStandardMaterial({ color:0x05070a, roughness:0.15, metalness:0.85 });

  // hunched torso, glossy biomechanical shell
  const body = new THREE.Mesh(new THREE.SphereGeometry(2.4,16,16), shell);
  body.scale.set(1.0,1.3,1.15);
  body.position.y = 4.0;
  body.castShadow = true;
  g.add(body);
  const chestBulge = new THREE.Mesh(new THREE.SphereGeometry(1.5,14,14), shell);
  chestBulge.scale.set(1,1.1,0.85);
  chestBulge.position.set(0,3.4,1.5);
  g.add(chestBulge);

  // ribbed exoskeleton plates running down the torso
  for(let i=0;i<5;i++){
    const rib = new THREE.Mesh(new THREE.TorusGeometry(2.35 - i*0.12,0.1,6,16), shellRib);
    rib.rotation.x = Math.PI/2;
    rib.position.y = 2.6 + i*0.95;
    rib.scale.set(1 - i*0.07, 1, 1 - i*0.07);
    g.add(rib);
  }
  // thin bio-luminescent seam along the spine (accent color, id's each boss)
  const spineGlow = new THREE.Mesh(new THREE.BoxGeometry(0.12,3.2,0.12), vein);
  spineGlow.position.set(0, 4.0, -1.85);
  g.add(spineGlow);

  // low dorsal ridge fins instead of blunt spikes
  for(let i=0;i<5;i++){
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.26,1.0 - i*0.08,4), shellRib);
    fin.position.set(0, 5.1 - i*0.5, -0.6 + i*0.5);
    fin.rotation.x = -0.55;
    fin.rotation.y = Math.PI/4;
    fin.castShadow = true;
    g.add(fin);
  }

  // elongated, smooth head — no jaw, no exposed teeth
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.0,16,16), shell);
  head.scale.set(0.85,1.05,1.9);
  head.position.set(0,5.55,1.9);
  head.rotation.x = -0.18;
  head.castShadow = true;
  g.add(head);
  const cranialRidge = new THREE.Mesh(new THREE.SphereGeometry(0.55,12,12), jointGloss);
  cranialRidge.scale.set(0.9,0.7,1.6);
  cranialRidge.position.set(0,6.05,1.7);
  g.add(cranialRidge);

  // slim glowing eye slits (kept for gameplay targeting/telegraph readability)
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.08,0.1), eyeMat);
  eye.position.set(0,5.5,2.85);
  g.add(eye);
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.32,0.06,0.08), eyeMat);
  eyeL.position.set(-0.42,5.42,2.65);
  eyeL.rotation.y = 0.4;
  g.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.42; eyeR.rotation.y = -0.4;
  g.add(eyeR);

  // long tail — a tapering, curling chain of segments trailing behind
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 3.7, -2.0);
  g.add(tailGroup);
  let curX=0, curY=0, curZ=0, ang=-0.35;
  for(let i=0;i<7;i++){
    const len = 1.15 - i*0.1;
    const rad0 = Math.max(0.05,0.26 - i*0.028), rad1 = Math.max(0.04,0.2 - i*0.026);
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(rad1, rad0, len, 6), i%2===0 ? shell : shellRib);
    const dx = Math.sin(ang)*len*0.5, dz = -Math.cos(ang)*len*0.5, dy = Math.sin(ang*0.4)*len*0.15;
    seg.position.set(curX+dx, curY+dy, curZ+dz);
    seg.rotation.x = Math.PI/2 - ang;
    seg.castShadow = true;
    tailGroup.add(seg);
    curX += dx*2; curY += dy*2; curZ += dz*2;
    ang -= 0.16;
  }
  const tailTip = new THREE.Mesh(new THREE.ConeGeometry(0.1,0.45,6), clawMat);
  tailTip.position.set(curX, curY, curZ - 0.2);
  tailTip.rotation.x = Math.PI/2 - ang;
  tailGroup.add(tailTip);

  // clawed, digitigrade legs — two-segment (knee-bent), radial stance
  for(let i=0;i<6;i++){
    const legAng = (i/6)*Math.PI*2;
    const bx = Math.cos(legAng)*0.7, bz = Math.sin(legAng)*0.7, by = 3.5;
    const kx = Math.cos(legAng)*1.9, kz = Math.sin(legAng)*1.9, ky = 1.7;
    const lx = Math.cos(legAng)*2.7, lz = Math.sin(legAng)*2.7, ly = 0.1;
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.11,2.0,6), shellRib);
    upper.position.set((bx+kx)/2, (by+ky)/2, (bz+kz)/2);
    upper.rotation.z = Math.cos(legAng)*0.85;
    upper.rotation.x = Math.sin(legAng)*0.85;
    upper.castShadow = true;
    g.add(upper);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.05,2.0,6), jointGloss);
    lower.position.set((kx+lx)/2, (ky+ly)/2, (kz+lz)/2);
    lower.rotation.z = Math.cos(legAng)*0.5;
    lower.rotation.x = Math.sin(legAng)*0.5;
    lower.castShadow = true;
    g.add(lower);
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.1,0.4,5), clawMat);
    claw.position.set(lx, ly-0.15, lz);
    claw.rotation.z = Math.cos(legAng)*0.9 + Math.PI;
    claw.rotation.x = Math.sin(legAng)*0.9;
    g.add(claw);
  }

  // clawed arms, elbow-bent, glossy black
  function makeArm(sign){
    const piv = new THREE.Group();
    piv.position.set(1.9*sign, 4.3, 0.7);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.17,1.1,6), shellRib);
    upper.position.set(sign*0.25, -0.55, 0.1);
    upper.rotation.z = 0.5*sign;
    piv.add(upper);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.11,1.15,6), shell);
    lower.position.set(sign*0.55, -1.55, 0.35);
    lower.rotation.z = 0.75*sign;
    piv.add(lower);
    for(let i=0;i<3;i++){
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.1,0.42,5), clawMat);
      const a = (i-1)*0.4;
      c.position.set(sign*0.75 + Math.sin(a)*0.28, -2.15, 0.5+Math.cos(a)*0.22);
      c.rotation.x = Math.PI*0.9;
      piv.add(c);
    }
    return piv;
  }
  g.add(makeArm(-1), makeArm(1));

  g.userData = { body, eye, eyeMat, tail: tailGroup };
  return g;
}

const ALIEN_VARIANTS = {
  jupiter: { glow:0xff8a3c, glowEmissive:0xff6a1c, eyeColor:0xffb454 },
  uranus:  { glow:0x4fe0ff, glowEmissive:0x2fc0ff, eyeColor:0x8fe8ff },
  saturn:  { glow:0xffd27a, glowEmissive:0xffb347, eyeColor:0xffe9b0 },
};
const alienMeshJ = buildAlien(ALIEN_VARIANTS.jupiter);
jupiterGroup.add(alienMeshJ);
const alienMeshU = buildAlien(ALIEN_VARIANTS.uranus);
uranusGroup.add(alienMeshU);

const alienJ = {
  x: JWORLD_W/2, z: JWORLD_D/2 + 35,
  health: 440, maxHealth: 440,
  alive: false,
  charging: false, chargeT: 0, attackTimer: 2.0,
  bobT: 0,
  scale: 1.35, hitRadius: 4.4, headHeight: 5.5*1.35,
  damage: 16, attackMin: 1.8, attackMax: 1.0, chargeDuration: 0.6,
  boltSpeed: 17, moveSpeed: 6, desiredDist: 16,
  arenaW: JWORLD_W, arenaD: JWORLD_D,
};
const alienU = {
  // "Más fuerte" — tougher, hits harder, attacks faster, bigger & quicker than the Jupiter one
  x: UWORLD_W/2, z: UWORLD_D/2 + 35,
  health: 700, maxHealth: 700,
  alive: false,
  charging: false, chargeT: 0, attackTimer: 2.0,
  bobT: 0,
  scale: 1.65, hitRadius: 5.1, headHeight: 5.5*1.65,
  damage: 22, attackMin: 1.2, attackMax: 0.8, chargeDuration: 0.45,
  boltSpeed: 21, moveSpeed: 7.5, desiredDist: 15,
  arenaW: UWORLD_W, arenaD: UWORLD_D,
};
alienMeshJ.visible = false;
alienMeshU.visible = false;

// ---------- Saturn's swarm: 12 small aliens instead of one boss. Kept as a
// fully separate array/state system (not routed through boss/bossMesh) so
// none of the tuned single-boss logic above has to change. ----------
const MINI_ALIEN_COUNT = 12;
const miniAliens = [];
for(let i=0;i<MINI_ALIEN_COUNT;i++){
  const mesh = buildAlien(ALIEN_VARIANTS.saturn);
  mesh.scale.setScalar(0.5);
  mesh.visible = false;
  saturnGroup.add(mesh);
  const ang = (i/MINI_ALIEN_COUNT)*Math.PI*2;
  miniAliens.push({
    homeAng: ang,
    x: SWORLD_W/2 + Math.cos(ang)*24, z: SWORLD_D/2 + Math.sin(ang)*24,
    health: 26, maxHealth: 26,
    alive: false, dying: false, dyingT: 0,
    bobT: rng()*Math.PI*2,
    scale: 0.5, hitRadius: 2.1, headHeight: 5.5*0.5,
    damage: 8, attackInterval: 1.0 + rng()*0.4, attackCooldown: 0,
    moveSpeed: 5.5 + rng()*1.5,
    mesh,
  });
}

// "boss"/"bossMesh"/"bossGroup" always point at whichever alien is the
// current combat encounter — reassigned when each transition swaps arenas.
// During the Saturn swarm fight boss/bossMesh stay pointed at the (defeated,
// inactive) Uranus alien and are simply unused; bossGroup is repointed at
// saturnGroup so shared effects (tracers/sparks/plasma waves) still parent
// into the right (visible) world group.
let boss = alienJ, bossMesh = alienMeshJ, bossGroup = jupiterGroup;

const plasmaBoltGeo = new THREE.SphereGeometry(0.5, 10, 10);
const plasmaBoltMat = new THREE.MeshStandardMaterial({ color:0xff3c6e, emissive:0xff2050, emissiveIntensity:2.4 });
let alienBolts = [];

// ---------- generic short-lived visual effects (tracers, sparks) ----------
let effects = [];
function spawnTracer(a, b){
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const mat = new THREE.LineBasicMaterial({ color:0x9be8ff, transparent:true, opacity:0.9 });
  const line = new THREE.Line(geo, mat);
  bossGroup.add(line);
  effects.push({ mesh:line, life:0.12, maxLife:0.12, mat });
}
function spawnSpark(pos){
  const geo = new THREE.SphereGeometry(0.4, 8, 8);
  const mat = new THREE.MeshBasicMaterial({ color:0xffe090, transparent:true, opacity:1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  bossGroup.add(mesh);
  effects.push({ mesh, life:0.22, maxLife:0.22, mat, grow:true });
}
// ---------- plasma cannon shot: a real-thickness glowing beam (a thin
// cylinder — THREE.Line's linewidth is ignored by most browsers, so a plain
// line reads as no thicker than the wrist blaster's tracer) plus a couple of
// big expanding shockwave rings at the impact point — used once EXP-07 has
// the cannon, instead of the wrist blaster's plain tracer line. ----------
function spawnPlasmaWave(origin, hitPoint){
  const dir = new THREE.Vector3().subVectors(hitPoint, origin);
  const len = Math.max(0.01, dir.length());
  const beamGeo = new THREE.CylinderGeometry(0.16, 0.28, len, 10, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({ color:0x9be8ff, transparent:true, opacity:0.85, depthWrite:false, fog:false, side:THREE.DoubleSide });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.copy(origin).addScaledVector(dir, 0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
  bossGroup.add(beam);
  effects.push({ mesh:beam, life:0.16, maxLife:0.16, mat:beamMat });

  for(let i=0;i<2;i++){
    const ringGeo = new THREE.RingGeometry(1.1, 1.7, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color:0x6fe7ff, transparent:true, opacity:0.9, side:THREE.DoubleSide, depthWrite:false, fog:false });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(hitPoint);
    ring.quaternion.copy(camera.quaternion);
    ring.scale.setScalar(0.3 + i*0.35);
    bossGroup.add(ring);
    effects.push({ mesh: ring, life:0.4 + i*0.2, maxLife:0.4 + i*0.2, mat: ringMat, grow:true });
  }
}
function updateEffects(dt){
  for(let i=effects.length-1;i>=0;i--){
    const e = effects[i];
    e.life -= dt;
    e.mat.opacity = Math.max(0, e.life/e.maxLife);
    if(e.grow) e.mesh.scale.multiplyScalar(1 + dt*4);
    if(e.life <= 0){
      e.mesh.parent && e.mesh.parent.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mat.dispose();
      effects.splice(i,1);
    }
  }
}

// ============================================================
// PLAYER STATE
// ============================================================
const player = {
  x: capsulePos.x, z: capsulePos.z + 8,
  y: 0, vy: 0, grounded: true,
  facing: Math.PI,
  speed: 15.5,
  moving: false,
  walkPhase: 0,
  energy: 100,
  invuln: 0,
  hasCannon: false,
};

// ---------- Minecraft-style mouse look ----------
let pitch = 0.32;
const YAW_SENSITIVITY = 0.0024, PITCH_SENSITIVITY = 0.0024;
const PITCH_MIN = -0.45, PITCH_MAX = 1.1;
const CAM_DIST = 9.5, CAM_BASE_HEIGHT = 2.6, CAM_MIN_Y = 1.4;

const glCanvas = renderer.domElement;
function isPointerLocked(){ return document.pointerLockElement === glCanvas; }
canvasStage.addEventListener('click', ()=>{
  if((state === 'playing' || state === 'combat') && !isPointerLocked()){
    glCanvas.requestPointerLock();
  }
});
document.addEventListener('mousemove', (e)=>{
  if(!isPointerLocked() || (state !== 'playing' && state !== 'combat')) return;
  player.facing -= e.movementX * YAW_SENSITIVITY;
  pitch += -e.movementY * PITCH_SENSITIVITY;
  pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch));
});
document.addEventListener('pointerlockchange', ()=>updatePointerHint());
document.addEventListener('mousedown', (e)=>{
  if(e.button !== 0) return;
  if(!isPointerLocked()) return;
  if(state !== 'combat') return;
  if(shootCooldown > 0) return;
  firePlayerWeapon();
  shootCooldown = 0.28;
});

// ---------- physics ----------
// Each world has its own surface gravity, loosely proportional to the real
// relative surface gravities (Jupiter's cloud layer pulls hardest, then
// Uranus, then icy little Europa) — the launch impulse (JUMP_SPEED) stays
// the same everywhere, so the jump height/hang-time comes out naturally
// proportional to whichever world's gravity is currently active
// (h = v²/2g): floaty on Europa, noticeably lower and snappier on Jupiter.
const WORLD_GRAVITY = { europa: -26, jupiter: -46, uranus: -34, saturn: -28 };
let GRAVITY = WORLD_GRAVITY.europa;
const JUMP_SPEED = 9.5, GROUND_Y = 0;
let shootCooldown = 0;

// ---------- input ----------
const keys = {};
window.addEventListener('keydown', e=>{
  keys[e.key.toLowerCase()] = true;
  if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) e.preventDefault();
});
window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()] = false; });

function collidesRock(x,z){
  const list = missionStage === 'saturn' ? sDecorRocks : missionStage === 'uranus' ? uDecorRocks : missionStage === 'jupiter' ? jDecorRocks : decorRocks;
  for(const rk of list){
    const dx = x-rk.x, dz = z-rk.z;
    if(dx*dx+dz*dz < (rk.r*0.9)*(rk.r*0.9)) return true;
  }
  return false;
}

// ============================================================
// COMBAT LOGIC
// ============================================================
function damageAlien(amount){
  if(!boss.alive) return;
  boss.health = Math.max(0, boss.health - amount);
  alienBarInner.style.width = (boss.health/boss.maxHealth*100) + '%';
  sfxAlienHit();
  const flashMat = bossMesh.userData.body.material;
  flashMat.emissiveIntensity = 1.4;
  if(boss.health <= 0){
    onAlienDefeated();
  }
}
const PLASMA_CANNON_DAMAGE_MULT = 3; // reward weapon hits 3x as hard as the wrist blaster
function firePlayerWeapon(){
  const origin = camera.position.clone();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  let hitPoint = origin.clone().add(dir.clone().multiplyScalar(80));
  if(missionStage === 'saturn'){
    // swarm fight: raycast against every alive mini alien, hit the closest one
    let closestT = Infinity, hitM = null, hitPos = null;
    for(const m of miniAliens){
      if(!m.alive) continue;
      const mUp = new THREE.Vector3(0,1,0).applyQuaternion(m.mesh.quaternion);
      const alienPos = m.mesh.position.clone().addScaledVector(mUp, m.headHeight);
      const toAlien = alienPos.clone().sub(origin);
      const t = toAlien.dot(dir);
      if(t > 0 && t < 100 && t < closestT){
        const closest = origin.clone().add(dir.clone().multiplyScalar(t));
        const d = closest.distanceTo(alienPos);
        if(d < m.hitRadius){
          closestT = t; hitM = m; hitPoint = closest; hitPos = alienPos;
        }
      }
    }
    if(hitM){
      const baseDamage = 14 + rng()*5;
      damageMiniAlien(hitM, player.hasCannon ? baseDamage * PLASMA_CANNON_DAMAGE_MULT : baseDamage);
      spawnSpark(hitPos);
    }
  } else if(boss.alive){
    const bossUp = new THREE.Vector3(0,1,0).applyQuaternion(bossMesh.quaternion);
    const alienPos = bossMesh.position.clone().addScaledVector(bossUp, boss.headHeight);
    const toAlien = alienPos.clone().sub(origin);
    const t = toAlien.dot(dir);
    if(t > 0 && t < 100){
      const closest = origin.clone().add(dir.clone().multiplyScalar(t));
      const d = closest.distanceTo(alienPos);
      if(d < boss.hitRadius){
        hitPoint = closest;
        const baseDamage = 14 + rng()*5;
        damageAlien(player.hasCannon ? baseDamage * PLASMA_CANNON_DAMAGE_MULT : baseDamage);
        spawnSpark(alienPos);
      }
    }
  }
  if(player.hasCannon) spawnPlasmaWave(origin, hitPoint);
  else spawnTracer(origin, hitPoint);
  sfxShoot();
}
function fireAlienProjectile(){
  const dx = player.x-boss.x, dz = player.z-boss.z;
  const len = Math.hypot(dx,dz)||1;
  const dirX = dx/len, dirZ = dz/len;
  const spread = (rng()-0.5)*0.12;
  const cos=Math.cos(spread), sin=Math.sin(spread);
  const fx = dirX*cos - dirZ*sin, fz = dirX*sin + dirZ*cos;
  const mesh = new THREE.Mesh(plasmaBoltGeo, plasmaBoltMat.clone());
  bossGroup.add(mesh);
  // bolts travel in flat map (x,z) at a fixed height above the curved
  // ground — same trick as the ship parts: game logic (hit distance,
  // motion) stays flat, only the render position gets wrapped each tick.
  const spd = boss.boltSpeed;
  alienBolts.push({ mesh, x: boss.x, z: boss.z, height: boss.headHeight, vx:fx*spd, vz:fz*spd, life:4.5, dmg: boss.damage });
  sfxAlienShoot();
}
function updateAlien(dt){
  if(!boss.alive) return;
  boss.bobT += dt*1.5;
  const dxp = player.x-boss.x, dzp = player.z-boss.z;
  const dist = Math.hypot(dxp,dzp) || 0.001;
  const desired = boss.desiredDist;
  let moveX=0, moveZ=0;
  if(dist < desired-3){ moveX=-dxp/dist; moveZ=-dzp/dist; }
  else if(dist > desired+5){ moveX=dxp/dist; moveZ=dzp/dist; }
  boss.x = Math.max(6, Math.min(boss.arenaW-6, boss.x + moveX*boss.moveSpeed*dt));
  boss.z = Math.max(6, Math.min(boss.arenaD-6, boss.z + moveZ*boss.moveSpeed*dt));

  placeOnSphere(bossMesh, currentFrame(boss.x, boss.z), Math.sin(boss.bobT)*0.3, Math.atan2(dxp,dzp));
  if(bossMesh.userData.tail) bossMesh.userData.tail.rotation.x = Math.sin(boss.bobT*0.7)*0.18;

  const eyeMat = bossMesh.userData.eyeMat;
  if(boss.charging){
    boss.chargeT -= dt;
    eyeMat.emissiveIntensity = 2.0 + Math.max(0, (boss.chargeDuration-boss.chargeT))*4;
    if(boss.chargeT <= 0){
      fireAlienProjectile();
      boss.charging = false;
      boss.attackTimer = boss.attackMin + rng()*boss.attackMax;
      eyeMat.emissiveIntensity = 2.0;
    }
  } else {
    bossMesh.userData.body.material.emissiveIntensity = Math.max(0.35, bossMesh.userData.body.material.emissiveIntensity - dt*2);
    boss.attackTimer -= dt;
    if(boss.attackTimer <= 0){
      boss.charging = true;
      boss.chargeT = boss.chargeDuration;
      sfxAlienCharge();
    }
  }
}
function updateAlienBolts(dt){
  for(let i=alienBolts.length-1;i>=0;i--){
    const b = alienBolts[i];
    b.x += b.vx*dt;
    b.z += b.vz*dt;
    placeOnSphere(b.mesh, currentFrame(b.x, b.z), b.height, 0);
    b.life -= dt;
    const dpx = player.x-b.x, dpz = player.z-b.z;
    const hitDist = Math.hypot(dpx,dpz);
    let remove = false;
    if(hitDist < 1.5 && player.invuln <= 0){
      player.energy = Math.max(0, player.energy - (b.dmg||16));
      player.invuln = 1.0;
      sfxHazard();
      showMessage('¡Impacto de plasma!', 1.6);
      remove = true;
    }
    if(b.life <= 0 || hitDist > 140) remove = true;
    if(remove){
      bossGroup.remove(b.mesh);
      b.mesh.geometry === plasmaBoltGeo || b.mesh.geometry.dispose();
      b.mesh.material.dispose();
      alienBolts.splice(i,1);
    }
  }
}

// ============================================================
// SATURN SWARM COMBAT — 12 independent mini aliens, melee-only, no ranged
// bolts. Mirrors the single-boss hit-flash/health-bar/death pattern above
// but tracks per-instance state instead of one shared `boss` object.
// ============================================================
function updateSaturnSwarmHud(){
  const aliveList = miniAliens.filter(m=>m.alive);
  const totalHealth = aliveList.reduce((s,m)=>s+m.maxHealth,0);
  const curHealth = aliveList.reduce((s,m)=>s+m.health,0);
  alienBarInner.style.width = (totalHealth>0 ? curHealth/totalHealth*100 : 0) + '%';
  if(alienLabelEl) alienLabelEl.textContent = 'ENJAMBRE DE SATURNO — ' + aliveList.length + ' RESTANTES';
}
function checkSaturnSwarmDefeated(){
  if(miniAliens.every(m => !m.alive && !m.dying)){
    state = 'saturnVictory';
    saturnVictoryT = 0;
    showMessage('¡Enjambre de Saturno eliminado! La nave ya puede partir...', 2.8);
  }
}
function damageMiniAlien(m, amount){
  if(!m.alive || m.dying) return;
  m.health = Math.max(0, m.health - amount);
  sfxAlienHit();
  const flashMat = m.mesh.userData.body.material;
  flashMat.emissiveIntensity = 1.4;
  updateSaturnSwarmHud();
  if(m.health <= 0){
    m.alive = false;
    m.dying = true;
    m.dyingT = 0;
    sfxAlienDeath();
    updateSaturnSwarmHud();
    checkSaturnSwarmDefeated();
  }
}
function updateMiniAliens(dt){
  for(const m of miniAliens){
    if(m.dying){
      m.dyingT += dt;
      m.mesh.translateY(-dt*3); // sinks along its own local "up", same trick as the bosses
      m.mesh.scale.multiplyScalar(Math.max(0, 1-dt*1.6));
      if(m.dyingT >= 0.7){
        m.mesh.visible = false;
        m.dying = false;
        // the kill that finishes the LAST death-sink animation is what
        // actually clears the swarm — damageMiniAlien() only checks at the
        // instant of the killing blow (dying just started, so that check
        // always fails), so re-check here once an animation truly completes.
        checkSaturnSwarmDefeated();
      }
      continue;
    }
    if(!m.alive) continue;
    m.bobT += dt*2.0;
    const dxp = player.x-m.x, dzp = player.z-m.z;
    const dist = Math.hypot(dxp,dzp) || 0.001;
    const desired = 3.2;
    let moveX=0, moveZ=0;
    if(dist > desired){ moveX = dxp/dist; moveZ = dzp/dist; }
    m.x = Math.max(6, Math.min(SWORLD_W-6, m.x + moveX*m.moveSpeed*dt));
    m.z = Math.max(6, Math.min(SWORLD_D-6, m.z + moveZ*m.moveSpeed*dt));
    placeOnSphere(m.mesh, currentFrame(m.x, m.z), Math.sin(m.bobT)*0.18, Math.atan2(dxp,dzp));
    if(m.mesh.userData.tail) m.mesh.userData.tail.rotation.x = Math.sin(m.bobT*0.9)*0.14;
    m.mesh.userData.body.material.emissiveIntensity = Math.max(0.35, m.mesh.userData.body.material.emissiveIntensity - dt*2);

    if(m.attackCooldown > 0) m.attackCooldown -= dt;
    if(dist < desired + 1.5 && m.attackCooldown <= 0 && player.invuln <= 0){
      player.energy = Math.max(0, player.energy - m.damage);
      player.invuln = 0.8;
      m.attackCooldown = m.attackInterval;
      sfxHazard();
      showMessage('¡Zarpazo del enjambre!', 1.2);
    }
  }
}

let rewardPhase = 0, rewardT = 0, rewardKind = 'cannon';
function onAlienDefeated(){
  boss.alive = false;
  sfxAlienDeath();
  state = 'reward';
  rewardPhase = 0; rewardT = 0;
  rewardKind = (boss === alienJ) ? 'cannon' : 'final';
  showMessage('¡Criatura derrotada!', 2.2);
}
function handleReward(dt){
  rewardT += dt;
  if(rewardPhase === 0){
    bossMesh.translateY(-dt*3); // sinks along its own local "up" (the ground normal), not world -Y
    bossMesh.scale.multiplyScalar(Math.max(0, 1-dt*0.7));
    if(rewardT >= 1.1){
      bossMesh.visible = false;
      rewardPhase = 1; rewardT = 0;
      showMessage(rewardKind === 'cannon' ? 'Su núcleo de plasma vuela hacia tu brazo...' : 'La segunda criatura cae... los sistemas de la nave se estabilizan.', 1.8);
    }
  } else if(rewardPhase === 1){
    if(rewardKind === 'cannon'){
      if(rewardT >= 0.9){
        robot.userData.wristBlaster.visible = false;
        robot.userData.plasmaCannon.visible = true;
        player.hasCannon = true;
        sfxEquip();
        rewardPhase = 2; rewardT = 0;
      }
    } else if(rewardT >= 0.9){
      rewardPhase = 2; rewardT = 0;
    }
  } else if(rewardPhase === 2){
    if(rewardT >= 1.3){
      if(rewardKind === 'cannon'){
        beginTransitionToUranus();
      } else {
        beginTransitionToSaturn();
      }
    }
  }
}

// ============================================================
// STATE MACHINE
// ============================================================
let state = 'title'; // title, intro, playing, transition, combat, reward, win, gameover
let introT = 0;
const introDuration = 3.0;
let collectedCount = 0;
let firstPartMsgShown = false, halfwayMsgShown = false, allCollectedMsgShown = false;
let last = 0;
let deathCause = 'ice';

function collectedAll(){ return collectedCount >= TOTAL_PARTS; }

function updatePointerHint(){
  const hint = document.getElementById('pointerHint');
  if(!hint) return;
  hint.style.display = ((state === 'playing' || state === 'combat') && !isPointerLocked()) ? 'flex' : 'none';
}

function startGame(){
  ensureAudio();
  overlay.classList.add('hidden');
  hud.style.display = 'flex';
  mmCanvas.style.display = 'block';
  state = 'intro';
  introT = 0;
  showMessage('Cápsula de descenso en curso...', 2.6);
}
startBtn.addEventListener('click', ()=>{
  if(state === 'win' || state === 'gameover') resetGame();
  else startGame();
});

let transitionPhase = 0, transitionT = 0;
const TRANSITION_DURATIONS = [3.0, 0.6, 0.6, 1.6];

function beginTransition(){
  state = 'transition';
  transitionPhase = 0; transitionT = 0;
  robotShouldShow = false; // EXP-07 boards the capsule for the trip
  showMessage('Todas las piezas instaladas. Reparando el motor...', 2.8);
  sfxRepair();
}
function handleTransition(dt){
  transitionT += dt;
  if(transitionPhase === 0){
    const t = Math.min(1, transitionT/TRANSITION_DURATIONS[0]);
    capsuleMesh.userData.engineMat.emissiveIntensity = 0.35 + t*1.8;
    capsuleMesh.userData.engineMat.color.lerpColors(new THREE.Color(0x552222), new THREE.Color(0x2fd0ff), t);
    capsuleMesh.userData.engineMat.emissive.lerpColors(new THREE.Color(0xff2200), new THREE.Color(0x2fd0ff), t);
    camera.position.lerp(capsuleMesh.userData.frame.pos.clone().add(new THREE.Vector3(-14,8,14)), Math.min(1,dt*2));
    camera.lookAt(capsuleMesh.position);
    if(transitionT >= TRANSITION_DURATIONS[0]){
      transitionPhase = 1; transitionT = 0;
      sfxLaunch();
      showMessage('Despegando hacia Júpiter...', 2.2);
    }
  } else if(transitionPhase === 1){
    const t = Math.min(1, transitionT/TRANSITION_DURATIONS[1]);
    fadeOverlay.style.opacity = t;
    setCapsuleHeight(2.6 + t*t*40);
    if(transitionT >= TRANSITION_DURATIONS[1]){
      // swap worlds
      europaGroup.visible = false;
      jupiterGroup.visible = true;
      setLightingMode('jupiter');
      setJupiterLooming();
      worldBounds = { w: JWORLD_W, d: JWORLD_D, radius: PLANET_RADIUS_JUPITER };
      missionStage = 'jupiter';
      GRAVITY = WORLD_GRAVITY.jupiter;
      boss = alienJ; bossMesh = alienMeshJ; bossGroup = jupiterGroup;
      player.x = JWORLD_W/2; player.z = 15; player.y = 0; player.vy = 0;
      player.facing = 0; pitch = 0.32;
      alienJ.x = JWORLD_W/2; alienJ.z = JWORLD_D/2 + 20; alienJ.health = alienJ.maxHealth;
      placeOnSphere(alienMeshJ, currentFrame(alienJ.x, alienJ.z), -6, 0);
      alienMeshJ.scale.set(0.001,0.001,0.001);
      alienMeshJ.visible = true;
      alienBarInner.style.width = '100%';
      transitionPhase = 2; transitionT = 0;
    }
  } else if(transitionPhase === 2){
    const t = Math.min(1, transitionT/TRANSITION_DURATIONS[2]);
    fadeOverlay.style.opacity = 1-t;
    if(transitionT >= TRANSITION_DURATIONS[2]){
      transitionPhase = 3; transitionT = 0;
      showMessage('Llegada a la atmósfera superior de Júpiter. Algo se acerca...', 3.2);
    }
  } else if(transitionPhase === 3){
    const t = Math.min(1, transitionT/TRANSITION_DURATIONS[3]);
    const s = t*t*(3-2*t); // smoothstep
    placeOnSphere(alienMeshJ, currentFrame(alienJ.x, alienJ.z), -6 + s*6, 0);
    alienMeshJ.scale.setScalar(Math.max(0.001, s) * alienJ.scale);
    if(transitionT >= TRANSITION_DURATIONS[3]){
      alienJ.alive = true;
      alienJ.attackTimer = 2.0;
      alienHud.style.display = 'block';
      state = 'combat';
      robotShouldShow = true;
      // the "looming" close-up was only for the reveal cinematic — pull
      // Jupiter back out to its normal distant-backdrop spot now that the
      // actual fight starts, so it doesn't hang there overlapping the arena.
      setJupiterDistant();
      placeOnSphere(robot, currentFrame(player.x, player.z), player.y + ROBOT_Y_OFFSET, player.facing);
      camera.up.copy(currentFrame(player.x, player.z).up);
      updatePointerHint();
      showMessage('¡La criatura ataca! Disparale con click.', 3.4);
    }
  }
}

// ---------- second leg: Júpiter → Urano, after the cannon is equipped ----------
let transition2Phase = 0, transition2T = 0;
const TRANSITION2_DURATIONS = [0.8, 0.6, 1.1, 1.6];
function beginTransitionToUranus(){
  state = 'transition2';
  transition2Phase = 0; transition2T = 0;
  robotShouldShow = false;
  showMessage('Rumbo a Urano...', 2.4);
  sfxLaunch();
}
function handleTransition2(dt){
  transition2T += dt;
  if(transition2Phase === 0){
    const t = Math.min(1, transition2T/TRANSITION2_DURATIONS[0]);
    fadeOverlay.style.opacity = t;
    if(transition2T >= TRANSITION2_DURATIONS[0]){
      // swap worlds: Jupiter -> Uranus
      jupiterGroup.visible = false;
      uranusGroup.visible = true;
      setLightingMode('uranus');
      setJupiterDistant();
      setUranusLooming();
      worldBounds = { w: UWORLD_W, d: UWORLD_D, radius: PLANET_RADIUS_URANUS };
      missionStage = 'uranus';
      GRAVITY = WORLD_GRAVITY.uranus;
      boss = alienU; bossMesh = alienMeshU; bossGroup = uranusGroup;
      player.x = UWORLD_W/2; player.z = 15; player.y = 0; player.vy = 0;
      player.facing = 0; pitch = 0.32;
      alienU.x = UWORLD_W/2; alienU.z = UWORLD_D/2 + 20; alienU.health = alienU.maxHealth;
      placeOnSphere(alienMeshU, currentFrame(alienU.x, alienU.z), -6, 0);
      alienMeshU.scale.set(0.001,0.001,0.001);
      alienMeshU.visible = true;
      alienBarInner.style.width = '100%';
      transition2Phase = 1; transition2T = 0;
    }
  } else if(transition2Phase === 1){
    const t = Math.min(1, transition2T/TRANSITION2_DURATIONS[1]);
    fadeOverlay.style.opacity = 1-t;
    if(transition2T >= TRANSITION2_DURATIONS[1]){
      transition2Phase = 2; transition2T = 0;
      showMessage('Llegada a Urano. Algo mucho más grande acecha entre la niebla helada...', 3.2);
    }
  } else if(transition2Phase === 2){
    if(transition2T >= TRANSITION2_DURATIONS[2]){
      transition2Phase = 3; transition2T = 0;
    }
  } else if(transition2Phase === 3){
    const t = Math.min(1, transition2T/TRANSITION2_DURATIONS[3]);
    const s = t*t*(3-2*t);
    placeOnSphere(alienMeshU, currentFrame(alienU.x, alienU.z), -6 + s*6, 0);
    alienMeshU.scale.setScalar(Math.max(0.001, s) * alienU.scale);
    if(transition2T >= TRANSITION2_DURATIONS[3]){
      alienU.alive = true;
      alienU.attackTimer = 1.6;
      alienHud.style.display = 'block';
      state = 'combat';
      robotShouldShow = true;
      // same as Jupiter: recede the "looming" close-up back out to a normal
      // distant backdrop now that the actual fight starts.
      setUranusDistant();
      placeOnSphere(robot, currentFrame(player.x, player.z), player.y + ROBOT_Y_OFFSET, player.facing);
      camera.up.copy(currentFrame(player.x, player.z).up);
      updatePointerHint();
      showMessage('¡La criatura de Urano ataca! Es mucho más fuerte — cuidado.', 3.6);
    }
  }
}

// ---------- third leg: Urano → Saturno, the final swarm battle ----------
let transition3Phase = 0, transition3T = 0;
let saturnVictoryT = 0;
const TRANSITION3_DURATIONS = [0.8, 0.6, 1.0, 1.8];
function beginTransitionToSaturn(){
  state = 'transition3';
  transition3Phase = 0; transition3T = 0;
  robotShouldShow = false;
  showMessage('Rumbo a Saturno...', 2.4);
  sfxLaunch();
}
function handleTransition3(dt){
  transition3T += dt;
  if(transition3Phase === 0){
    const t = Math.min(1, transition3T/TRANSITION3_DURATIONS[0]);
    fadeOverlay.style.opacity = t;
    if(transition3T >= TRANSITION3_DURATIONS[0]){
      // swap worlds: Uranus -> Saturn
      uranusGroup.visible = false;
      saturnGroup.visible = true;
      setLightingMode('saturn');
      setUranusDistant();
      setSaturnLooming();
      worldBounds = { w: SWORLD_W, d: SWORLD_D, radius: PLANET_RADIUS_SATURN };
      missionStage = 'saturn';
      GRAVITY = WORLD_GRAVITY.saturn;
      // boss/bossMesh stay pointed at the (defeated) Uranus alien and are
      // simply unused during the swarm fight; bossGroup is repointed at
      // saturnGroup so shared effects (tracers/sparks/plasma waves) parent
      // into the right, visible world group.
      bossGroup = saturnGroup;
      player.x = SWORLD_W/2; player.z = 15; player.y = 0; player.vy = 0;
      player.facing = 0; pitch = 0.32;
      miniAliens.forEach((m)=>{
        m.x = SWORLD_W/2 + Math.cos(m.homeAng)*24;
        m.z = SWORLD_D/2 + Math.sin(m.homeAng)*24;
        m.health = m.maxHealth;
        m.alive = false; m.dying = false; m.dyingT = 0;
        m.attackCooldown = 0;
        placeOnSphere(m.mesh, currentFrame(m.x, m.z), 0, m.homeAng);
        m.mesh.scale.set(0.001, 0.001, 0.001);
        m.mesh.visible = true;
      });
      alienBarInner.style.width = '100%';
      transition3Phase = 1; transition3T = 0;
    }
  } else if(transition3Phase === 1){
    const t = Math.min(1, transition3T/TRANSITION3_DURATIONS[1]);
    fadeOverlay.style.opacity = 1-t;
    if(transition3T >= TRANSITION3_DURATIONS[1]){
      transition3Phase = 2; transition3T = 0;
      showMessage('Llegada a Saturno. Un enjambre emerge entre los anillos...', 3.0);
    }
  } else if(transition3Phase === 2){
    if(transition3T >= TRANSITION3_DURATIONS[2]){
      transition3Phase = 3; transition3T = 0;
    }
  } else if(transition3Phase === 3){
    const t = Math.min(1, transition3T/TRANSITION3_DURATIONS[3]);
    for(let i=0;i<miniAliens.length;i++){
      const m = miniAliens[i];
      const delay = (i/miniAliens.length)*0.5; // stagger the reveal around the ring
      const localT = Math.max(0, Math.min(1, (t-delay)/(1-delay)));
      const s = localT*localT*(3-2*localT); // smoothstep
      placeOnSphere(m.mesh, currentFrame(m.x, m.z), Math.sin(m.bobT)*0.18, m.homeAng);
      m.mesh.scale.setScalar(Math.max(0.001, s) * m.scale);
    }
    if(transition3T >= TRANSITION3_DURATIONS[3]){
      miniAliens.forEach(m=>{ m.alive = true; m.dying = false; m.attackCooldown = 0.6; });
      alienHud.style.display = 'block';
      updateSaturnSwarmHud();
      state = 'combat';
      robotShouldShow = true;
      // same trick as Jupiter/Uranus: recede the "looming" close-up back out
      // to a normal distant backdrop now that the actual fight starts.
      setSaturnDistant();
      placeOnSphere(robot, currentFrame(player.x, player.z), player.y + ROBOT_Y_OFFSET, player.facing);
      camera.up.copy(currentFrame(player.x, player.z).up);
      updatePointerHint();
      showMessage('¡El enjambre de Saturno ataca! Son 12 — no dejes que te rodeen.', 4.0);
    }
  }
}

function resetGame(){
  parts.forEach((p)=>{ p.collected=false; p.mesh.visible = true; });
  collectedCount = 0;
  partsCountEl.textContent = '0 / ' + TOTAL_PARTS;
  player.x = capsulePos.x; player.z = capsulePos.z+8; player.energy = 100;
  player.y = 0; player.vy = 0; player.grounded = true;
  player.facing = Math.PI; player.hasCannon = false;
  pitch = 0.32;
  robotShouldShow = false;
  firstPartMsgShown = false; halfwayMsgShown = false; allCollectedMsgShown = false;

  europaGroup.visible = true; jupiterGroup.visible = false; uranusGroup.visible = false; saturnGroup.visible = false;
  setLightingMode('europa'); setJupiterDistant(); setUranusDistant(); setSaturnDistant();
  worldBounds = { w: WORLD_W, d: WORLD_D, radius: PLANET_RADIUS_EUROPA };
  missionStage = 'europa';
  GRAVITY = WORLD_GRAVITY.europa;
  transitionPhase = 0; transitionT = 0;
  transition2Phase = 0; transition2T = 0;
  transition3Phase = 0; transition3T = 0; saturnVictoryT = 0;
  setCapsuleHeight(2.6);
  capsuleMesh.userData.engineMat.color.set(0x552222);
  capsuleMesh.userData.engineMat.emissive.set(0xff2200);
  capsuleMesh.userData.engineMat.emissiveIntensity = 0.35;
  fadeOverlay.style.opacity = 0;
  alienJ.alive = false; alienJ.health = alienJ.maxHealth;
  alienU.alive = false; alienU.health = alienU.maxHealth;
  alienMeshJ.visible = false; alienMeshU.visible = false;
  miniAliens.forEach((m)=>{
    m.health = m.maxHealth; m.alive = false; m.dying = false; m.dyingT = 0; m.attackCooldown = 0;
    m.mesh.visible = false; m.mesh.scale.setScalar(m.scale);
  });
  boss = alienJ; bossMesh = alienMeshJ; bossGroup = jupiterGroup;
  rewardKind = 'cannon'; rewardPhase = 0; rewardT = 0;
  alienHud.style.display = 'none';
  if(alienLabelEl) alienLabelEl.textContent = 'CRIATURA ALIENÍGENA';
  robot.userData.wristBlaster.visible = true;
  robot.userData.plasmaCannon.visible = false;
  alienBolts.forEach(b=>{ b.mesh.parent && b.mesh.parent.remove(b.mesh); });
  alienBolts = [];

  document.querySelector('.title').textContent = 'EUROPA';
  document.querySelector('.subtitle').textContent = 'PRIMER CONTACTO — AÑO 2025 · MODO 3D';
  storyText.innerHTML = 'EXP‑07 desciende nuevamente sobre Europa a buscar las piezas de su nave.';
  startBtn.textContent = 'Iniciar descenso';
  startGame();
}

function showWinScreen(){
  hud.style.display = 'none';
  mmCanvas.style.display = 'none';
  alienHud.style.display = 'none';
  crosshair.style.display = 'none';
  document.getElementById('pointerHint').style.display = 'none';
  if(document.exitPointerLock && isPointerLocked()) document.exitPointerLock();
  overlay.classList.remove('hidden');
  storyText.innerHTML = `EXP‑07 derrotó a la criatura de las nubes de Júpiter y se quedó con un <b>Cañón de Plasma</b> propio, fusionado a su brazo derecho. Con él, se internó hasta Urano y enfrentó a una segunda criatura, mucho más grande y letal — y también la derrotó.<br><br>
  Como última prueba, la nave lo llevó hasta Saturno, donde un <b>enjambre de 12 criaturas</b> lo esperaba entre los anillos y el cinturón de asteroides — EXP‑07 los eliminó a todos, uno por uno.<br><br>
  La misión de primer contacto concluye con más preguntas que respuestas... y un robot que volvió mucho más fuerte de lo que partió.<br><br>
  <span class="small">Gracias por jugar el prototipo 3D — EUROPA: PRIMER CONTACTO.</span>`;
  document.querySelector('.title').textContent = 'MISIÓN CUMPLIDA';
  document.querySelector('.subtitle').textContent = '';
  startBtn.textContent = 'Jugar de nuevo';
  document.querySelector('.hint').textContent = '';
}
function showGameOverScreen(){
  hud.style.display = 'none';
  mmCanvas.style.display = 'none';
  alienHud.style.display = 'none';
  crosshair.style.display = 'none';
  document.getElementById('pointerHint').style.display = 'none';
  if(document.exitPointerLock && isPointerLocked()) document.exitPointerLock();
  overlay.classList.remove('hidden');
  storyText.innerHTML = deathCause === 'alien'
    ? `Las baterías de EXP‑07 se agotaron bajo el fuego de plasma de la criatura alienígena.<br><br><span class="small">Esquivá los disparos moviéndote y saltando, y respondé con tu propio cañón.</span>`
    : `Las baterías de EXP‑07 se agotaron en el hielo de Europa.<br><br><span class="small">Evitá las grietas oscuras: saltá para cruzarlas sin daño.</span>`;
  document.querySelector('.title').textContent = 'ENERGÍA AGOTADA';
  document.querySelector('.subtitle').textContent = '';
  startBtn.textContent = 'Reintentar';
  document.querySelector('.hint').textContent = '';
}

// ============================================================
// UPDATE
// ============================================================
function update(dt){
  updatePointerHint();
  if(msgTimer > 0){
    msgTimer -= dt;
    if(msgTimer <= 0) msgBox.classList.remove('show');
  }

  if(state === 'intro'){
    introT += dt;
    const t = Math.min(1, introT/introDuration);
    const ease = 1 - Math.pow(1-t, 3);
    setCapsuleHeight(2.6 + (1-ease)*90);
    const camT = t;
    const cf = capsuleMesh.userData.frame.pos;
    camera.position.set(cf.x - 20 + camT*4, cf.y + 18 - camT*10, cf.z + 26 - camT*8);
    camera.lookAt(capsuleMesh.position);
    if(introT >= introDuration){
      setCapsuleHeight(2.6);
      state = 'playing';
      robotShouldShow = true;
      placeOnSphere(robot, currentFrame(player.x, player.z), player.y + ROBOT_Y_OFFSET, player.facing);
      camera.up.copy(currentFrame(player.x, player.z).up);
      updatePointerHint();
      showMessage('Sistemas en línea. Energía al 100%. Localizá las 10 piezas de la nave dispersas por el hielo.', 4.8);
    }
    return;
  }

  if(state === 'transition'){ handleTransition(dt); return; }
  if(state === 'transition2'){ handleTransition2(dt); return; }
  if(state === 'transition3'){ handleTransition3(dt); return; }
  if(state === 'reward'){ handleReward(dt); }
  if(state === 'saturnVictory'){
    saturnVictoryT += dt;
    updateMiniAliens(dt);
    if(saturnVictoryT >= 1.8){
      state = 'win';
      showWinScreen();
      return;
    }
  }

  if(state !== 'playing' && state !== 'combat' && state !== 'reward' && state !== 'saturnVictory') return;

  if(shootCooldown > 0) shootCooldown -= dt;

  if(state === 'playing' || state === 'combat'){
    // ---- movement: Minecraft-style, relative to camera/player yaw ----
    const fwdX = Math.sin(player.facing), fwdZ = Math.cos(player.facing);
    const rightX = -Math.cos(player.facing), rightZ = Math.sin(player.facing);
    let mx=0, mz=0;
    if(keys['arrowup']||keys['w']) mz += 1;
    if(keys['arrowdown']||keys['s']) mz -= 1;
    if(keys['arrowright']||keys['d']) mx += 1;
    if(keys['arrowleft']||keys['a']) mx -= 1;
    const moving = mx!==0 || mz!==0;
    player.moving = moving;
    if(moving){
      const len = Math.hypot(mx,mz) || 1;
      mx/=len; mz/=len;
      const dx = (fwdX*mz + rightX*mx);
      const dz = (fwdZ*mz + rightZ*mx);
      const nx = player.x + dx*player.speed*dt;
      const nz = player.z + dz*player.speed*dt;
      if(!collidesRock(nx, player.z)) player.x = nx;
      if(!collidesRock(player.x, nz)) player.z = nz;
      const clamped = clampToWorld(player.x, player.z);
      player.x = clamped[0]; player.z = clamped[1];
      player.walkPhase += dt*9;
    }

    // ---- jump & gravity ----
    if(player.grounded && keys[' ']){
      player.vy = JUMP_SPEED;
      player.grounded = false;
    }
    player.vy += GRAVITY*dt;
    player.y += player.vy*dt;
    if(player.y <= GROUND_Y){
      player.y = GROUND_Y;
      player.vy = 0;
      player.grounded = true;
    }
  }

  if(player.invuln > 0) player.invuln -= dt;

  if(state === 'playing'){
    const airborne = player.y > 0.65;
    for(const hz of hazards){
      if(!airborne && pointInCrevice(player.x, player.z, hz) && player.invuln <= 0){
        player.energy = Math.max(0, player.energy - 18);
        player.invuln = 1.2;
        sfxHazard();
        showMessage('¡Grieta de hielo! Energía dañada.', 2.2);
        const dx = player.x-hz.cx, dz = player.z-hz.cz;
        const cos = Math.cos(-hz.rot), sin = Math.sin(-hz.rot);
        let lx = dx*cos - dz*sin;
        const lz = dx*sin + dz*cos;
        const sign = lx >= 0 ? 1 : -1;
        lx = sign * (hz.w/2 + 2.5);
        const wcos = Math.cos(hz.rot), wsin = Math.sin(hz.rot);
        player.x = hz.cx + (lx*wcos - lz*wsin);
        player.z = hz.cz + (lx*wsin + lz*wcos);
        const clamped = clampToWorld(player.x, player.z);
        player.x = clamped[0]; player.z = clamped[1];
        break;
      }
    }

    for(const p of parts){
      p.pulse += dt*3;
      if(!p.collected){
        p.spin += dt*1.2;
        placeOnSphere(p.mesh, currentFrame(p.x, p.z), 1.4 + Math.sin(p.pulse)*0.22, p.spin);
        const d = Math.hypot(player.x-p.x, player.z-p.z);
        if(d < 2.6){
          p.collected = true;
          p.mesh.visible = false;
          collectedCount++;
          sfxPickup();
          partsCountEl.textContent = collectedCount + ' / ' + TOTAL_PARTS;
          player.energy = Math.min(100, player.energy + 5);
          if(!firstPartMsgShown){
            firstPartMsgShown = true;
            showMessage('Pieza de la nave recuperada.', 2.6);
          } else if(collectedCount === Math.ceil(TOTAL_PARTS/2) && !halfwayMsgShown){
            halfwayMsgShown = true;
            showMessage('Mitad del camino. Llevá las piezas de vuelta a la cápsula cuando tengas las 10.', 3.2);
          } else if(collectedAll() && !allCollectedMsgShown){
            allCollectedMsgShown = true;
            showMessage('¡Las 10 piezas recolectadas! Volvé a la cápsula para reparar el motor.', 3.6);
          }
        }
      }
    }

    const dCapsule = Math.hypot(player.x-capsulePos.x, player.z-capsulePos.z);
    if(dCapsule < 6.5){
      if(collectedAll()){
        beginTransition();
      } else if(msgTimer <= 0){
        showMessage('Cápsula en reparación. Piezas necesarias: ' + (TOTAL_PARTS-collectedCount), 2.4);
      }
    }
  }

  if(state === 'combat'){
    if(missionStage === 'saturn'){
      updateMiniAliens(dt);
    } else {
      updateAlien(dt);
      updateAlienBolts(dt);
    }
    if(player.energy <= 0){
      deathCause = 'alien';
      state = 'gameover';
      showGameOverScreen();
    }
  }

  if(state === 'playing' && player.energy <= 0){
    deathCause = 'ice';
    state = 'gameover';
    showGameOverScreen();
  }

  updateEffects(dt);

  // ---- energy regen when not taking damage ----
  if(player.invuln <= 0){
    player.energy = Math.min(100, player.energy + dt*1.2);
  }
  energyBarInner.style.width = player.energy + '%';
  energyBarInner.style.background = player.energy < 30
    ? 'linear-gradient(90deg,#ff5c5c,#ffb454)'
    : 'linear-gradient(90deg,#3fe0a0,#4fd8ff)';

  // ---- animate robot ----
  // ROBOT_Y_OFFSET corrects the leg geometry so the feet actually touch the
  // ground instead of sinking into it (the leg segments' pivot math left a gap).
  const groundFrame = currentFrame(player.x, player.z);
  placeOnSphere(robot, groundFrame, player.y + ROBOT_Y_OFFSET, player.facing);
  const ud = robot.userData;
  const swing = player.moving && player.grounded ? Math.sin(player.walkPhase) : 0;
  ud.legL.rotation.x = swing*0.6;
  ud.legR.rotation.x = -swing*0.6;
  ud.armL.rotation.x = -swing*0.5;
  ud.armR.rotation.x = player.hasCannon ? -0.25 : swing*0.5;
  const flicker = player.invuln > 0 && Math.floor(player.invuln*10)%2===0;
  robot.visible = robotShouldShow && !flicker;

  // ---- capsule engine idle flicker (pre-repair) ----
  if(state === 'playing'){
    capsuleMesh.userData.engineMat.emissiveIntensity = 0.3 + Math.sin(performanceT*6)*0.08;
  }

  // ---- camera: looks in the true yaw/pitch aim direction (not fixed on the player)
  // so the crosshair and hitscan shooting always agree with what's on screen.
  // On the curved world "forward/right/up" are the player's LOCAL tangent
  // basis (from groundFrame), not fixed world axes — this is what makes the
  // camera stay correctly oriented (feet-down) as you walk around the sphere.
  const baseUp = groundFrame.up;
  const baseFwd = new THREE.Vector3(0,0,1).applyQuaternion(groundFrame.quat);
  const baseRight = new THREE.Vector3(1,0,0).applyQuaternion(groundFrame.quat);
  const yawFwd = baseFwd.clone().multiplyScalar(Math.cos(player.facing)).addScaledVector(baseRight, Math.sin(player.facing));
  const forward = yawFwd.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(baseUp, Math.sin(pitch)).normalize();
  const anchor = groundFrame.pos.clone().addScaledVector(baseUp, player.y + CAM_BASE_HEIGHT);
  const desiredCamPos = anchor.clone().sub(forward.clone().multiplyScalar(CAM_DIST));
  // never let the camera dip below/near the local ground — at steep pitch
  // angles the orbit math could otherwise place it under the terrain,
  // rendering as black (the ground's backface isn't drawn from underneath).
  const camHeightAboveGround = desiredCamPos.clone().sub(groundFrame.pos).dot(baseUp);
  if(camHeightAboveGround < CAM_MIN_Y){
    desiredCamPos.addScaledVector(baseUp, CAM_MIN_Y - camHeightAboveGround);
  }
  camera.position.lerp(desiredCamPos, Math.min(1, dt*10));
  camera.up.copy(baseUp);
  camera.lookAt(camera.position.clone().add(forward));

  crosshair.style.display = (state === 'combat' && isPointerLocked()) ? 'block' : 'none';
}
let performanceT = 0;

// ============================================================
// MINIMAP
// ============================================================
function drawMinimap(){
  if(state !== 'playing' && state !== 'combat') { return; }
  const mmW = mmCanvas.width, mmH = mmCanvas.height;
  const W = worldBounds.w;
  const D = worldBounds.d;
  mmCtx.clearRect(0,0,mmW,mmH);
  mmCtx.fillStyle = 'rgba(6,14,26,0.75)';
  mmCtx.fillRect(0,0,mmW,mmH);
  mmCtx.strokeStyle = 'rgba(79,216,255,0.5)';
  mmCtx.strokeRect(0,0,mmW,mmH);
  const sx = mmW/W, sy = mmH/D;
  if(state === 'playing'){
    parts.forEach(p=>{
      if(!p.collected){
        mmCtx.fillStyle = '#ffb454';
        mmCtx.beginPath();
        mmCtx.arc(p.x*sx, p.z*sy, 2.2, 0, Math.PI*2);
        mmCtx.fill();
      }
    });
    mmCtx.fillStyle = collectedAll() ? '#4fd8ff' : '#7ea9c2';
    mmCtx.beginPath();
    mmCtx.arc(capsulePos.x*sx, capsulePos.z*sy, 3, 0, Math.PI*2);
    mmCtx.fill();
  } else if(state === 'combat' && missionStage === 'saturn'){
    mmCtx.fillStyle = '#ff3c6e';
    for(const m of miniAliens){
      if(!m.alive) continue;
      mmCtx.beginPath();
      mmCtx.arc(m.x*sx, m.z*sy, 2.2, 0, Math.PI*2);
      mmCtx.fill();
    }
  } else if(state === 'combat' && boss.alive){
    mmCtx.fillStyle = '#ff3c6e';
    mmCtx.beginPath();
    mmCtx.arc(boss.x*sx, boss.z*sy, 3, 0, Math.PI*2);
    mmCtx.fill();
  }
  mmCtx.save();
  mmCtx.translate(player.x*sx, player.z*sy);
  mmCtx.rotate(player.facing);
  mmCtx.fillStyle = '#fff';
  mmCtx.beginPath();
  mmCtx.moveTo(0,-4); mmCtx.lineTo(3,3); mmCtx.lineTo(-3,3);
  mmCtx.closePath();
  mmCtx.fill();
  mmCtx.restore();
}

// ============================================================
// MAIN LOOP
// ============================================================
function loop(ts){
  if(!last) last = ts;
  const dt = Math.min(0.05, (ts-last)/1000);
  last = ts;
  performanceT += dt;
  update(dt);
  drawMinimap();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

camera.position.set(30, 22, 50);
camera.lookAt(60, 0, 60);

requestAnimationFrame(loop);

window.__debug = {
  player, parts, hazards, alienBolts, camera,
  alienJ, alienU, alienMeshJ, alienMeshU, miniAliens,
  getBoss: ()=>boss, getBossMesh: ()=>bossMesh,
  getMissionStage: ()=>missionStage,
  getGravity: ()=>GRAVITY,
  getJumpSpeed: ()=>JUMP_SPEED,
  getState: ()=>state,
  setState: (s)=>{ state = s; },
  getPitch: ()=>pitch, setPitch: (v)=>{ pitch = v; },
  damageAlien, firePlayerWeapon, beginTransition, beginTransitionToUranus, beginTransitionToSaturn,
  damageMiniAlien,
  getSaturnAliveCount: ()=>miniAliens.filter(m=>m.alive).length,
  getTransition3: ()=>({ phase: transition3Phase, t: transition3T, rewardPhase, rewardT, rewardKind }),
  collectedCount: ()=>collectedCount,
  screenXOf: (x,y,z)=>{
    const v = new THREE.Vector3(x,y,z).project(camera);
    return v.x; // -1 (left edge) .. 1 (right edge)
  },
  currentFrame, sphereFrame, getWorldBounds: ()=>worldBounds,
  ground, europaMoonProp, scene, capsuleMesh,
  jupiterPlanet, uranusPlanet, sunGroup, mercuryProp, venusProp, earthProp, marsProp, saturnProp, neptuneProp,
  europaGroup, jupiterGroup, uranusGroup, saturnGroup, rockGroup, robot,
};

})();

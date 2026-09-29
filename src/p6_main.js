/* =====================================================================
   PART 6 — ride timing, cameras that follow the bends, HUD, interaction, main loop
   ===================================================================== */

/* ---- ride profile: ease in, cruise, ease out. Cruise speed is chosen so the whole road
        takes TARGET_T seconds (default 90). Everything else is a pure function of time. ---- */
const RIDE_TA = 1.6, RIDE_TD = 3.0;
const RIDE_D = RIDE.sEnd - RIDE.sStart;
const RIDE_V = clamp(RIDE_D / (TARGET_T - 0.5 * (RIDE_TA + RIDE_TD)), 5.5, 13);
const RIDE_SA = 0.5 * RIDE_V * RIDE_TA, RIDE_SD = 0.5 * RIDE_V * RIDE_TD;
const RIDE_SC = Math.max(0, RIDE_D - RIDE_SA - RIDE_SD), RIDE_TC = RIDE_SC / RIDE_V;
const RIDE_T = RIDE_TA + RIDE_TC + RIDE_TD;
const GEAR = BK.cogTeeth / BK.chainringTeeth;

function distAt(t) {
  if (t <= 0) return { d: 0, v: 0 };
  if (t < RIDE_TA) { const u = t / RIDE_TA; return { d: RIDE_V * RIDE_TA * (u * u * u - u * u * u * u / 2), v: RIDE_V * (3 * u * u - 2 * u * u * u) }; }
  if (t < RIDE_TA + RIDE_TC) return { d: RIDE_SA + RIDE_V * (t - RIDE_TA), v: RIDE_V };
  if (t < RIDE_T) { const w = (t - RIDE_TA - RIDE_TC) / RIDE_TD; return { d: RIDE_SA + RIDE_SC + RIDE_V * RIDE_TD * (w - w * w * w + w * w * w * w / 2), v: RIDE_V * (1 - 3 * w * w + 2 * w * w * w) }; }
  return { d: RIDE_D, v: 0 };
}
function timeAtDist(d) {                                    // inverse of distAt (monotone) by bisection
  let lo = 0, hi = RIDE_T;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (distAt(mid).d < d) lo = mid; else hi = mid; }
  return hi;
}
/* the pelican stops pedalling shortly after braking starts, and the crank eases to a level stop */
const T_COAST = RIDE_TA + RIDE_TC + 0.35 * RIDE_TD;
const _c0 = distAt(T_COAST);
const CR_THETA = (_c0.d / BK.wheelR) * GEAR, CR_OMEGA = (_c0.v / BK.wheelR) * GEAR;
const CR_END = Math.ceil((CR_THETA + 0.9) / Math.PI) * Math.PI, CR_TS = (CR_END - CR_THETA) / Math.max(CR_OMEGA, 1e-3);
function crankAt(t, dist) {
  if (t <= T_COAST) return (dist / BK.wheelR) * GEAR;
  return CR_THETA + CR_OMEGA * CR_TS * (1 - Math.exp(-(t - T_COAST) / CR_TS));
}

const _road = {};
function stateAt(t) {
  const { d, v } = distAt(t);
  const th = crankAt(t, d), wind = clamp(v / RIDE_V, 0, 1);
  const s = RIDE.sStart + d, r = roadAt(s, _road);
  // lean into the bend: tan(lean) = v^2 * curvature / g  (slightly under-done so it stays graceful)
  const lean = Math.atan(v * v * r.k / 9.81) * 0.8;
  return {
    time: t, dist: d, speed: v, s, road: r,
    wheelAngle: d / BK.wheelR, wheelOmega: v / BK.wheelR,
    crankAngle: th,
    steer: (0.05 * Math.sin(th + 0.5) + 0.012 * Math.sin(t * 0.6)) * wind - 1.3 * r.k * wind,
    roll: lean + (0.028 * Math.sin(th + 0.5) + 0.008 * Math.sin(t * 0.6)) * wind,
    yaw: (0.018 * Math.sin(th + 1.7) + 0.02 * Math.sin(t * 0.55 + 1)) * wind,
    lateral: 0.10 * Math.sin(t * 0.55) * wind,
  };
}

/* ---- camera rigs: everything is expressed in the rider's own frame (right, forward) ---- */
const focus = new V3(), camPos = new V3(), camLook = new V3(), rigPos = new V3();
const _F = new V3(), _R = new V3(), _sg = new V3(), _ahead = new V3();
const rel = (out, p, r, y, f) => out.set(p.x + _R.x * r + _F.x * f, y, p.z + _R.z * r + _F.z * f);
function nextSign(s) { for (let i = 0; i < AGENTS.length; i++) if (AGENTS[i].s > s + 6) return AGENTS[i]; return null; }

const CAMS = {
  chase: (p, st, o) => { rel(o.pos, p, -0.95, 1.55, -4.0); rel(o.look, p, 0.25, 1.15, 7.5); o.fov = 55; o.kl = 6; },
  /* looks along the road but leans toward the next sign as it approaches */
  ahead: (p, st, o) => {
    rel(o.pos, p, -1.2, 1.9, -4.7); rel(_ahead, p, 0.2, 1.3, 9);
    const sg = nextSign(st.s);
    if (sg) {
      const dd = sg.s - st.s, w = 0.6 * smooth(52, 12, dd);
      _sg.copy(sg.center); _sg.y = Math.min(sg.center.y, 3.2);
      o.look.lerpVectors(_ahead, _sg, w);
    } else o.look.copy(_ahead);
    o.fov = 58; o.kl = 2.4;
  },
  side:  (p, st, o) => { rel(o.pos, p, -3.4, 1.15, -0.4); rel(o.look, p, 0, 1.0, -0.1); o.fov = 50; o.kl = 6; },
  front: (p, st, o) => { rel(o.pos, p, -0.5, 0.9, 4.6); rel(o.look, p, 0, 1.2, 0); o.fov = 54; o.kl = 6; },
  wide:  (p, st, o) => { rel(o.pos, p, -5.6, 3.1, -6.8); rel(o.look, p, 1.0, 1.2, 4.5); o.fov = 56; o.kl = 4; },
  hero:  (p, st, o) => { rel(o.pos, p, -3.0, 0.75, -3.3); rel(o.look, p, 0, 1.2, 0); o.fov = 46; o.kl = 6; },
};
let camMode = 'chase', autoShown = 'chase';
const AUTO_CYCLE = [['ahead', 9], ['side', 3.6], ['chase', 7], ['front', 3], ['ahead', 9], ['wide', 5], ['hero', 3.4]];
const AUTO_LEN = AUTO_CYCLE.reduce((a, c) => a + c[1], 0);
function autoPick(t) {
  if (t > RIDE_T - 4.5) return 'hero';
  let u = t % AUTO_LEN;
  for (const [m, d] of AUTO_CYCLE) { if (u < d) return m; u -= d; }
  return 'ahead';
}
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enabled = false;
controls.minDistance = 1.2; controls.maxDistance = 90; controls.maxPolarAngle = Math.PI * 0.495;

const _o = { pos: new V3(), look: new V3(), fov: 52, kl: 6 };
let camFrozen = false;                                     // test hook: leave the camera exactly where it is
function updateCamera(st, dt, snap) {
  if (camFrozen) return;
  const p = rigPos, r = st.road;
  _F.set(r.fx, 0, r.fz); _R.set(r.rx, 0, r.rz);
  if (camMode === 'free') {
    focus.set(p.x, 1.05, p.z);
    const delta = focus.clone().sub(controls.target);
    camera.position.add(delta); controls.target.copy(focus);
    controls.update();
    camera.fov += (52 - camera.fov) * 0.1;
  } else {
    const m = camMode === 'auto' ? autoPick(st.time) : camMode;
    autoShown = m;
    CAMS[m](p, st, _o);
    if (snap) { camPos.copy(_o.pos); camLook.copy(_o.look); camera.fov = _o.fov; }
    else {
      const kp = 1 - Math.exp(-dt * 3.2), kl = 1 - Math.exp(-dt * _o.kl);
      camPos.lerp(_o.pos, kp); camLook.lerp(_o.look, kl); camera.fov += (_o.fov - camera.fov) * kp;
    }
    camera.position.copy(camPos); camera.lookAt(camLook);
  }
  camera.updateProjectionMatrix();
  sky.position.copy(camera.position);                     // sky and mountains travel with the camera
  ridge.position.set(camera.position.x, 0, camera.position.z);
}

/* ---- HUD ---- */
const $ = (id) => document.getElementById(id);
const hud = { date: $('dateVal'), sub: $('dateSub'), tip: $('tip') };
let lastPassed = -2;
function updateHud(st) {
  hud.date.textContent = fmtDays(dateAtS(st.s));
  let passed = -1;
  for (let i = 0; i < AGENTS.length; i++) if (AGENTS[i].s <= st.s + 3) passed = i;
  if (passed !== lastPassed) {
    lastPassed = passed;
    hud.sub.textContent = passed >= 0 ? (passed + 1) + ' / ' + AGENTS.length + '  ·  ' + AGENTS[passed].name : 'start of the road';
  }
}

/* ---- state application ---- */
let simT = 0, playing = true;
function applyState(t, snap, dt) {
  const st = stateAt(t), r = st.road;
  poseBike(st); posePelican(st);
  const off = RIDER_X + st.lateral;
  bike.rig.rotation.order = 'YXZ';
  bike.rig.rotation.set(st.roll, Math.PI / 2 - r.th + st.yaw, 0);
  bike.rig.position.set(r.x + r.rx * off, 0, r.z + r.rz * off);
  rigPos.copy(bike.rig.position);
  updateSun(rigPos.x + r.fx * 10, rigPos.z + r.fz * 10);
  window.__clouds.forEach((c) => { const lo = WB.minX - 400, span = WB.maxX + 800 - lo; c.position.x = lo + ((c.userData.x0 - lo + c.userData.speed * t) % span + span) % span; });
  updateCamera(st, dt || 0.016, snap);
  updateHud(st);
}

/* ---- controls ---- */
function setMode(m) {
  camMode = m;
  controls.enabled = m === 'free';
  if (m === 'free') { controls.target.set(rigPos.x, 1.05, rigPos.z); }
}
function setPlaying(p) { playing = p; }
function restart() { simT = 0; applyState(0, true, 0); setPlaying(true); }
function togglePlay() {
  if (!playing && simT >= RIDE_T + 1.1) { restart(); return; }
  setPlaying(!playing);
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'r' || e.key === 'R') restart();
  else if (e.key >= '1' && e.key <= '5') setMode(['chase', 'auto', 'side', 'front', 'free'][Number(e.key) - 1]);
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { simT = clamp(simT + (e.key === 'ArrowRight' ? 5 : -5), 0, RIDE_T); }
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---- hover tooltip on signs ---- */
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let mouseDown = false, mx = 0, my = 0, tipDirty = false;
renderer.domElement.addEventListener('pointerdown', () => { mouseDown = true; hud.tip.style.opacity = 0; });
window.addEventListener('pointerup', () => { mouseDown = false; });
renderer.domElement.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; tipDirty = true; });
renderer.domElement.addEventListener('pointerleave', () => { hud.tip.style.opacity = 0; });
function updateTip() {
  if (!tipDirty || mouseDown) return;
  tipDirty = false;
  mouse.set((mx / window.innerWidth) * 2 - 1, -(my / window.innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(signHits, false)[0];
  if (!hit || hit.distance > 90) { hud.tip.style.opacity = 0; return; }
  const a = hit.object.userData.agent;
  hud.tip.innerHTML = '<b>' + a.name + '</b><span>' + a.dateStr + (a.est ? ' (estimate)' : '') + '</span><em>' + a.note + '</em><small>' + CATEGORY[a.cat].label + '</small>';
  hud.tip.style.left = Math.min(mx + 16, window.innerWidth - 250) + 'px';
  hud.tip.style.top = Math.min(my + 16, window.innerHeight - 110) + 'px';
  hud.tip.style.opacity = 1;
}

/* ---- main loop ---- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (playing) {
    simT += dt;
    if (simT >= RIDE_T + 1.1) { simT = RIDE_T + 1.1; setPlaying(false); }
  }
  applyState(simT, false, dt);
  updateTip();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
const MANUAL = qs.has('manual');
setMode('chase');
applyState(0, true, 0);
$('loading').style.display = 'none';
if (!MANUAL) requestAnimationFrame(frame);

/* debug / review hooks (used for test renders) */
window.__pelican = {
  duration: RIDE_T, speed: RIDE_V, camera, scene, agents: AGENTS, ride: RIDE, path: PATH,
  seek(t, mode) { if (mode) setMode(mode); setPlaying(false); simT = t; applyState(t, true, 0); renderer.render(scene, camera); },
  /* jump to `off` metres before sign i (negative = after it) */
  seekSign(i, off, mode) { this.seek(timeAtDist(AGENTS[i].s - RIDE.sStart - off), mode); },
  /* free camera placed in the rider's frame: (right, up, forward) for eye and target */
  view(er, ey, ef, lr, ly, lf) {
    const r = stateAt(simT).road; _F.set(r.fx, 0, r.fz); _R.set(r.rx, 0, r.rz);
    rel(camera.position, rigPos, er, ey, ef); rel(_sg, rigPos, lr, ly, lf); camera.lookAt(_sg); renderer.render(scene, camera);
  },
  rider: () => rigPos.clone(),
  freeze(v) { camFrozen = v; },
  /* deterministic step used by the video exporter: pose for time t, camera smoothed by dt, then render once */
  frame(t, dt, snap) { simT = t; applyState(t, !!snap, dt); renderer.render(scene, camera); },
  /* same, without drawing: lets a worker run the camera smoothing up to its first frame */
  step(t, dt, snap) { simT = t; applyState(t, !!snap, dt); },
  rideT: RIDE_T,
};

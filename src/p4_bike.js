/* =====================================================================
   PART 4 — the bicycle (bike-local frame: +X forward, +Y up, +Z rider's right)
   ===================================================================== */
const V3 = THREE.Vector3, Q4 = THREE.Quaternion;
const Y_AXIS = new V3(0, 1, 0);

const BK = {
  wheelR: 0.34,
  rearAxle: new V3(-0.50, 0.34, 0),
  frontAxle: new V3(0.50, 0.34, 0),
  bb: new V3(0.0, 0.28, 0),
  chainringR: 0.098, cogR: 0.039, chainringTeeth: 46, cogTeeth: 17,
  crankLen: 0.17, crankZ: 0.07, pedalZ: 0.115, chainZ: 0.06,
  headDir: new V3(-Math.cos(72 * Math.PI / 180), Math.sin(72 * Math.PI / 180), 0),
  seatDir: new V3(-Math.cos(73 * Math.PI / 180), Math.sin(73 * Math.PI / 180), 0),
};
BK.crown = BK.frontAxle.clone().addScaledVector(BK.headDir, 0.36);
BK.headTop = BK.crown.clone().addScaledVector(BK.headDir, 0.13);
BK.steererTop = BK.headTop.clone().addScaledVector(BK.headDir, 0.06);
BK.stemEnd = BK.steererTop.clone().add(new V3(0.062, 0.02, 0));
BK.seatTop = BK.bb.clone().addScaledVector(BK.seatDir, 0.50);
BK.saddlePost = BK.seatTop.clone().addScaledVector(BK.seatDir, 0.13);
BK.saddleCenter = new V3(BK.saddlePost.x + 0.03, BK.saddlePost.y + 0.045, 0);
BK.gripBase = BK.stemEnd.clone().add(new V3(0.105, -0.025, 0));   // hoods, z filled per side

const BM = {
  frame: new THREE.MeshStandardMaterial({ color: 0x12a39f, metalness: 0.55, roughness: 0.32 }),
  frameDark: new THREE.MeshStandardMaterial({ color: 0x0b6f6c, metalness: 0.5, roughness: 0.4 }),
  black: new THREE.MeshStandardMaterial({ color: 0x1b1d22, metalness: 0.3, roughness: 0.6 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x141416, metalness: 0.0, roughness: 0.92 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xcfd4da, metalness: 0.9, roughness: 0.22 }),
  darkSteel: new THREE.MeshStandardMaterial({ color: 0x3a3e46, metalness: 0.85, roughness: 0.4 }),
  leather: new THREE.MeshStandardMaterial({ color: 0x8a4b22, roughness: 0.7 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xff8a1f, roughness: 0.4, emissive: 0xff5a00, emissiveIntensity: 0.25 }),
  red: new THREE.MeshStandardMaterial({ color: 0xd9241c, roughness: 0.3, emissive: 0xd9241c, emissiveIntensity: 0.4 }),
};
const UNIT_CYL = new THREE.CylinderGeometry(1, 1, 1, 12);
const UNIT_SPHERE = new THREE.SphereGeometry(1, 16, 12);
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

/* cylinder between two points (unit cylinder scaled -> cheap, shareable geometry) */
function place(mesh, a, b, r) {
  const d = new V3().subVectors(b, a), len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, d.normalize());
  mesh.scale.set(r, len, r);
  return mesh;
}
function tubeBetween(parent, a, b, r, mat) {
  const m = place(new THREE.Mesh(UNIT_CYL, mat), a, b, r);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function ball(parent, p, r, mat) {
  const m = new THREE.Mesh(UNIT_SPHERE, mat); m.position.copy(p); m.scale.setScalar(r);
  m.castShadow = true; parent.add(m); return m;
}
const v3 = (x, y, z = 0) => new V3(x, y, z);

/* ---- wheel: tyre, rim, laced spokes, hub, reflector, motion-blur disc ---- */
function makeWheel() {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(BK.wheelR - 0.022, 0.022, 12, 72), BM.rubber);
  tire.castShadow = true; tire.receiveShadow = true; g.add(tire);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.297, 0.011, 8, 72), BM.steel);
  rim.scale.z = 2.2; rim.castShadow = true; g.add(rim);
  const hub = new THREE.Mesh(UNIT_CYL, BM.steel); hub.rotation.x = Math.PI / 2; hub.scale.set(0.02, 0.11, 0.02); g.add(hub);
  [-0.04, 0.04].forEach((z) => { const f = new THREE.Mesh(UNIT_CYL, BM.steel); f.rotation.x = Math.PI / 2; f.position.z = z; f.scale.set(0.034, 0.008, 0.034); g.add(f); });

  const N = 32, spokes = new THREE.InstancedMesh(UNIT_CYL, BM.steel, N), m4 = new THREE.Matrix4();
  const q = new Q4(), pos = new V3(), sc = new V3();
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2, side = k % 2 ? 0.04 : -0.04, lace = (k % 4 < 2 ? 0.55 : -0.55);
    const s0 = v3(Math.cos(a + lace) * 0.034, Math.sin(a + lace) * 0.034, side);
    const s1 = v3(Math.cos(a) * 0.296, Math.sin(a) * 0.296, 0);
    const d = new V3().subVectors(s1, s0), len = d.length();
    pos.copy(s0).addScaledVector(d, 0.5); q.setFromUnitVectors(Y_AXIS, d.normalize()); sc.set(0.0026, len, 0.0026);
    m4.compose(pos, q, sc); spokes.setMatrixAt(k, m4);
  }
  g.add(spokes);
  const refl = new THREE.Mesh(UNIT_BOX, BM.orange); refl.position.set(0.299, 0, 0); refl.scale.set(0.012, 0.03, 0.03); g.add(refl);
  const valve = new THREE.Mesh(UNIT_CYL, BM.steel); valve.position.set(0.0, 0.302, 0); valve.scale.set(0.004, 0.03, 0.004); g.add(valve);

  const blur = new THREE.Mesh(new THREE.CircleGeometry(0.296, 40),
    new THREE.MeshBasicMaterial({ color: 0x9aa0a8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  g.add(blur); g.userData.blur = blur;
  return g;
}

/* ---- toothed gear outline as an extruded shape (chainring / cog) ---- */
function gearMesh(teeth, rOuter, rRoot, holeR, depth, mat, spider) {
  const s = new THREE.Shape(), n = teeth * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, r = i % 2 ? rRoot : rOuter;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  if (holeR > 0) { const h = new THREE.Path(); h.absarc(0, 0, holeR, 0, Math.PI * 2, true); s.holes.push(h); }
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 4 }), mat);
  m.castShadow = true; m.position.z = -depth / 2;
  const g = new THREE.Group(); g.add(m);
  if (spider) for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3, arm = new THREE.Mesh(UNIT_BOX, mat);
    arm.position.set(Math.cos(a) * holeR * 0.55, Math.sin(a) * holeR * 0.55, 0);
    arm.rotation.z = a; arm.scale.set(holeR * 1.1, 0.012, depth); g.add(arm);
  }
  return g;
}

/* ---- chain: instanced links that ride a closed path (ring arc, top run, cog arc, bottom run) ---- */
function makeChain(parent) {
  const C1 = new V3(BK.bb.x, BK.bb.y, 0), C2 = new V3(BK.rearAxle.x, BK.rearAxle.y, 0);
  const r1 = BK.chainringR, r2 = BK.cogR;
  const dx = C1.x - C2.x, dy = C1.y - C2.y, d = Math.hypot(dx, dy);
  const alpha = Math.atan2(dy, dx), beta = Math.asin((r1 - r2) / d);
  const thTop = alpha + Math.PI / 2 + beta, thBot = alpha - (Math.PI / 2 + beta);
  const Lrun = Math.sqrt(d * d - (r1 - r2) * (r1 - r2));
  const Lring = r1 * (Math.PI + 2 * beta), Lcog = r2 * (Math.PI - 2 * beta);
  const L = 2 * Lrun + Lring + Lcog;
  const nTop = [Math.cos(thTop), Math.sin(thTop)], nBot = [Math.cos(thBot), Math.sin(thBot)];
  const P2t = [C2.x + r2 * nTop[0], C2.y + r2 * nTop[1]];
  const P1b = [C1.x + r1 * nBot[0], C1.y + r1 * nBot[1]];
  const s1 = Lrun, s2 = Lrun + Lring, s3 = 2 * Lrun + Lring;

  function sample(s, out) {                    // clockwise around the loop
    s = ((s % L) + L) % L;
    if (s < s1) { out.x = P2t[0] + s * nTop[1]; out.y = P2t[1] - s * nTop[0]; out.a = Math.atan2(-nTop[0], nTop[1]); }
    else if (s < s2) { const f = thTop - (s - s1) / r1; out.x = C1.x + r1 * Math.cos(f); out.y = C1.y + r1 * Math.sin(f); out.a = Math.atan2(-Math.cos(f), Math.sin(f)); }
    else if (s < s3) { const u = s - s2; out.x = P1b[0] + u * nBot[1]; out.y = P1b[1] - u * nBot[0]; out.a = Math.atan2(-nBot[0], nBot[1]); }
    else { const f = thBot - (s - s3) / r2; out.x = C2.x + r2 * Math.cos(f); out.y = C2.y + r2 * Math.sin(f); out.a = Math.atan2(-Math.cos(f), Math.sin(f)); }
    return out;
  }
  const count = Math.round(L / 0.0127), pitch = L / count;
  const links = new THREE.InstancedMesh(UNIT_BOX, BM.darkSteel, count);
  links.castShadow = false; links.frustumCulled = false; parent.add(links);
  const tmp = { x: 0, y: 0, a: 0 }, m4 = new THREE.Matrix4(), q = new Q4(), p = new V3(), sc = new V3(0.0105, 0.0072, 0.0058), ax = new V3(0, 0, 1);
  return {
    mesh: links, length: L,
    update(offset) {
      for (let i = 0; i < count; i++) {
        sample(offset + i * pitch, tmp);
        p.set(tmp.x, tmp.y, BK.chainZ); q.setFromAxisAngle(ax, tmp.a);
        sc.x = i % 2 ? 0.0112 : 0.0086;
        m4.compose(p, q, sc); links.setMatrixAt(i, m4);
      }
      links.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ---- assemble the bicycle ---- */
function buildBike() {
  const rig = new THREE.Group();
  const B = BK, T = (a, b, r, m = BM.frame) => tubeBetween(rig, a, b, r, m);

  // frame tubes
  const seatTubeMid = B.bb.clone().addScaledVector(B.seatDir, 0.44);
  const ttRear = B.bb.clone().addScaledVector(B.seatDir, 0.47), ttFront = B.crown.clone().addScaledVector(B.headDir, 0.09);
  const dtFront = B.crown.clone().addScaledVector(B.headDir, 0.03);
  T(B.bb, B.seatTop, 0.0175);                        // seat tube
  T(ttRear, ttFront, 0.0165);                        // top tube
  T(B.bb, dtFront, 0.0215);                          // down tube
  T(B.crown.clone().addScaledVector(B.headDir, 0.005), B.headTop, 0.0275, BM.frameDark);   // head tube
  T(B.bb, v3(B.rearAxle.x, B.rearAxle.y, 0.055), 0.0125); T(B.bb, v3(B.rearAxle.x, B.rearAxle.y, -0.055), 0.0125);   // chain stays
  T(seatTubeMid, v3(B.rearAxle.x, B.rearAxle.y, 0.052), 0.0095); T(seatTubeMid, v3(B.rearAxle.x, B.rearAxle.y, -0.052), 0.0095); // seat stays
  T(B.seatTop, B.saddlePost, 0.0135, BM.steel);      // seatpost
  [B.seatTop, ttFront, B.bb].forEach((p) => ball(rig, p, 0.021, BM.frame));

  // saddle
  const saddle = new THREE.Group(); saddle.position.copy(B.saddleCenter);
  const sBody = new THREE.Mesh(UNIT_SPHERE, BM.leather); sBody.scale.set(0.15, 0.03, 0.075); sBody.castShadow = true; saddle.add(sBody);
  const sNose = new THREE.Mesh(UNIT_SPHERE, BM.leather); sNose.position.set(0.11, 0.004, 0); sNose.scale.set(0.09, 0.024, 0.03); saddle.add(sNose);
  const sRail = new THREE.Mesh(UNIT_BOX, BM.steel); sRail.position.set(0.0, -0.03, 0); sRail.scale.set(0.2, 0.006, 0.06); saddle.add(sRail);
  rig.add(saddle);

  // bottle on the down tube
  const bA = B.bb.clone().add(v3(0.06, 0.05, 0.0)).add(v3(-0.03, 0.03, 0.05));
  const bB = bA.clone().add(v3(0.09, 0.15, 0));
  tubeBetween(rig, bA, bB, 0.027, BM.orange); tubeBetween(rig, bB.clone().add(v3(0.004, 0.012, 0)), bB.clone().add(v3(0.008, 0.03, 0)), 0.012, BM.black);

  // rear light
  const tail = new THREE.Mesh(UNIT_BOX, BM.red); tail.position.set(seatTubeMid.x - 0.03, seatTubeMid.y + 0.06, 0); tail.scale.set(0.02, 0.045, 0.03); rig.add(tail);

  // rear wheel + derailleur cage
  const rearWheel = makeWheel(); rearWheel.position.copy(B.rearAxle); rig.add(rearWheel);
  const cassette = new THREE.Group(); cassette.position.copy(B.rearAxle); rig.add(cassette);
  const cog = gearMesh(B.cogTeeth, B.cogR + 0.004, B.cogR - 0.004, 0.0, 0.006, BM.darkSteel, false);
  cog.position.z = B.chainZ; cassette.add(cog);
  [0.075, 0.09].forEach((z, i) => { const c = new THREE.Mesh(UNIT_CYL, BM.darkSteel); c.rotation.x = Math.PI / 2; c.position.z = z - 0.012; c.scale.set(0.05 - i * 0.008, 0.006, 0.05 - i * 0.008); cassette.add(c); });
  const cageA = B.rearAxle.clone().add(v3(-0.01, -0.035, 0.07)), cageB = B.rearAxle.clone().add(v3(-0.03, -0.11, 0.07));
  tubeBetween(rig, cageA, cageB, 0.007, BM.black); ball(rig, cageB, 0.016, BM.black);

  // crankset (turns as one) — right arm + chainring, left arm opposite
  const crank = new THREE.Group(); crank.position.copy(B.bb); rig.add(crank);
  const spindle = new THREE.Mesh(UNIT_CYL, BM.steel); spindle.rotation.x = Math.PI / 2; spindle.scale.set(0.014, 0.19, 0.014); crank.add(spindle);
  const ring = gearMesh(B.chainringTeeth, B.chainringR + 0.004, B.chainringR - 0.004, 0.072, 0.004, BM.darkSteel, true);
  ring.position.z = B.chainZ; crank.add(ring);
  const pedals = [];
  [1, -1].forEach((side) => {
    const armA = v3(0, 0, side * B.crankZ), armB = v3(side * B.crankLen, 0, side * B.crankZ);
    tubeBetween(crank, armA, armB, 0.0125, BM.black);
    const pedal = new THREE.Group(); pedal.position.set(side * B.crankLen, 0, side * B.pedalZ);
    const axle = new THREE.Mesh(UNIT_CYL, BM.steel); axle.rotation.x = Math.PI / 2; axle.position.z = -side * 0.02; axle.scale.set(0.007, 0.05, 0.007); pedal.add(axle);
    const plat = new THREE.Mesh(UNIT_BOX, BM.black); plat.scale.set(0.105, 0.02, 0.075); plat.castShadow = true; pedal.add(plat);
    crank.add(pedal); pedals.push(pedal);
  });

  // steering assembly (rotates about the head-tube axis through the fork crown)
  const steer = new THREE.Group(); steer.position.copy(B.crown); rig.add(steer);
  const rel = (p) => p.clone().sub(B.crown);
  const S = (a, b, r, m = BM.frame) => tubeBetween(steer, rel(a), rel(b), r, m);
  [1, -1].forEach((side) => S(v3(B.crown.x, B.crown.y, side * 0.058), v3(B.frontAxle.x, B.frontAxle.y, side * 0.05), 0.0135));
  const crownBar = new THREE.Mesh(UNIT_BOX, BM.frame); crownBar.scale.set(0.03, 0.026, 0.13); crownBar.castShadow = true; steer.add(crownBar);
  S(B.headTop, B.steererTop, 0.012, BM.steel);
  S(B.steererTop, B.stemEnd, 0.016, BM.black);
  const frontWheel = makeWheel(); frontWheel.position.copy(rel(B.frontAxle)); steer.add(frontWheel);

  // drop handlebar: tops across, then curves forward and down into hoods and drops
  const barMat = BM.black;
  S(B.stemEnd.clone().add(v3(0, 0, 0.205)), B.stemEnd.clone().add(v3(0, 0, -0.205)), 0.0115, barMat);
  [1, -1].forEach((side) => {
    const prof = [[0, 0], [0.05, 0.004], [0.10, -0.012], [0.15, -0.06], [0.16, -0.13], [0.12, -0.19], [0.04, -0.205], [-0.02, -0.18]];
    const curve = new THREE.CatmullRomCurve3(prof.map((p) => rel(B.stemEnd).add(v3(p[0], p[1], side * 0.205))));
    const t = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.0115, 8, false), barMat); t.castShadow = true; steer.add(t);
    const hood = new THREE.Mesh(UNIT_SPHERE, BM.black); hood.scale.set(0.055, 0.032, 0.026);
    hood.position.copy(rel(B.stemEnd)).add(v3(0.105, -0.02, side * 0.205)); hood.castShadow = true; steer.add(hood);
    const lever = new THREE.Mesh(UNIT_CYL, BM.darkSteel); lever.scale.set(0.005, 0.11, 0.005);
    place(lever, rel(B.stemEnd).add(v3(0.13, -0.045, side * 0.205)), rel(B.stemEnd).add(v3(0.075, -0.15, side * 0.205)), 0.005); steer.add(lever);
  });
  const bell = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), BM.steel);
  bell.scale.setScalar(0.024); bell.position.copy(rel(B.stemEnd)).add(v3(-0.01, 0.014, 0.09)); steer.add(bell);

  // front caliper brake
  const cal = new THREE.Mesh(UNIT_BOX, BM.darkSteel); cal.scale.set(0.025, 0.02, 0.11); cal.position.copy(rel(B.crown)).add(v3(0.01, -0.05, 0)); steer.add(cal);

  const chain = makeChain(rig);
  return { rig, steer, frontWheel, rearWheel, crank, pedals, cassette, chain, ring };
}

const bike = buildBike();
scene.add(bike.rig);

/* small procedural environment (sky + ground) so metal parts have something to reflect */
(function applyEnvironment() {
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(sky.geometry, sky.material));
  const gnd = new THREE.Mesh(new THREE.CircleGeometry(1500, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6a7a4a }));
  gnd.position.y = -30; envScene.add(gnd);
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(envScene, 0.02).texture;
  [BM.frame, BM.frameDark, BM.steel, BM.darkSteel, BM.black, SM.post, SM.back].forEach((m) => { m.envMap = env; m.envMapIntensity = 0.85; m.needsUpdate = true; });
  pm.dispose();
})();
const STEER_AXIS = BK.headDir.clone().normalize();

/* per-frame bike pose. angles in radians, all derived from distance travelled */
const _sq = new Q4();
function poseBike(st) {
  bike.frontWheel.rotation.z = -st.wheelAngle;
  bike.rearWheel.rotation.z = -st.wheelAngle;
  const blurA = clamp(st.wheelOmega / 32, 0, 1) * 0.32;
  bike.frontWheel.userData.blur.material.opacity = blurA;
  bike.rearWheel.userData.blur.material.opacity = blurA;
  bike.crank.rotation.z = -st.crankAngle;
  bike.pedals.forEach((p) => { p.rotation.z = st.crankAngle; });
  bike.cassette.rotation.z = -st.crankAngle * (BK.chainringTeeth / BK.cogTeeth);
  bike.chain.update(st.crankAngle * BK.chainringR);
  bike.steer.quaternion.setFromAxisAngle(STEER_AXIS, st.steer);
  _sq.setFromAxisAngle(STEER_AXIS, st.steer);
}
/* where a wing tip should hold the bars, in bike-local space (follows the steering) */
function gripTarget(side, steer, out) {
  out.copy(BK.gripBase); out.z = side * 0.205;
  out.sub(BK.crown).applyQuaternion(_sq.setFromAxisAngle(STEER_AXIS, steer)).add(BK.crown);
  return out;
}
/* pedal centre in bike-local space for a crank angle (side +1 right, -1 left) */
function pedalPos(side, crankAngle, out) {
  const a = crankAngle + (side > 0 ? 0 : Math.PI);
  return out.set(BK.bb.x + Math.cos(a) * BK.crankLen, BK.bb.y - Math.sin(a) * BK.crankLen, side * BK.pedalZ);
}

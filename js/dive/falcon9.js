import { startDive, mat } from './engine.js';
import * as THREE from '../vendor/three/three.module.js';

const W = 0xefeee8, BLK = 0x1a1a1c, CARB = 0x16161a, MET = 0xb8bcc4, COP = 0xb56a32, NOZ = 0x2a2a2e, LEG = 0x2b2b30;
const LOX = 0x3ec7e6, RP1 = 0xd4892a;
const R = 1.83; // 3.66 m diameter, 1 unit = 1 metre

let _regen;
function regenMap() {
  if (_regen) return _regen;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 512, 0, 0);
  gr.addColorStop(0, '#6a3a22');
  gr.addColorStop(0.35, '#b56a32');
  gr.addColorStop(0.7, '#d0894a');
  gr.addColorStop(1, '#c9a078');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 64; i++) {
    const x = (i / 64) * 256;
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(x, 0, 1.4, 512);
    g.fillStyle = 'rgba(255,220,180,0.16)';
    g.fillRect(x + 1.4, 0, 0.8, 512);
  }
  _regen = new THREE.CanvasTexture(c);
  _regen.colorSpace = THREE.SRGBColorSpace;
  _regen.wrapS = _regen.wrapT = THREE.RepeatWrapping;
  _regen.repeat.set(2, 1);
  return _regen;
}

function bellGeo(re, rt, h, seg = 22) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    pts.push(new THREE.Vector2(rt + (re - rt) * Math.pow(u, 0.62), -u * h));
  }
  return new THREE.LatheGeometry(pts, seg);
}

function tube(a, b, r, material, seg = 6) {
  const d = b.clone().sub(a);
  const len = d.length();
  if (len < 1e-4) return new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), material);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

function merlin(sea = true) {
  const g = new THREE.Group();
  const re = sea ? 0.46 : 1.18;
  const rt = sea ? 0.15 : 0.18;
  const h = sea ? 1.22 : 2.65;
  const bell = new THREE.Mesh(
    bellGeo(re, rt, h, sea ? 20 : 24),
    mat(sea ? COP : 0x8a9098, {
      metalness: 0.55,
      roughness: 0.32,
      side: THREE.DoubleSide,
      map: sea ? regenMap() : null,
    })
  );
  g.add(bell);
  const chamber = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.42, 14), mat(0x9aa0a8, { metalness: 0.5 }));
  chamber.position.y = 0.28;
  g.add(chamber);
  const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.55, 12), mat(MET, { metalness: 0.6 }));
  pump.rotation.z = Math.PI / 2;
  pump.position.set(0.32, 0.48, 0);
  g.add(pump);
  const gg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.28, 10), mat(0x6a7078));
  gg.position.set(0.32, 0.78, 0);
  g.add(gg);
  const gimbal = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.22, 10), mat(NOZ));
  gimbal.position.y = 0.58;
  g.add(gimbal);
  return g;
}

function merlinCloseup(sea = true) {
  const g = new THREE.Group();
  const re = sea ? 0.48 : 1.22;
  const rt = 0.155;
  const h = sea ? 1.35 : 2.85;
  const copper = mat(sea ? COP : 0x8a9098, {
    metalness: 0.62,
    roughness: 0.3,
    side: THREE.DoubleSide,
    map: sea ? regenMap() : null,
  });
  const steel = mat(MET, { metalness: 0.62, roughness: 0.32 });
  const dark = mat(NOZ, { metalness: 0.45, roughness: 0.4 });
  const line = mat(0x8a9098, { metalness: 0.5, roughness: 0.35 });

  g.add(new THREE.Mesh(bellGeo(re, rt, h, 28), copper));

  const throat = new THREE.Mesh(new THREE.CylinderGeometry(rt, rt * 1.15, 0.16, 16), dark);
  throat.position.y = 0.02;
  g.add(throat);

  const chamber = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.55, 18), steel);
  chamber.position.y = 0.36;
  g.add(chamber);

  const injector = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 16), dark);
  injector.position.y = 0.66;
  g.add(injector);

  const gimbal = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 0.28, 12), dark);
  gimbal.position.y = 0.86;
  g.add(gimbal);
  const fork = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.12), steel);
  fork.position.y = 1.02;
  g.add(fork);

  const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.72, 16), steel);
  pump.rotation.z = Math.PI / 2;
  pump.position.set(0.42, 0.58, 0);
  g.add(pump);
  const turbine = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 16), mat(0xc9a36a, { metalness: 0.65 }));
  turbine.rotation.z = Math.PI / 2;
  turbine.position.set(0.78, 0.58, 0);
  g.add(turbine);
  const inlet = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.28, 10), line);
  inlet.position.set(0.42, 0.92, 0);
  g.add(inlet);

  const gg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.32, 12), mat(0x6e747c, { metalness: 0.5 }));
  gg.position.set(0.42, 0.88, 0.16);
  g.add(gg);

  g.add(tube(new THREE.Vector3(0.78, 0.58, 0), new THREE.Vector3(0.95, 0.15, 0.28), 0.035, line));
  g.add(tube(new THREE.Vector3(0.42, 0.92, 0), new THREE.Vector3(0.08, 0.66, 0), 0.04, mat(RP1, { metalness: 0.2 })));
  g.add(tube(new THREE.Vector3(-0.28, 0.95, 0), new THREE.Vector3(-0.08, 0.66, 0), 0.045, mat(LOX, { metalness: 0.2 })));
  const loxFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 10), mat(LOX, { metalness: 0.2 }));
  loxFlange.position.set(-0.28, 1.02, 0);
  g.add(loxFlange);

  if (!sea) {
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(re + 0.04, re * 0.55, 0.35, 24, 1, true),
      mat(0x5c626a, { metalness: 0.45, side: THREE.DoubleSide })
    );
    skirt.position.y = -0.12;
    g.add(skirt);
  }
  return g;
}

function plume(h, r, color) {
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(r, h, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false })
  );
  m.rotation.x = Math.PI;
  m.position.y = -h / 2;
  return m;
}

function gridFin() {
  const g = new THREE.Group();
  const metal = mat(0xc5c8ce, { metalness: 0.7, roughness: 0.28 });
  const Wf = 1.35, Hf = 1.35, t = 0.045;
  g.add(new THREE.Mesh(new THREE.BoxGeometry(t, Hf, Wf), metal));
  for (let i = -2; i <= 2; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(t * 0.7, Hf * 0.92, t), metal);
    slat.position.z = (i / 2) * (Wf * 0.38);
    g.add(slat);
  }
  for (let i = -2; i <= 2; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(t * 0.7, t, Wf * 0.92), metal);
    slat.position.y = (i / 2) * (Hf * 0.38);
    g.add(slat);
  }
  return g;
}

function ogiveFairing(r, hCyl, hNose) {
  const pts = [new THREE.Vector2(r, 0)];
  pts.push(new THREE.Vector2(r, hCyl));
  const n = 14;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const rr = i === n ? 0.02 : Math.max(0.08, r * Math.pow(1 - u * u, 0.55));
    pts.push(new THREE.Vector2(rr, hCyl + u * hNose));
  }
  return new THREE.LatheGeometry(pts, 28);
}

function landingLeg(angle) {
  const g = new THREE.Group();
  const strut = new THREE.Mesh(new THREE.BoxGeometry(0.22, 8.4, 0.16), mat(LEG, { metalness: 0.35, roughness: 0.5 }));
  strut.position.set(0, 4.3, 0);
  g.add(strut);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.16, 12), mat(0xd0d2d6, { metalness: 0.45 }));
  foot.position.set(0.15, 0.12, 0);
  g.add(foot);
  const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.35, 0.28), mat(MET));
  hinge.position.set(0, 8.35, 0);
  g.add(hinge);
  g.position.set(Math.cos(angle) * (R + 0.12), 1.15, Math.sin(angle) * (R + 0.12));
  g.rotation.y = -angle + Math.PI / 2;
  g.rotation.z = 0.16;
  return g;
}

startDive({
  modelTag: 'Falcon 9 Block 5 · schematic',
  lookY: 34, cam: [24, 28, 52], maxDistance: 160,
  modelCard: {
    name: 'Falcon 9 Block 5', tag: 'SpaceX',
    desc: 'Two-stage kerosene/LOX rocket. Nine Merlin 1D engines on the booster, one Merlin Vacuum on the upper stage, titanium grid fins and folding landing legs. Teaching model — not a blueprint.',
    specs: [['Height', '~70 m with fairing'], ['Diameter', '3.66 m'], ['Stages', '2'], ['Booster engines', '9 × Merlin 1D'], ['Upper engine', '1 × Merlin Vacuum'], ['Propellant', 'RP-1 + LOX']],
    note: 'Unofficial fan/learning project. Not affiliated with or endorsed by SpaceX.',
  },
  stages: [
    { id: 'stack', label: 'Stack' },
    { id: 'first', label: 'First' },
    { id: 'second', label: 'Second' },
    { id: 'merlin', label: 'Merlin' },
  ],
  stageInfo: {
    first: { name: 'First stage', tag: 'Booster', desc: 'Nine Merlin 1D engines in an octaweb. After MECO it flips, boosts back or continues to a drone ship, and lands on four legs steered by titanium grid fins.', specs: [['Thrust (SL)', '~7.6 MN'], ['Burn', '~162 s'], ['Reuse', 'Landing legs + grid fins']] },
    second: { name: 'Second stage', tag: 'Upper stage', desc: 'A single Merlin Vacuum with an expanded nozzle for space. It circularizes the orbit and is not recovered.', specs: [['Engine', 'Merlin Vacuum'], ['Nozzle', '~2.4 m exit'], ['Reuse', 'Expended']] },
    merlin: { name: 'Merlin 1D', tag: 'Engine', desc: 'Gas-generator RP-1/LOX engine. Sea-level bells are copper-colored with regenerative cooling channels. The vacuum engine adds a large nozzle extension. Tap the bell, chamber, or turbopump.', specs: [['Cycle', 'Gas generator'], ['Isp (SL / vac)', '~282 / 348 s'], ['Throttle', 'Yes, for landing']] },
  },
  layers: [
    { id: 'tanks', label: 'Tanks' },
    { id: 'engines', label: 'Engines' },
    { id: 'aero', label: 'Aero / landing' },
    { id: 'payload', label: 'Payload' },
    { id: 'structure', label: 'Structure' },
  ],
  legend: [{ cls: 'c-lox', label: 'LOX' }, { cls: 'c-ch4', label: 'RP-1' }],
  build(A) {
    const white = mat(W, { metalness: 0.12, roughness: 0.42 });
    const black = mat(BLK, { metalness: 0.25, roughness: 0.45 });
    const carbon = mat(CARB, { metalness: 0.2, roughness: 0.55 });
    const loxMat = mat(LOX, { metalness: 0.05, roughness: 0.35, transparent: true, opacity: 0.55 });
    const rpMat = mat(RP1, { metalness: 0.08, roughness: 0.45, transparent: true, opacity: 0.55 });

    const octa = A.group();
    octa.add(A.mesh(A.cyl(R * 0.98, R * 0.98, 1.35, 20), black, 0.85));
    octa.add(A.mesh(A.cyl(R * 0.72, R * 0.9, 0.35, 16), mat(0x2a2a30), 0.22));
    A.addPart({
      name: 'Octaweb', tag: 'Structure', label: 'Octaweb', labelY: 1.0, layer: 'structure', stage: 'first', explode: [0, -6, 0],
      desc: 'Engine mounting structure at the base of the booster. Eight Merlins in a ring around one center engine.',
      specs: [['Engines', '9'], ['Material', 'Aluminum structure']], mesh: octa,
    });

    const merlins = A.group();
    const ring = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ring.push([Math.cos(a) * 1.18, Math.sin(a) * 1.18]);
    }
    const spots = [[0, 0], ...ring];
    spots.forEach(([x, z]) => {
      const e = merlin(true);
      e.position.set(x, 0.2, z);
      merlins.add(e);
      const pl = plume(3.1, 0.36, 0xff9a3c);
      pl.position.set(x, -0.95, z);
      merlins.add(pl);
      A.addPlume(pl);
    });
    A.addPart({
      name: 'Merlin 1D (sea level)', tag: 'Engine', label: '9 × Merlin', labelY: -0.4, layer: 'engines', stage: 'first', explode: [0, -8, 0],
      desc: 'Nine sea-level Merlin 1D engines. The center engine and some outer engines restart for boostback, entry and landing burns. Open the Merlin tab for a close-up.',
      specs: [['Count', '9'], ['Propellant', 'RP-1 + LOX'], ['Cycle', 'Gas generator']], mesh: merlins,
    });

    const barrel = A.group();
    barrel.add(A.mesh(A.cyl(R, R, 37.4, 28), white, 20.3));
    const race = new THREE.Mesh(new THREE.BoxGeometry(0.22, 34, 0.18), mat(0x3a3a40, { metalness: 0.2 }));
    race.position.set(R + 0.02, 21, 0);
    barrel.add(race);
    barrel.add(A.mesh(A.cyl(R + 0.01, R + 0.01, 0.18, 24), mat(0xc9c9c4), 12.2));
    A.addPart({
      name: 'First-stage tanks', tag: 'Propellant', label: 'LOX + RP-1', labelY: 22, layer: 'tanks', stage: 'first',
      desc: 'Common-dome tanks: RP-1 in the lower tank, subcooled LOX above. The dark strip is the raceway that carries wiring and plumbing up the side.',
      specs: [['Diameter', '3.66 m'], ['LOX', 'Upper tank'], ['RP-1', 'Lower tank']], mesh: barrel,
    });

    const guts = A.group();
    guts.add(A.mesh(A.cyl(R * 0.9, R * 0.9, 15.2, 18), rpMat, 10.6));
    guts.add(A.mesh(A.cyl(R * 0.9, R * 0.9, 16.8, 18), loxMat, 27.2));
    A.addPart({
      name: 'Propellant (cutaway)', tag: 'Tanks', layer: 'tanks', stage: 'first', cutawayOnly: true,
      desc: 'RP-1 below, LOX above, common dome in between.',
      mesh: guts,
    });
    A.addFlow(new THREE.Vector3(0.55, 30, 0), new THREE.Vector3(0.35, 1.3, 0), 0x2ad4ff, 10);
    A.addFlow(new THREE.Vector3(-0.55, 16, 0), new THREE.Vector3(-0.35, 1.3, 0), 0xffa21a, 8);

    const aero = A.group();
    for (let i = 0; i < 4; i++) aero.add(landingLeg((i * Math.PI) / 2 + Math.PI / 4));
    A.addPart({
      name: 'Landing legs', tag: 'Recovery', label: 'Legs', labelY: 5, layer: 'aero', stage: 'first', explode: [5, 0, 0],
      desc: 'Four folding legs. They stay stowed against the tank on the way up and deploy just before touchdown on a droneship or landing zone.',
      specs: [['Count', '4'], ['Feet', 'Crush-core / hydraulic']], mesh: aero,
    });

    const inter = A.group();
    inter.add(A.mesh(A.cyl(R, R, 4.8, 24), carbon, 41.4));
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const fin = gridFin();
      fin.position.set(Math.cos(a) * (R + 0.55), 43.6, Math.sin(a) * (R + 0.55));
      fin.rotation.y = -a + Math.PI / 2;
      inter.add(fin);
    }
    A.addPart({
      name: 'Interstage & grid fins', tag: 'Structure', label: 'Grid fins', labelY: 43.6, layer: 'aero', stage: 'first', explode: [0, 3, 0],
      desc: 'Carbon-composite interstage hides the vacuum nozzle at liftoff and stays with the booster. Four titanium grid fins steer the booster through the atmosphere.',
      specs: [['Fins', '4 titanium'], ['Interstage', 'Stays on the booster']], mesh: inter,
    });

    const s2 = A.group();
    s2.add(A.mesh(A.cyl(R, R, 8.6, 24), white, 49.3));
    const vac = merlin(false);
    vac.position.y = 44.0;
    s2.add(vac);
    const pl2 = plume(4.8, 0.95, 0xffc56a);
    pl2.position.y = 42.3;
    s2.add(pl2);
    A.addPlume(pl2);
    A.addPart({
      name: 'Second stage + MVac', tag: 'Upper stage', label: 'Second stage', labelY: 49, layer: 'engines', stage: 'second', explode: [0, 8, 0],
      desc: 'RP-1/LOX upper stage with one Merlin Vacuum. The big nozzle is designed for vacuum Isp, not sea-level thrust.',
      specs: [['Engine', '1 × Merlin Vacuum'], ['Reuse', 'Expended']], mesh: s2,
    });
    const s2guts = A.group();
    s2guts.add(A.mesh(A.cyl(R * 0.88, R * 0.88, 3.4, 16), rpMat, 47.4));
    s2guts.add(A.mesh(A.cyl(R * 0.88, R * 0.88, 3.6, 16), loxMat, 51.2));
    A.addPart({ name: 'S2 tanks', tag: 'Tanks', layer: 'tanks', stage: 'second', cutawayOnly: true, mesh: s2guts });
    A.addFlow(new THREE.Vector3(0.45, 52.2, 0), new THREE.Vector3(0.2, 44.4, 0), 0x2ad4ff, 6);
    A.addFlow(new THREE.Vector3(-0.45, 48.2, 0), new THREE.Vector3(-0.2, 44.4, 0), 0xffa21a, 5);

    const fair = A.group();
    const fairMesh = new THREE.Mesh(ogiveFairing(R, 7.4, 4.8), white);
    fairMesh.position.y = 53.6;
    fair.add(fairMesh);
    const sat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 1.6), mat(0x8ea0b8, { metalness: 0.35 }));
    sat.position.y = 57.2;
    fair.add(sat);
    A.addPart({
      name: 'Payload fairing', tag: 'Payload', label: 'Fairing', labelY: 62, layer: 'payload', stage: 'second', explode: [0, 12, 0],
      desc: 'Two-shell composite ogive fairing. It protects the satellite on the way up; the halves are often recovered. Crew Dragon replaces this on crew flights.',
      specs: [['Type', '2-shell composite'], ['Reuse', 'Often recovered']], mesh: fair,
    });

    // ---- Merlin close-up (only the Merlin tab)
    const sl = merlinCloseup(true);
    sl.position.set(-2.15, 0, 0);
    const slPlume = plume(2.4, 0.42, 0xff9a3c);
    slPlume.position.y = -1.35;
    sl.add(slPlume);
    A.addPlume(slPlume);
    A.addPart({
      name: 'Merlin 1D sea-level', tag: 'Engine', label: 'Merlin 1D', labelY: 0.7, layer: 'engines', stage: 'merlin', hideOnStack: true, explode: [-1.2, 0, 0],
      desc: 'Gas-generator RP-1/LOX engine. RP-1 runs through cooling channels in the copper-colored bell, then into the injector. A single-shaft turbopump sits beside the chamber. Throttleable for landing.',
      specs: [['Thrust (SL)', '~845 kN'], ['Isp (SL)', '~282 s'], ['Chamber', '~6.8 MPa'], ['Nozzle', 'Regen-cooled']],
      mesh: sl,
    });
    const mv = merlinCloseup(false);
    mv.position.set(2.6, 0.4, 0);
    const mvPlume = plume(3.6, 0.9, 0xffc56a);
    mvPlume.position.y = -2.85;
    mv.add(mvPlume);
    A.addPlume(mvPlume);
    A.addPart({
      name: 'Merlin Vacuum', tag: 'Engine', label: 'Merlin Vac', labelY: 0.5, layer: 'engines', stage: 'merlin', hideOnStack: true, explode: [1.6, 0, 0],
      desc: 'Same gas-generator core as the sea-level engine, with a much larger niobium nozzle extension for vacuum Isp. One of these flies on every Falcon 9 second stage.',
      specs: [['Thrust (vac)', '~981 kN'], ['Isp (vac)', '~348 s'], ['Exit', '~2.4 m'], ['Reuse', 'Expended']],
      mesh: mv,
    });

    A.addFlow(new THREE.Vector3(-2.43, 1.02, 0), new THREE.Vector3(-2.23, 0.66, 0), 0x2ad4ff, 6);
    A.addFlow(new THREE.Vector3(-1.73, 0.92, 0), new THREE.Vector3(-2.07, 0.66, 0), 0xffa21a, 6);
    A.addFlow(new THREE.Vector3(2.32, 1.42, 0), new THREE.Vector3(2.52, 1.06, 0), 0x2ad4ff, 5);
    A.addFlow(new THREE.Vector3(3.02, 1.32, 0), new THREE.Vector3(2.68, 1.06, 0), 0xffa21a, 5);
  },
});

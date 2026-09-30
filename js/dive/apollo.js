import { startDive, mat } from './engine.js';
import * as THREE from '../vendor/three/three.module.js';

const W = 0xf2efe6, BLK = 0x141414, GOLD = 0xc9a227, SIL = 0xc5cdd6, NOZ = 0x2b2b2b, COP = 0x8f5a32;
const LOX = 0x3ec7e6, RP1 = 0xd4892a, LH2 = 0x9d8cff;
const R1 = 5.05; // S-IC / S-II 10.1 m
const R3 = 3.30; // S-IVB 6.6 m

function f1() {
  const g = new THREE.Group();
  const bell = new THREE.Mesh(
    new THREE.CylinderGeometry(1.85, 0.52, 4.0, 22, 1, true),
    mat(COP, { metalness: 0.5, roughness: 0.38, side: THREE.DoubleSide })
  );
  bell.position.y = -2.0;
  g.add(bell);
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.7, 12), mat(NOZ));
  throat.position.y = 0.2;
  g.add(throat);
  const turb = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1.15, 12), mat(SIL, { metalness: 0.55 }));
  turb.position.y = 1.05;
  g.add(turb);
  const pipe = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 6, 16), mat(0x7a8088));
  pipe.rotation.x = Math.PI / 2;
  pipe.position.y = 0.55;
  g.add(pipe);
  return g;
}

function j2(big = false) {
  const g = new THREE.Group();
  const r = big ? 1.0 : 0.82;
  const h = big ? 3.0 : 2.3;
  const bell = new THREE.Mesh(
    new THREE.CylinderGeometry(r, 0.28, h, 20, 1, true),
    mat(0x8e949c, { metalness: 0.55, side: THREE.DoubleSide })
  );
  bell.position.y = -h / 2;
  g.add(bell);
  const turb = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.65, 12), mat(SIL));
  turb.position.y = 0.4;
  g.add(turb);
  return g;
}

function plume(h, r, color) {
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(r, h, 14, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false })
  );
  m.rotation.x = Math.PI;
  m.position.y = -h / 2;
  return m;
}

function quadPaint(r, h, y0, white, black) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, 10, 1, false, (i * Math.PI) / 2, Math.PI / 2),
      i % 2 ? black : white
    );
    band.position.y = y0;
    g.add(band);
  }
  return g;
}

function fin(black) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(3.6, 0.2);
  shape.lineTo(3.2, 3.8);
  shape.lineTo(0.15, 4.4);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false });
  geo.rotateY(Math.PI / 2);
  geo.translate(0, 0, -0.09);
  return new THREE.Mesh(geo, black);
}

startDive({
  modelTag: 'Saturn V + Apollo · schematic',
  lookY: 55, cam: [48, 52, 96], minDistance: 16, maxDistance: 280, fogFar: 380,
  modelCard: {
    name: 'Saturn V / Apollo stack', tag: 'NASA · 1967–1973',
    desc: 'Three live stages, an instrument unit, the lunar module in its adapter, the command/service module, and a launch escape tower. Teaching model — not a museum replica.',
    specs: [['Height', '~110 m'], ['Diameter (S-IC)', '10.1 m'], ['LEO payload', '~140 t'], ['Moon payload', '~48 t'], ['Flights', '13']],
    note: 'Unofficial fan/learning project. Not affiliated with or endorsed by NASA.',
  },
  stages: [
    { id: 'stack', label: 'Stack' },
    { id: 'sic', label: 'S-IC' },
    { id: 'sii', label: 'S-II' },
    { id: 'sivb', label: 'S-IVB' },
    { id: 'apollo', label: 'Apollo' },
  ],
  stageInfo: {
    sic: { name: 'S-IC first stage', tag: 'Boeing', desc: 'Five F-1 engines burning RP-1 and LOX. Black-and-white gores and four fins are the look most people mean by “Moon rocket.”', specs: [['Engines', '5 × F-1'], ['Thrust', '~34 MN'], ['Burn', '~168 s']] },
    sii: { name: 'S-II second stage', tag: 'North American', desc: 'Five J-2 engines burning LH2 and LOX. After the S-IC drops, this stage does the long high-altitude push toward Earth orbit.', specs: [['Engines', '5 × J-2'], ['Propellant', 'LH2 + LOX'], ['Burn', '~6 min']] },
    sivb: { name: 'S-IVB third stage', tag: 'Douglas', desc: 'One J-2. It finishes insertion into Earth orbit, then restarts for trans-lunar injection.', specs: [['Engine', '1 × J-2'], ['Restarts', 'TLI burn']] },
    apollo: { name: 'Apollo spacecraft', tag: 'CSM + LM', desc: 'Command module for the crew, service module for power and the SPS engine, lunar module for landing, and a launch escape tower.', specs: [['Crew', '3'], ['LM crew', '2 on the surface'], ['SPS', 'Service propulsion']] },
  },
  layers: [
    { id: 'tanks', label: 'Tanks' },
    { id: 'engines', label: 'Engines' },
    { id: 'aero', label: 'Fins / LES' },
    { id: 'spacecraft', label: 'Spacecraft' },
    { id: 'structure', label: 'Structure' },
  ],
  legend: [{ cls: 'c-lox', label: 'LOX' }, { cls: 'c-ch4', label: 'RP-1' }, { cls: 'c-oxg', label: 'LH2' }],
  build(A) {
    const white = mat(W, { metalness: 0.08, roughness: 0.48 });
    const black = mat(BLK, { metalness: 0.12, roughness: 0.5 });
    const loxMat = mat(LOX, { metalness: 0.05, roughness: 0.35, transparent: true, opacity: 0.5 });
    const rpMat = mat(RP1, { metalness: 0.08, roughness: 0.45, transparent: true, opacity: 0.5 });
    const lhMat = mat(LH2, { metalness: 0.05, roughness: 0.3, transparent: true, opacity: 0.45 });

    // ---- F-1 cluster (center + 4 at 90°)
    const engines = A.group();
    const f1s = [[0, 0], [2.55, 0], [-2.55, 0], [0, 2.55], [0, -2.55]];
    f1s.forEach(([x, z]) => {
      const e = f1();
      e.position.set(x, 2.15, z);
      engines.add(e);
      const pl = plume(9, 1.45, 0xff8a2a);
      pl.position.set(x, -1.95, z);
      engines.add(pl);
      A.addPlume(pl);
    });
    A.addPart({
      name: 'F-1 engines', tag: 'S-IC', label: '5 × F-1', labelY: 1.2, layer: 'engines', stages: ['sic'], explode: [0, -12, 0],
      desc: 'Still among the most powerful single-chamber engines ever flown. RP-1/LOX gas-generator cycle with a huge regeneratively cooled bell.',
      specs: [['Each', '~6.8 MN SL'], ['Exit', '~3.7 m']], mesh: engines,
    });

    // ---- S-IC body: white RP-1, black intertank, black/white LOX gores, fins
    const sic = A.group();
    sic.add(A.mesh(A.cyl(R1, R1, 6.2, 28), white, 5.2)); // thrust structure
    sic.add(A.mesh(A.cyl(R1, R1, 13.4, 28), white, 15.0)); // RP-1
    const usa = new THREE.Mesh(
      new THREE.CylinderGeometry(R1 + 0.02, R1 + 0.02, 8.5, 12, 1, false, -0.35, 0.7),
      black
    );
    usa.position.y = 14.2;
    sic.add(usa);
    sic.add(A.mesh(A.cyl(R1 + 0.01, R1 + 0.01, 1.8, 28), black, 22.6)); // intertank
    sic.add(quadPaint(R1, 16.6, 31.8, white, black)); // LOX gores
    sic.add(A.mesh(A.cyl(R1, R1, 1.6, 28), black, 41.0)); // forward skirt
    const fins = A.group();
    for (let i = 0; i < 4; i++) {
      const f = fin(black);
      const a = (i * Math.PI) / 2;
      f.position.set(Math.cos(a) * R1, 0.15, Math.sin(a) * R1);
      f.rotation.y = -a;
      fins.add(f);
    }
    sic.add(fins);
    A.addPart({
      name: 'S-IC tanks & fins', tag: 'First stage', label: 'S-IC', labelY: 24, layer: 'tanks', stage: 'sic',
      desc: 'RP-1 in the lower white tank, LOX in the upper tank with the famous black-and-white gores. Four fins keep the stack straight in thick air.',
      specs: [['Diameter', '10.1 m'], ['Height', '~42 m'], ['Builder', 'Boeing']], mesh: sic,
    });
    const sicGuts = A.group();
    sicGuts.add(A.mesh(A.cyl(R1 * 0.9, R1 * 0.9, 12.5, 16), rpMat, 14.8));
    sicGuts.add(A.mesh(A.cyl(R1 * 0.9, R1 * 0.9, 15.5, 16), loxMat, 31.6));
    A.addPart({ name: 'S-IC propellant', tag: 'Tanks', layer: 'tanks', stage: 'sic', cutawayOnly: true, mesh: sicGuts });
    A.addFlow(new THREE.Vector3(2.0, 34, 0), new THREE.Vector3(1.1, 3.2, 0), 0x2ad4ff, 10);
    A.addFlow(new THREE.Vector3(-2.0, 16, 0), new THREE.Vector3(-1.1, 3.2, 0), 0xffa21a, 8);

    // ---- S-II (same diameter, all white, black interstage ring)
    const sii = A.group();
    sii.add(A.mesh(A.cyl(R1, R1, 2.4, 28), black, 43.3));
    sii.add(A.mesh(A.cyl(R1, R1, 21.2, 28), white, 55.1));
    const j2s = A.group();
    const jpos = [[0, 0], [2.05, 0], [-2.05, 0], [0, 2.05], [0, -2.05]];
    jpos.forEach(([x, z]) => {
      const e = j2(false);
      e.position.set(x, 42.4, z);
      j2s.add(e);
      const pl = plume(5.2, 0.8, 0xcfe6ff);
      pl.position.set(x, 40.8, z);
      j2s.add(pl);
      A.addPlume(pl);
    });
    sii.add(j2s);
    A.addPart({
      name: 'S-II + J-2 cluster', tag: 'Second stage', label: 'S-II', labelY: 55, layer: 'engines', stage: 'sii', explode: [0, 8, 0],
      desc: 'Hydrogen-fueled second stage. The interstage ring drops after the F-1s are gone so the five J-2s can fire in the open.',
      specs: [['Engines', '5 × J-2'], ['Propellant', 'LH2 + LOX'], ['Diameter', '10.1 m']], mesh: sii,
    });
    const siiGuts = A.group();
    siiGuts.add(A.mesh(A.cyl(R1 * 0.88, R1 * 0.88, 5.2, 16), loxMat, 47.4));
    siiGuts.add(A.mesh(A.cyl(R1 * 0.88, R1 * 0.88, 14.5, 16), lhMat, 57.4));
    A.addPart({ name: 'S-II propellant', tag: 'Tanks', layer: 'tanks', stage: 'sii', cutawayOnly: true, mesh: siiGuts });
    A.addFlow(new THREE.Vector3(2, 62, 0), new THREE.Vector3(1, 43.2, 0), 0x9d8cff, 8);
    A.addFlow(new THREE.Vector3(-2, 49, 0), new THREE.Vector3(-1, 43.2, 0), 0x2ad4ff, 7);

    // ---- S-IVB (narrower)
    const sivb = A.group();
    const taper = new THREE.Mesh(new THREE.CylinderGeometry(R3, R1, 1.8, 24), white);
    taper.position.y = 66.6;
    sivb.add(taper);
    sivb.add(A.mesh(A.cyl(R3, R3, 17.2, 24), white, 76.1));
    sivb.add(A.mesh(A.cyl(R3 + 0.02, R3 + 0.02, 0.95, 24), mat(0x5c6a7a, { metalness: 0.35 }), 85.2));
    const e3 = j2(true);
    e3.position.y = 65.6;
    sivb.add(e3);
    const pl3 = plume(5.8, 0.95, 0xd8ecff);
    pl3.position.y = 63.8;
    sivb.add(pl3);
    A.addPlume(pl3);
    A.addPart({
      name: 'S-IVB + instrument unit', tag: 'Third stage', label: 'S-IVB', labelY: 76, layer: 'tanks', stage: 'sivb', explode: [0, 14, 0],
      desc: 'Single J-2 and the ring-shaped instrument unit that guided the stack. After TLI the stage was discarded.',
      specs: [['Engine', '1 × J-2'], ['Diameter', '6.6 m'], ['IU', 'Guidance ring']], mesh: sivb,
    });
    A.addFlow(new THREE.Vector3(1.1, 82, 0), new THREE.Vector3(0.35, 66.2, 0), 0x9d8cff, 6);

    // ---- Apollo spacecraft
    const craft = A.group();
    const sla = new THREE.Mesh(new THREE.CylinderGeometry(1.95, R3, 8.4, 24), white);
    sla.position.y = 90.0;
    craft.add(sla);
    const lm = new THREE.Group();
    lm.add(A.mesh(A.cyl(2.05, 2.05, 2.5, 16), mat(GOLD, { metalness: 0.35, roughness: 0.55 }), 88.6));
    lm.add(A.mesh(A.cyl(1.25, 1.85, 2.0, 16), mat(GOLD), 90.8));
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.8, 6), mat(GOLD));
      leg.position.set(Math.cos(a) * 1.65, 87.2, Math.sin(a) * 1.65);
      leg.rotation.z = Math.cos(a) * 0.42;
      lm.add(leg);
    }
    craft.add(lm);
    const sm = A.mesh(A.cyl(1.95, 1.95, 3.9, 20), mat(SIL, { metalness: 0.55, roughness: 0.35 }), 96.2);
    craft.add(sm);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const rcs = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.18), mat(0xd8dce2));
      rcs.position.set(Math.cos(a) * 2.05, 96.6, Math.sin(a) * 2.05);
      craft.add(rcs);
    }
    const sps = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.28, 2.2, 16, 1, true),
      mat(0x6a7078, { side: THREE.DoubleSide, metalness: 0.5 })
    );
    sps.position.y = 93.5;
    craft.add(sps);
    const cm = A.mesh(A.cone(1.95, 3.35, 20), mat(0xe4d7c0, { roughness: 0.45 }), 99.85);
    craft.add(cm);
    craft.add(A.mesh(A.cyl(1.95, 1.95, 0.22, 20), black, 98.08));
    const les = A.group();
    les.add(A.mesh(A.cyl(0.22, 0.22, 8.4, 10), mat(0xc8ccd2), 105.6));
    les.add(A.mesh(A.cone(0.5, 1.5, 10), black, 110.55));
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + 0.2;
      const can = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.9), mat(0xc8ccd2));
      can.position.set(Math.cos(a) * 0.55, 108.4, Math.sin(a) * 0.55);
      les.add(can);
    }
    craft.add(les);
    A.addPart({
      name: 'Apollo CSM, LM & LES', tag: 'Spacecraft', label: 'Apollo', labelY: 98, layer: 'spacecraft', stage: 'apollo', explode: [0, 18, 0],
      desc: 'Lunar module tucked in the SLA under the service module. Command module on top. Launch escape tower can pull the capsule clear in an abort.',
      specs: [['CM', 'Crew + heat shield'], ['SM', 'SPS + power'], ['LM', 'Descent + ascent'], ['LES', 'Abort tower']], mesh: craft,
    });
  },
});

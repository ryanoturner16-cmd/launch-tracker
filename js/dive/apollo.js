import { startDive, mat } from './engine.js';
import * as THREE from '../vendor/three/three.module.js';

const W = 0xf4f1e8, BLK = 0x111111, GOLD = 0xc9a227, SIL = 0xc5cdd6, NOZ = 0x2b2b2b, COP = 0x9a6a3a;
const LOX = 0x3ec7e6, RP1 = 0xd4892a, LH2 = 0x9d8cff;

function f1() {
  const g = new THREE.Group();
  const bell = new THREE.Mesh(
    new THREE.CylinderGeometry(1.55, 0.55, 3.6, 22, 1, true),
    mat(COP, { metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide })
  );
  bell.position.y = -1.7; g.add(bell);
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 12), mat(NOZ));
  throat.position.y = 0.35; g.add(throat);
  const turb = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.1, 12), mat(SIL, { metalness: 0.55 }));
  turb.position.y = 1.05; g.add(turb);
  return g;
}
function j2(big = false) {
  const g = new THREE.Group();
  const r = big ? 1.05 : 0.85;
  const bell = new THREE.Mesh(
    new THREE.CylinderGeometry(r, 0.32, big ? 3.2 : 2.4, 20, 1, true),
    mat(0x8e949c, { metalness: 0.55, side: THREE.DoubleSide })
  );
  bell.position.y = big ? -1.5 : -1.15; g.add(bell);
  const turb = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.7, 12), mat(SIL));
  turb.position.y = 0.45; g.add(turb);
  return g;
}
function plume(h, r, color) {
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(r, h, 16, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })
  );
  m.rotation.x = Math.PI; m.position.y = -h / 2; return m;
}

startDive({
  modelTag: 'Saturn V + Apollo · schematic',
  lookY: 52, cam: [42, 58, 88], minDistance: 14, maxDistance: 260, fogFar: 360,
  modelCard: {
    name: 'Saturn V / Apollo stack', tag: 'NASA · 1967–1973',
    desc: 'The rocket that sent Apollo crews to the Moon. Three live stages, an instrument unit, the lunar module in its adapter, the command/service module, and a launch escape tower. This is a teaching model, not a museum replica.',
    specs: [['Height', '~110 m'], ['Diameter (S-IC)', '10.1 m'], ['LEO payload', '~140 t'], ['Moon payload', '~48 t'], ['Flights', '13 (Apollo + Skylab + ASTP)']],
    note: 'Unofficial fan/learning project. Not affiliated with or endorsed by NASA. Figures are approximate public information.',
  },
  stages: [
    { id: 'stack', label: 'Stack' },
    { id: 'sic', label: 'S-IC' },
    { id: 'sii', label: 'S-II' },
    { id: 'sivb', label: 'S-IVB' },
    { id: 'apollo', label: 'Apollo' },
  ],
  stageInfo: {
    sic: { name: 'S-IC first stage', tag: 'Boeing', desc: 'Five F-1 engines burning RP-1 and LOX. The black-and-white paint is the familiar Saturn look; the fins help keep the stack straight in the thick lower air.', specs: [['Engines', '5 × F-1'], ['Thrust', '~34 MN'], ['Burn', '~168 s']] },
    sii: { name: 'S-II second stage', tag: 'North American', desc: 'Five J-2 engines burning LH2 and LOX. After the S-IC drops, this stage does the long high-altitude push toward Earth orbit.', specs: [['Engines', '5 × J-2'], ['Propellant', 'LH2 + LOX'], ['Burn', '~6 min']] },
    sivb: { name: 'S-IVB third stage', tag: 'Douglas', desc: 'One J-2. It finishes insertion into Earth orbit, then restarts for trans-lunar injection. On later flights the spent stage was crashed into the Moon as a seismic source.', specs: [['Engine', '1 × J-2'], ['Restarts', 'TLI burn'], ['Also', 'Skylab workshop on later flights']] },
    apollo: { name: 'Apollo spacecraft', tag: 'CSM + LM', desc: 'Command module for the crew, service module for power and the SPS engine, lunar module for landing, and a launch escape tower that could pull the capsule off the rocket.', specs: [['Crew', '3'], ['LM crew', '2 on the surface'], ['SPS', 'Service propulsion']] },
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
    const { THREE } = A;
    const skin = mat(W), black = mat(BLK), tank = mat(0xddd6c8);
    const loxMat = mat(LOX, { metalness: 0.05, roughness: 0.35, transparent: true, opacity: 0.5 });
    const rpMat = mat(RP1, { metalness: 0.08, roughness: 0.45, transparent: true, opacity: 0.5 });
    const lhMat = mat(LH2, { metalness: 0.05, roughness: 0.3, transparent: true, opacity: 0.45 });

    const engines = A.group();
    const f1s = [[0, 0], [2.6, 0], [-2.6, 0], [0, 2.6], [0, -2.6]];
    f1s.forEach(([x, z]) => {
      const e = f1(); e.position.set(x, 1.6, z); engines.add(e);
      const pl = plume(8, 1.3, 0xff8a2a); pl.position.set(x, -1.9, z); engines.add(pl); A.addPlume(pl);
    });
    A.addPart({
      name: 'F-1 engines', tag: 'S-IC', label: '5 × F-1', labelY: 0.4, layer: 'engines', stages: ['sic'], explode: [0, -10, 0],
      desc: 'Still among the most powerful single-chamber engines ever flown. RP-1/LOX gas-generator cycle, with a huge regeneratively cooled bell.',
      specs: [['Each', '~6.8 MN SL'], ['Chamber', 'Single, ~2.6 m exit']], mesh: engines,
    });

    const sic = A.group();
    const bands = [black, skin, black, skin, black, skin, black, skin];
    for (let i = 0; i < bands.length; i++) {
      sic.add(A.mesh(A.cyl(5.05, 5.05, 4.4), bands[i], 6.2 + i * 4.4));
    }
    sic.add(A.mesh(A.cyl(4.55, 4.55, 16), rpMat, 14));
    sic.add(A.mesh(A.cyl(4.55, 4.55, 14), loxMat, 30));
    const fins = A.group();
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.2, 3.4), black);
      fin.position.set(Math.cos(a) * 5.4, 5.4, Math.sin(a) * 5.4);
      fins.add(fin);
    }
    sic.add(fins);
    A.addPart({
      name: 'S-IC tanks & fins', tag: 'First stage', label: 'S-IC', labelY: 22, layer: 'tanks', stage: 'sic',
      desc: 'RP-1 in the lower tank, LOX above. The painted pattern is what most people picture when they say “Moon rocket.”',
      specs: [['Diameter', '10.1 m'], ['Height', '~42 m'], ['Builder', 'Boeing']], mesh: sic,
    });
    A.addFlow(new THREE.Vector3(2.2, 32, 0), new THREE.Vector3(1.2, 3, 0), 0x2ad4ff, 14);
    A.addFlow(new THREE.Vector3(-2.2, 18, 0), new THREE.Vector3(-1.2, 3, 0), 0xffa21a, 12);

    const sii = A.group();
    sii.add(A.mesh(A.cyl(5.05, 5.05, 22), skin, 53.5));
    sii.add(A.mesh(A.cyl(4.55, 4.55, 8), loxMat, 48));
    sii.add(A.mesh(A.cyl(4.55, 4.55, 10), lhMat, 58));
    const inter1 = A.mesh(A.cyl(5.05, 5.05, 2.2), black, 43.2); sii.add(inter1);
    const j2s = A.group();
    const jpos = [[0, 0], [2.1, 0], [-2.1, 0], [0, 2.1], [0, -2.1]];
    jpos.forEach(([x, z]) => {
      const e = j2(false); e.position.set(x, 43.0, z); j2s.add(e);
      const pl = plume(5.5, 0.85, 0xcfe6ff); pl.position.set(x, 41.2, z); j2s.add(pl); A.addPlume(pl);
    });
    sii.add(j2s);
    A.addPart({
      name: 'S-II + J-2 cluster', tag: 'Second stage', label: 'S-II', labelY: 54, layer: 'engines', stages: ['sii'], explode: [0, 8, 0],
      desc: 'Hydrogen-fueled second stage. The interstage ring drops after the F-1s are gone so the five J-2s can fire in the open.',
      specs: [['Engines', '5 × J-2'], ['Propellant', 'LH2 + LOX']], mesh: sii,
    });
    A.addFlow(new THREE.Vector3(2, 60, 0), new THREE.Vector3(1, 44, 0), 0x9d8cff, 10);
    A.addFlow(new THREE.Vector3(-2, 58, 0), new THREE.Vector3(-1, 44, 0), 0x2ad4ff, 9);

    const sivb = A.group();
    sivb.add(A.mesh(A.cyl(3.3, 3.3, 17.6), skin, 76.2));
    sivb.add(A.mesh(A.cyl(2.9, 2.9, 6), loxMat, 71));
    sivb.add(A.mesh(A.cyl(2.9, 2.9, 8), lhMat, 80));
    const iu = A.mesh(A.cyl(3.3, 3.3, 0.9), mat(0x6d7c90, { metalness: 0.4 }), 85.5); sivb.add(iu);
    const e3 = j2(true); e3.position.y = 66.6; sivb.add(e3);
    const pl3 = plume(6, 1.0, 0xd8ecff); pl3.position.y = 64.6; sivb.add(pl3); A.addPlume(pl3);
    A.addPart({
      name: 'S-IVB + instrument unit', tag: 'Third stage', label: 'S-IVB', labelY: 76, layer: 'tanks', stage: 'sivb', explode: [0, 14, 0],
      desc: 'Single J-2 and the ring-shaped instrument unit that guided the whole stack. After TLI the stage was discarded; the CSM and LM flew on alone.',
      specs: [['Engine', '1 × J-2'], ['IU', 'Guidance ring']], mesh: sivb,
    });
    A.addFlow(new THREE.Vector3(1.2, 82, 0), new THREE.Vector3(0.4, 67.4, 0), 0x9d8cff, 8);

    const craft = A.group();
    const adapter = A.mesh(A.cyl(3.3, 2.2, 8.4), skin, 90.2); craft.add(adapter);
    const lm = new THREE.Group();
    lm.add(A.mesh(A.cyl(2.05, 2.05, 2.6), mat(GOLD, { metalness: 0.35, roughness: 0.55 }), 89.4));
    lm.add(A.mesh(A.cyl(1.3, 1.9, 2.2), mat(GOLD), 91.8));
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.1, 8), mat(GOLD));
      leg.position.set(Math.cos(a) * 1.7, 87.8, Math.sin(a) * 1.7);
      leg.rotation.z = Math.cos(a) * 0.45; lm.add(leg);
    }
    craft.add(lm);
    const sm = A.mesh(A.cyl(1.95, 1.95, 3.9), mat(SIL, { metalness: 0.5 }), 95.6); craft.add(sm);
    const sps = A.mesh(A.cyl(0.55, 0.28, 1.4), mat(NOZ), 93.3); craft.add(sps);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const rcs = A.mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), mat(SIL), 96.4);
      rcs.position.set(Math.cos(a) * 1.95, 96.4, Math.sin(a) * 1.95); craft.add(rcs);
    }
    const cm = A.mesh(A.cone(1.95, 3.3, 20), mat(0xd9cbb0), 99.2); craft.add(cm);
    const les = A.group();
    les.add(A.mesh(A.cyl(0.28, 0.28, 8.2), mat(0xbfc5ce), 105.4));
    les.add(A.mesh(A.cone(0.55, 1.6, 10), mat(BLK), 110.3));
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const can = A.mesh(A.cyl(0.12, 0.12, 0.9), mat(0x888888), 107.6);
      can.position.set(Math.cos(a) * 0.42, 107.6, Math.sin(a) * 0.42);
      can.rotation.z = Math.cos(a) * 0.6; les.add(can);
    }
    craft.add(les);
    A.addPart({
      name: 'Apollo CSM, LM & LES', tag: 'Spacecraft', label: 'Apollo', labelY: 98, layer: 'spacecraft', stage: 'apollo', explode: [0, 18, 0],
      desc: 'Lunar module tucked in the adapter under the service module. Command module on top. Launch escape system can pull the capsule clear of the rocket.',
      specs: [['CM', 'Crew + heat shield'], ['SM', 'SPS + power'], ['LM', 'Descent + ascent'], ['LES', 'Abort tower']], mesh: craft,
    });
  },
});

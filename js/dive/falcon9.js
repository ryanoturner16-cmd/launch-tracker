import { startDive, mat } from './engine.js';
import * as THREE from '../vendor/three/three.module.js';

const W = 0xf3efe6, BLK = 0x161616, MET = 0xb8bcc4, COP = 0xb87333, NOZ = 0x2a2a2a, LEG = 0xd8d8d8;
const LOX = 0x3ec7e6, RP1 = 0xd4892a;

function merlin(sea = true) {
  const g = new THREE.Group();
  const bell = new THREE.Mesh(
    new THREE.CylinderGeometry(sea ? 0.45 : 0.95, sea ? 0.22 : 0.28, sea ? 1.15 : 2.4, 20, 1, true),
    mat(sea ? COP : 0x8a8f98, { metalness: 0.55, roughness: 0.35, side: THREE.DoubleSide })
  );
  bell.position.y = sea ? -0.55 : -1.15; g.add(bell);
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.25, 12), mat(NOZ));
  throat.position.y = sea ? 0.12 : 0.15; g.add(throat);
  const turb = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.45, 12), mat(MET, { metalness: 0.5 }));
  turb.position.y = sea ? 0.42 : 0.5; g.add(turb);
  return g;
}

function plume(h, r, color) {
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(r, h, 14, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
  );
  m.rotation.x = Math.PI; m.position.y = -h / 2; return m;
}

function gridFin() {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.55, 1.15), mat(0x9aa0a8, { metalness: 0.6, roughness: 0.3 }));
  g.add(frame);
  for (let i = -2; i <= 2; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.4, 0.04), mat(0xc5c8cc, { metalness: 0.55 }));
    slat.position.z = i * 0.2; g.add(slat);
  }
  return g;
}

startDive({
  modelTag: 'Falcon 9 Block 5 · schematic',
  lookY: 32, cam: [22, 34, 48], maxDistance: 160,
  modelCard: {
    name: 'Falcon 9 Block 5', tag: 'SpaceX',
    desc: 'Two-stage orbital rocket first flown in this configuration in 2018. The booster lands and flies again; the second stage is expended. This view is a simplified teaching model, not a blueprint.',
    specs: [['Height', '~70 m with fairing'], ['Diameter', '3.66 m'], ['Stages', '2'], ['Booster engines', '9 × Merlin 1D'], ['Upper engine', '1 × Merlin Vacuum'], ['Propellant', 'RP-1 + LOX']],
    note: 'Unofficial fan/learning project. Not affiliated with or endorsed by SpaceX. Layouts are schematic.',
  },
  stages: [
    { id: 'stack', label: 'Stack' },
    { id: 'first', label: 'First' },
    { id: 'second', label: 'Second' },
    { id: 'merlin', label: 'Merlin' },
  ],
  stageInfo: {
    first: { name: 'First stage', tag: 'Booster', desc: 'Nine Merlin 1D engines in an octaweb. After MECO it flips, boosts back or continues to a drone ship, and lands on four legs steered by titanium grid fins.', specs: [['Thrust (SL)', '~7.6 MN'], ['Burn', '~162 s'], ['Reuse', 'Landing legs + grid fins']] },
    second: { name: 'Second stage', tag: 'Upper stage', desc: 'A single Merlin Vacuum with an expanded nozzle for space. It circularizes the orbit and is not recovered.', specs: [['Engine', 'Merlin Vacuum'], ['Nozzle', '~2.7 m exit'], ['Reuse', 'Expended']] },
    merlin: { name: 'Merlin 1D', tag: 'Engine', desc: 'Gas-generator RP-1/LOX engine. Sea-level bells are copper-colored; the vacuum engine uses a much larger nozzle extension.', specs: [['Cycle', 'Gas generator'], ['Isp (SL / vac)', '~282 / 348 s'], ['Throttle', 'Yes, for landing']] },
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
    const { THREE } = A;
    const skin = mat(W);
    const black = mat(BLK);
    const tankSkin = mat(0xe8e4da, { metalness: 0.15, roughness: 0.4 });
    const loxMat = mat(LOX, { metalness: 0.05, roughness: 0.35, transparent: true, opacity: 0.55 });
    const rpMat = mat(RP1, { metalness: 0.08, roughness: 0.45, transparent: true, opacity: 0.55 });

    const octa = A.group();
    octa.add(A.mesh(A.cyl(1.7, 1.7, 1.4), black, 0.7));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const socket = A.mesh(A.cyl(0.32, 0.32, 0.2), mat(MET), 1.35);
      socket.position.set(Math.cos(a) * 0.95, 1.35, Math.sin(a) * 0.95); octa.add(socket);
    }
    A.addPart({
      name: 'Octaweb', tag: 'Structure', label: 'Octaweb', labelY: 1.2, layer: 'structure', stage: 'first', explode: [0, -6, 0],
      desc: 'Engine mounting structure at the base of the booster. Eight Merlins in a ring around one center engine.',
      specs: [['Engines', '9'], ['Material', 'Aluminum structure']], mesh: octa,
    });

    const merlins = A.group();
    const spots = [[0, 0], [0.95, 0], [-0.95, 0], [0, 0.95], [0, -0.95], [0.67, 0.67], [-0.67, 0.67], [0.67, -0.67], [-0.67, -0.67]];
    spots.forEach(([x, z]) => {
      const e = merlin(true); e.position.set(x, 0.05, z); merlins.add(e);
      const pl = plume(3.2, 0.38, 0xff9a3c); pl.position.set(x, -0.9, z); merlins.add(pl); A.addPlume(pl);
    });
    A.addPart({
      name: 'Merlin 1D (sea level)', tag: 'Engine', label: '9 × Merlin', labelY: -0.4, layer: 'engines', stages: ['first', 'merlin'], explode: [0, -8, 0],
      desc: 'Nine sea-level Merlin 1D engines. The center engine and some outer engines restart for boostback, entry and landing burns.',
      specs: [['Count', '9'], ['Propellant', 'RP-1 + LOX'], ['Cycle', 'Gas generator']], mesh: merlins,
    });

    const tanks1 = A.group();
    tanks1.add(A.mesh(A.cyl(1.83, 1.83, 16.5), tankSkin, 12.2));
    tanks1.add(A.mesh(A.cyl(1.62, 1.62, 14.2), rpMat, 12.0));
    const domeB = A.mesh(A.sphere(1.83, 24, 12), tankSkin, 3.9); domeB.scale.y = 0.35; tanks1.add(domeB);
    const common = A.mesh(new THREE.TorusGeometry(1.55, 0.07, 8, 28), mat(0x8aa0c0), 20.5); tanks1.add(common);
    tanks1.add(A.mesh(A.cyl(1.83, 1.83, 14.8), skin, 28.8));
    tanks1.add(A.mesh(A.cyl(1.62, 1.62, 13.4), loxMat, 28.6));
    const dome = A.mesh(A.sphere(1.83, 24, 12), tankSkin, 36.2); dome.scale.y = 0.35; tanks1.add(dome);
    const race = A.mesh(new THREE.BoxGeometry(0.22, 30, 0.18), mat(0xcfc8bb), 20);
    race.position.x = 1.78; tanks1.add(race);
    A.addPart({
      name: 'First-stage tanks', tag: 'Propellant', label: 'LOX + RP-1', labelY: 22, layer: 'tanks', stage: 'first',
      desc: 'LOX sits above RP-1, separated by a common dome. Subcooled propellant packs more mass into the same tanks. The external raceway carries wiring and pipes.',
      specs: [['LOX', 'Upper tank'], ['RP-1', 'Lower tank'], ['Diameter', '3.66 m']], mesh: tanks1,
    });
    A.addFlow(new THREE.Vector3(0.6, 28, 0), new THREE.Vector3(0.4, 1.2, 0), 0x2ad4ff, 12);
    A.addFlow(new THREE.Vector3(-0.6, 16, 0), new THREE.Vector3(-0.4, 1.2, 0), 0xffa21a, 10);

    const aero = A.group();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      const fin = gridFin();
      fin.position.set(Math.cos(a) * 1.95, 38.2, Math.sin(a) * 1.95);
      fin.lookAt(0, 38.2, 0); aero.add(fin);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 8.2, 0.18), mat(LEG));
      leg.position.set(Math.cos(a) * 2.05, 5.2, Math.sin(a) * 2.05);
      leg.rotation.z = Math.cos(a) * 0.18; leg.rotation.x = -Math.sin(a) * 0.18; aero.add(leg);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.16, 10), mat(0x888888));
      foot.position.set(Math.cos(a) * 2.55, 1.15, Math.sin(a) * 2.55); aero.add(foot);
    }
    A.addPart({
      name: 'Grid fins & landing legs', tag: 'Recovery', label: 'Grid fins', labelY: 38, layer: 'aero', stage: 'first', explode: [4, 0, 0],
      desc: 'Four titanium grid fins steer the booster in the atmosphere. Four legs fold out just before touchdown on a drone ship or landing zone.',
      specs: [['Fins', '4 titanium'], ['Legs', '4, hypersonic-deployed']], mesh: aero,
    });

    const inter = A.group();
    inter.add(A.mesh(A.cyl(1.83, 1.83, 4.6), black, 41.6));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const vent = A.mesh(A.cyl(0.08, 0.08, 0.5), mat(MET), 43.4);
      vent.position.set(Math.cos(a) * 1.83, 43.4, Math.sin(a) * 1.83);
      vent.rotation.z = Math.PI / 2; inter.add(vent);
    }
    A.addPart({
      name: 'Interstage', tag: 'Structure', label: 'Interstage', labelY: 41.6, layer: 'structure', stage: 'first', explode: [0, 2, 0],
      desc: 'Carbon-composite section that hides the second-stage engine at liftoff and stays with the booster after separation. The grid fins mount near its base.',
      specs: [['Type', 'Carbon composite'], ['Holds', 'MVac nozzle at liftoff']], mesh: inter,
    });

    const s2 = A.group();
    s2.add(A.mesh(A.cyl(1.83, 1.83, 8.8), skin, 48.4));
    s2.add(A.mesh(A.cyl(1.58, 1.58, 4.2), rpMat, 46.6));
    s2.add(A.mesh(A.cyl(1.58, 1.58, 3.6), loxMat, 50.8));
    const s2d = A.mesh(A.sphere(1.83, 20, 10), tankSkin, 52.9); s2d.scale.y = 0.32; s2.add(s2d);
    const vac = merlin(false); vac.position.y = 43.4; s2.add(vac);
    const pl2 = plume(4.6, 0.9, 0xffc56a); pl2.position.y = 41.6; s2.add(pl2); A.addPlume(pl2);
    A.addPart({
      name: 'Second stage + MVac', tag: 'Upper stage', label: 'Second stage', labelY: 48, layer: 'engines', stages: ['second', 'merlin'], explode: [0, 8, 0],
      desc: 'RP-1/LOX upper stage with one Merlin Vacuum. The big nozzle is designed for vacuum Isp, not sea-level thrust.',
      specs: [['Engine', '1 × Merlin Vacuum'], ['Fairing jettison', 'After leaving atmosphere']], mesh: s2,
    });
    A.addFlow(new THREE.Vector3(0.5, 51.5, 0), new THREE.Vector3(0.2, 44.2, 0), 0x2ad4ff, 8);
    A.addFlow(new THREE.Vector3(-0.5, 49, 0), new THREE.Vector3(-0.2, 44.2, 0), 0xffa21a, 7);

    const fair = A.group();
    fair.add(A.mesh(A.cyl(1.83, 1.83, 8.2), skin, 58.8));
    const nose = A.mesh(A.cone(1.83, 4.6, 24), skin, 65.2); fair.add(nose);
    const sat = A.mesh(A.cyl(1.2, 1.2, 3.2), mat(0x8899aa, { metalness: 0.4 }), 57.4); fair.add(sat);
    A.addPart({
      name: 'Payload fairing', tag: 'Payload', label: 'Fairing', labelY: 60, layer: 'payload', stage: 'second', explode: [0, 12, 0],
      desc: 'Two-shell composite fairing that protects the satellite on the way up and is caught or landed for reuse on many flights. Crew Dragon replaces the fairing on crew missions.',
      specs: [['Type', '2-shell composite'], ['Reuse', 'Often recovered']], mesh: fair,
    });
  },
});

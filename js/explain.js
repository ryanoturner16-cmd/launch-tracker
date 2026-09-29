// Template-based, plain-language mission explanation built ONLY from API fields.
// General glossary text (what an orbit type / mission category means) is labelled as background,
// everything else is taken directly from the Launch Library 2 record.

const ORBIT_GLOSS = {
  LEO: 'Low Earth Orbit is the region roughly 160–2,000 km above Earth. Objects there circle the planet about every 90–120 minutes.',
  SSO: 'A Sun-synchronous orbit is a near-polar low orbit that passes over each spot on Earth at about the same local solar time every day, which suits imaging and weather satellites.',
  PO: 'A polar orbit passes over (or near) both poles, so the satellite sees the whole Earth as the planet rotates beneath it.',
  GTO: 'A geostationary transfer orbit is an elongated orbit that reaches up to about 35,786 km. The satellite later raises its low point to settle into geostationary orbit.',
  GEO: 'Geostationary orbit sits about 35,786 km above the equator. A satellite there stays over the same spot on Earth.',
  GSO: 'A geosynchronous orbit takes one day per revolution (about 35,786 km up).',
  MEO: 'Medium Earth Orbit lies between low orbit and geostationary altitude (roughly 2,000–35,786 km). Navigation constellations such as GPS and Galileo operate here.',
  HEO: 'A highly elliptical orbit swings very far from Earth at one end and close at the other.',
  SO: 'A suborbital flight goes to space (or high altitude) but falls back without completing a full orbit.',
  'Sub': 'A suborbital flight goes to space (or high altitude) but falls back without completing a full orbit.',
  TLI: 'A trans-lunar injection sends the spacecraft on a path toward the Moon.',
  LO: 'Lunar orbit means the spacecraft is headed to orbit the Moon.',
  Lunar: 'The destination is the Moon.',
  'Helio-N/A': 'A heliocentric orbit circles the Sun rather than Earth, used by deep-space missions.',
  HCO: 'A heliocentric orbit circles the Sun rather than Earth, used by deep-space missions.',
  MO: 'The spacecraft is bound for orbit around Mars.',
  'L1': 'The Sun–Earth or Earth–Moon L1 Lagrange point is a gravitational balance point where a spacecraft can hover with little fuel.',
  'L2': 'The L2 Lagrange point is a gravitational balance point on the far side of Earth (or the Moon) used by observatories.',
  VLEO: 'Very Low Earth Orbit is below about 450 km, where thin air drag is significant.',
};
const ORBIT_BY_NAME = [
  [/sun-?synchronous/i, 'SSO'], [/geostationary transfer/i, 'GTO'], [/geostationary/i, 'GEO'], [/geosynchronous/i, 'GSO'],
  [/low earth/i, 'LEO'], [/medium earth/i, 'MEO'], [/polar/i, 'PO'], [/elliptical/i, 'HEO'], [/sub-?orbital/i, 'SO'],
  [/trans-?lunar/i, 'TLI'], [/lunar/i, 'LO'], [/helio/i, 'HCO'], [/mars/i, 'MO'],
];

const TYPE_GLOSS = {
  'Communications': 'Communications missions launch satellites that relay internet, phone, TV or data signals.',
  'Earth Science': 'Earth science missions observe the planet — weather, climate, land, oceans or ice.',
  'Navigation': 'Navigation missions add satellites to positioning systems (like GPS, Galileo, BeiDou or NavIC) that phones and receivers use to work out where they are.',
  'Government/Top Secret': 'Government / classified missions carry payloads whose details are mostly not public.',
  'Human Exploration': 'Human exploration missions carry astronauts.',
  'Resupply': 'Resupply missions deliver cargo, food, experiments and equipment to a space station.',
  'Dedicated Rideshare': 'On a rideshare mission many small satellites from different customers share one rocket.',
  'Test Flight': 'A test flight is primarily about proving out the vehicle or its systems.',
  'Technology': 'Technology missions demonstrate new hardware or techniques in space.',
  'Planetary Science': 'Planetary science missions study other planets, moons or small bodies of the solar system.',
  'Lunar Exploration': 'Lunar exploration missions go to the Moon.',
  'Astrophysics': 'Astrophysics missions study stars, galaxies and the universe, usually with space telescopes.',
  'Heliophysics': 'Heliophysics missions study the Sun and its influence on space around Earth.',
  'Robotic Exploration': 'Robotic exploration missions send uncrewed spacecraft to explore.',
  'Tourism': 'Space tourism missions fly private passengers.',
  'Suborbital': 'Suborbital missions reach space briefly without going into orbit.',
};

const LANDING_TYPE = {
  ASDS: 'an autonomous drone ship at sea', RTLS: 'a landing zone back on land near the launch site',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const listJoin = (a) => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

export function orbitKey(orbit) {
  if (!orbit) return null;
  if (orbit.abbrev && ORBIT_GLOSS[orbit.abbrev]) return orbit.abbrev;
  for (const [re, k] of ORBIT_BY_NAME) if (re.test(orbit.name || '')) return k;
  return null;
}

/** Returns an array of {title, html, source} sections. */
export function explainMission(l) {
  const out = [];
  const m = l.mission || {};
  const rk = l.rocket || {};
  const prov = l.provider || {};

  // 1. The big picture
  const where = [l.pad.name, l.pad.location].filter(Boolean).join(', ');
  let s = `<b>${esc(prov.name || 'An unknown provider')}</b> ${isPast(l) ? 'launched' : 'plans to launch'} a <b>${esc(rk.full_name || rk.name)}</b> rocket`;
  if (where) s += ` from <b>${esc(where)}</b>`;
  s += '.';
  if (m.name) s += ` The mission is called <b>${esc(m.name)}</b>${m.type ? `, categorised as a <b>${esc(m.type)}</b> mission` : ''}.`;
  if (m.agencies && m.agencies.length) s += ` Agencies/customers listed: ${esc(listJoin(m.agencies))}.`;
  if (l.program && l.program.length) s += ` Part of: ${esc(listJoin(l.program))}.`;
  out.push({ title: 'In a nutshell', html: s, source: 'provider, rocket, pad, mission.name/type/agencies, program' });

  // 2. Official description, verbatim
  if (m.description) out.push({ title: 'Mission description', html: `<blockquote>${esc(m.description)}</blockquote>`, source: m.description_shortened ? 'mission.description (verbatim, shortened at a sentence end)' : 'mission.description (verbatim)' });

  // 3. What's on board
  const onboard = [];
  for (const sc of rk.spacecraft_stage || []) {
    let t = `The spacecraft is <b>${esc(sc.name || sc.config)}</b>`;
    if (sc.config && sc.name && !sc.name.includes(sc.config)) t += ` (a ${esc(sc.config)})`;
    if (sc.serial) t += `, serial ${esc(sc.serial)}`;
    t += '.';
    if (sc.destination) t += ` Destination: <b>${esc(sc.destination)}</b>.`;
    if (sc.crew && sc.crew.length) t += ` Crew (${sc.crew.length}): ${sc.crew.map((c) => `${esc(c.name)}${c.role ? ` <span class="muted">(${esc(c.role)})</span>` : ''}`).join(', ')}.`;
    else if (sc.human_rated) t += ' The spacecraft is human-rated; no crew is listed for this flight.';
    if (sc.landing) t += ` ${esc(sc.landing)}`;
    onboard.push(t);
  }
  for (const p of rk.payloads || []) {
    let t = `Payload: <b>${esc(p.name)}</b>`;
    const bits = [];
    if (p.amount && p.amount > 1) bits.push(`${p.amount} units`);
    if (p.type) bits.push(esc(p.type));
    if (p.operator) bits.push(`operated by ${esc(p.operator)}`);
    if (p.manufacturer) bits.push(`built by ${esc(p.manufacturer)}`);
    if (p.mass) bits.push(`${Number(p.mass).toLocaleString()} kg`);
    if (bits.length) t += ` — ${bits.join(', ')}`;
    t += '.';
    if (p.destination) t += ` Destination: ${esc(p.destination)}.`;
    onboard.push(t);
  }
  if (!onboard.length) onboard.push('The API record does not list individual payload or spacecraft details for this launch yet. The mission name and description above are the best available information.');
  out.push({ title: "What's on board", html: onboard.map((x) => `<p>${x}</p>`).join(''), source: 'rocket.spacecraft_stage, rocket.payloads' });

  // 4. Where it's going
  if (m.orbit && m.orbit.name && !/unknown/i.test(m.orbit.name)) {
    const k = orbitKey(m.orbit);
    let t = `Target orbit: <b>${esc(m.orbit.name)}</b>${m.orbit.abbrev ? ` (${esc(m.orbit.abbrev)})` : ''}.`;
    if (k) t += ` <span class="gloss">${ORBIT_GLOSS[k]}</span>`;
    out.push({ title: "Where it's going", html: t, source: 'mission.orbit (+ general orbit glossary)' });
  } else {
    out.push({ title: "Where it's going", html: 'The target orbit is not published in the API record.', source: 'mission.orbit' });
  }

  // 5. Mission type background
  if (m.type && TYPE_GLOSS[m.type]) out.push({ title: 'About this kind of mission', html: `<span class="gloss">${TYPE_GLOSS[m.type]}</span>`, source: 'mission.type (+ general glossary)' });

  // 6. The rocket & booster recovery
  const rb = [];
  let r = `${esc(rk.full_name || rk.name)}`;
  if (rk.manufacturer) r += ` is built by ${esc(rk.manufacturer)}`;
  const dims = [];
  if (rk.length) dims.push(`${rk.length} m tall`);
  if (rk.diameter) dims.push(`${rk.diameter} m wide`);
  if (dims.length) r += `${rk.manufacturer ? ' and is' : ' is'} ${dims.join(' and ')}`;
  r += '.';
  if (rk.leo_capacity) r += ` It can lift about ${Number(rk.leo_capacity).toLocaleString()} kg to low Earth orbit${rk.gto_capacity ? ` or ${Number(rk.gto_capacity).toLocaleString()} kg to GTO` : ''}.`;
  if (rk.total_launch_count != null) r += ` This configuration has ${rk.total_launch_count} recorded launches${rk.successful_launches != null ? ` (${rk.successful_launches} successful)` : ''}.`;
  rb.push(r);
  for (const st of rk.launcher_stage || []) {
    let t = `${st.type === 'Core' ? 'Booster' : esc(st.type || 'Stage')}${st.serial ? ` <b>${esc(st.serial)}</b>` : ''}`;
    if (st.flight_number) t += ` ${isPast(l) ? 'made' : 'is making'} its ${ordinal(st.flight_number)} flight${st.reused ? ' (flight-proven)' : ''}`;
    else t += ' is assigned';
    t += '.';
    if (st.landing && st.landing.attempt && isPast(l) && st.landing.success != null) {
      t += ` Landing attempt${st.landing.location && st.landing.location.name ? ` at <b>${esc(st.landing.location.name)}</b>` : ''}: <b>${st.landing.success ? 'successful' : 'not successful'}</b>.`;
    } else if (st.landing && st.landing.attempt) {
      const abbr = st.landing.type && st.landing.type.abbrev;
      const tname = st.landing.type && st.landing.type.name;
      t += ` ${isPast(l) ? "It attempted" : "It will attempt"} a landing${st.landing.location && st.landing.location.name ? ` at <b>${esc(st.landing.location.name)}</b>` : ''}${tname ? ` (${esc(tname)}${abbr && LANDING_TYPE[abbr] ? ` — ${LANDING_TYPE[abbr]}` : ''})` : ''}.`;
    } else if (st.landing && st.landing.attempt === false) t += isPast(l) ? ' No landing was attempted (expendable).' : ' No landing attempt is planned (expendable).';
    rb.push(t);
  }
  out.push({ title: 'The rocket', html: rb.map((x) => `<p>${x}</p>`).join(''), source: 'rocket.configuration, rocket.launcher_stage' });

  // 7. Timing
  const tw = [];
  const prec = l.net_precision && l.net_precision.name;
  if (l.status) tw.push(`Status: <b>${esc(l.status.name)}</b>${l.status.description ? ` — ${esc(l.status.description)}` : ''}`);
  if (prec) tw.push(`Launch time precision: <b>${esc(prec)}</b>${l.net_precision.description ? ` (${esc(l.net_precision.description.replace(/\.\s*$/, ''))})` : ''}`);
  if (l.window_start && l.window_end && l.window_start !== l.window_end) {
    const mins = Math.round((Date.parse(l.window_end) - Date.parse(l.window_start)) / 60000);
    if (mins > 0 && mins < 60 * 24 * 3) tw.push(`Launch window: ${mins >= 120 ? (mins / 60).toFixed(1) + ' hours' : mins + ' minutes'} long`);
  } else if (l.window_start && l.window_start === l.window_end && /^(second|minute)$/i.test(prec || '') && /^(Go|TBC)$/.test((l.status && l.status.abbrev) || '')) tw.push('Instantaneous launch window (it must go at exactly T-0 or scrub)');
  if (!isPast(l) && l.probability != null && l.probability >= 0) tw.push(`Weather forecast: ${l.probability}% chance of acceptable conditions${l.weather_concerns ? ` (concerns: ${esc(l.weather_concerns)})` : ''}`);
  if (l.hold_reason) tw.push(`Hold reason: ${esc(l.hold_reason)}`);
  if (l.fail_reason) tw.push(`Failure reason (from the data source): ${esc(l.fail_reason)}`);
  out.push({ title: 'Timing', html: tw.map((x) => `<p>${x.replace(/\.\s*$/, '')}.</p>`).join(''), source: 'status, net_precision, window_start/end, probability' });
  return out;
}

export function isPast(l) { return /success|failure|partial/i.test(l.status && l.status.name || ''); }

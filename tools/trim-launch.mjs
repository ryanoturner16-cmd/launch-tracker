// Reduce a detailed Launch Library 2 (v2.3.0) launch object to only the fields the app renders.
// Used by tools/fetch-launches.mjs. Not shipped to the browser.

const pick = (o, ...keys) => { if (!o) return null; const r = {}; for (const k of keys) if (o[k] !== undefined && o[k] !== null) r[k] = o[k]; return r; };
const nm = (o) => (o && o.name) || null;

// Only images hosted by The Space Devs' CDN are kept (the app's CSP allows img-src from these hosts only).
export const IMAGE_HOSTS = ['thespacedevs-prod.nyc3.digitaloceanspaces.com'];
const okImageUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && IMAGE_HOSTS.includes(x.host) ? x.href : null; } catch { return null; } };
const httpUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };

/** Image with credit + license. Images without credit AND without a known license are dropped. */
function image(img) {
  if (!img) return null;
  const url = okImageUrl(img.thumbnail_url || img.image_url);
  if (!url) return null;
  const credit = (img.credit || '').trim() || null;
  const lic = img.license && img.license.name && !/^unknown$/i.test(img.license.name) ? img.license.name : null;
  if (!credit && !lic) return null;
  return { url, credit, license: lic, license_url: (img.license && httpUrl(img.license.link)) || null };
}

const httpsUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password ? x.href : null; } catch { return null; } };
const nameOf = (x) => (typeof x === 'string' ? x : (x && x.name) || null);
/** Webcasts: https only, sorted by LL2 priority (lower = more important), at most 4, compact fields. */
function videos(list) {
  return (Array.isArray(list) ? list : [])
    .map((v) => ({
      url: httpsUrl(v && v.url),
      title: v && v.title ? String(v.title).slice(0, 100) : null,
      publisher: (nameOf(v && v.publisher) || '').slice(0, 40) || null,
      type: nameOf(v && v.type),
      priority: Number.isFinite(v && v.priority) ? v.priority : null,
      live: !!(v && v.live),
      start: v && v.start_time && !Number.isNaN(Date.parse(v.start_time)) ? v.start_time : null,
    }))
    .filter((v) => v.url)
    .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
    .slice(0, 4)
    .map((v) => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null && x !== false))); // drop empty fields (size)
}

export function trimLaunch(l) {
  const rk = l.rocket || {};
  const cfg = rk.configuration || {};
  const lsp = l.launch_service_provider || {};
  const m = l.mission || null;
  const pad = l.pad || {};
  const loc = pad.location || {};
  const sc = Array.isArray(rk.spacecraft_stage) ? rk.spacecraft_stage : (rk.spacecraft_stage ? [rk.spacecraft_stage] : []);
  return {
    id: l.id,
    name: l.name,
    net: l.net,
    window_start: l.window_start,
    window_end: l.window_end,
    net_precision: pick(l.net_precision, 'name', 'abbrev', 'description'),
    status: pick(l.status, 'id', 'name', 'abbrev', 'description'),
    probability: l.probability ?? null,
    weather_concerns: l.weather_concerns || null,
    hold_reason: l.holdreason || null,
    fail_reason: l.failreason || null,
    last_updated: l.last_updated,
    image: image(l.image),
    webcast_live: !!l.webcast_live,
    provider: {
      id: lsp.id, name: lsp.name, abbrev: lsp.abbrev || null,
      country: (lsp.country && lsp.country[0] && lsp.country[0].alpha_3_code) || null,
    },
    rocket: {
      name: cfg.name, full_name: cfg.full_name || cfg.name, variant: cfg.variant || null,
      manufacturer: nm(cfg.manufacturer),
      length: cfg.length ?? null, diameter: cfg.diameter ?? null,
      leo_capacity: cfg.leo_capacity ?? null, gto_capacity: cfg.gto_capacity ?? null,
      total_launch_count: cfg.total_launch_count ?? null,
      successful_launches: cfg.successful_launches ?? null,
      launcher_stage: (rk.launcher_stage || []).map((s) => ({
        type: s.type, reused: s.reused ?? null, flight_number: s.launcher_flight_number ?? null,
        serial: (s.launcher && s.launcher.serial_number) || null,
        landing: s.landing ? {
          attempt: s.landing.attempt ?? null,
          success: s.landing.success ?? null,
          type: s.landing.type ? pick(s.landing.type, 'name', 'abbrev') : null,
          location: s.landing.landing_location ? pick(s.landing.landing_location, 'name', 'abbrev') : null,
        } : null,
      })),
      spacecraft_stage: sc.map((s) => {
        const c = (s.spacecraft && s.spacecraft.spacecraft_config) || {};
        return {
          destination: s.destination || null,
          name: (s.spacecraft && s.spacecraft.name) || null, serial: (s.spacecraft && s.spacecraft.serial_number) || null,
          config: c.name || null, config_type: nm(c.type), human_rated: c.human_rated ?? null,
          crew: (s.launch_crew || []).map((cr) => ({ name: cr.astronaut && cr.astronaut.name, role: cr.role && cr.role.role })),
        };
      }),
      payloads: (rk.payloads || []).slice(0, 6).map((p) => {
        const pl = p.payload || {};
        return { name: pl.name || null, type: nm(pl.type), operator: nm(pl.operator), manufacturer: nm(pl.manufacturer), mass: pl.mass ?? null, destination: p.destination || null, amount: p.amount ?? null };
      }),
    },
    mission: m ? {
      name: m.name, type: m.type || null, description: m.description ? clip(String(m.description), 1000) : null, description_shortened: m.description ? String(m.description).length > 1000 : false,
      orbit: m.orbit ? { name: m.orbit.name, abbrev: m.orbit.abbrev } : null,
      agencies: (m.agencies || []).map((a) => a.abbrev || a.name),
    } : null,
    pad: {
      name: pad.name || null, map_url: httpUrl(pad.map_url),
      location: loc.name || null, timezone: loc.timezone_name || null,
      country: (pad.country && pad.country.alpha_3_code) || (loc.country && loc.country.alpha_3_code) || null,
    },
    program: (l.program || []).map(nm).filter(Boolean),
    vid_urls: videos(l.vid_urls),
    webcast_live: !!l.webcast_live,
    info_urls: (l.info_urls || []).map((v) => ({ title: v.title, url: httpUrl(v.url) })).filter((v) => v.url).slice(0, 2),
    flightclub_url: httpUrl(l.flightclub_url),
  };
}

// Shorten long text at a sentence (or word) boundary instead of mid-word.
export function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max); let sent = -1;
  for (const m of cut.matchAll(/[.!?](?=\s)/g)) sent = m.index;
  if (sent > max * 0.5) return cut.slice(0, sent + 1) + ' …';
  const sp = cut.lastIndexOf(' ');
  return cut.slice(0, sp > 0 ? sp : max) + ' …';
}

// Serves /players.json live from the DiamondTier list (refreshed about once a minute),
// with your own fixes from overrides.json applied. Everything else is the normal website.
import OV from "../overrides.json";

const SOURCE = "https://diamondtier.lovable.app/api/players/txt";
const MODES = ["crystal", "sword", "axe", "mace", "nethpot", "uhc", "dsmp", "smp"];

function parse(text) {
  const players = [];
  for (const line of text.split("\n")) {
    const at = line.indexOf(" — ");
    if (at < 0) continue;
    const name = line.slice(0, at).trim();
    const tiers = {};
    for (const part of line.slice(at + 3).split("|")) {
      const m = part.match(/^\s*(\w+):\s*([HL]T[1-5])/);
      if (m && MODES.includes(m[1])) tiers[m[1]] = m[2];
    }
    if (name && Object.keys(tiers).length) players.push({ name: name, tiers: tiers });
  }
  return players;
}

function lowerKeys(obj) {
  const out = {};
  for (const k of Object.keys(obj || {})) out[k.toLowerCase()] = obj[k];
  return out;
}

function build(players, base) {
  const rename = lowerKeys(OV.rename);
  const regions = lowerKeys(OV.regions);
  const remove = new Set((OV.remove || []).map((n) => n.toLowerCase()));
  const seen = new Set();
  const out = [];
  for (const p of players) {
    const name = rename[p.name.toLowerCase()] || p.name;
    if (remove.has(name.toLowerCase()) || remove.has(p.name.toLowerCase()) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const entry = { name: name };
    if (regions[name.toLowerCase()]) entry.region = regions[name.toLowerCase()];
    entry.tiers = p.tiers;
    out.push(entry);
  }
  const extras = [];
  for (const e of OV.extraPlayers || []) {
    if (seen.has(e.name.toLowerCase())) continue;
    seen.add(e.name.toLowerCase());
    extras.push(e);
  }
  const result = {
    players: extras.concat(out),
    updates: base.updates || [],
    tournaments: base.tournaments || [],
    subtiers: base.subtiers || [],
  };
  if ("subtiersOpen" in base) result.subtiersOpen = base.subtiersOpen;
  result.tags = OV.tags || {};
  result.display = OV.display || {};
  return result;
}

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=60",
  "access-control-allow-origin": "*",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/players.json") return env.ASSETS.fetch(request);

    // the saved copy (also holds updates / tournaments / subtiers, and is the fallback)
    const saved = await env.ASSETS.fetch(new Request(new URL("/players.json", url)));
    const savedText = await saved.text();
    let base = {};
    try { base = JSON.parse(savedText); } catch (e) {}

    try {
      const res = await fetch(SOURCE, { cf: { cacheTtl: 60, cacheEverything: true } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const players = parse(await res.text());
      if (players.length < 10) throw new Error("source looks wrong");
      return new Response(JSON.stringify(build(players, base)), { headers: HEADERS });
    } catch (e) {
      return new Response(savedText, { headers: HEADERS });
    }
  },
};

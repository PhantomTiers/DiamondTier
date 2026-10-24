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


// ---------- AI assistant (/api/chat) ----------
const SYSTEM = [
  "You are the AI assistant on DiamondTier, a Minecraft PvP tier list website. Be friendly, clear and brief.",
  "You can answer general questions about anything, plus Minecraft and DiamondTier.",
  "DiamondTier facts: gamemodes are Crystal, Sword, Axe, Mace, Netherite Pot, UHC, Diamond SMP and SMP.",
  "Tiers go HT1, LT1, HT2, LT2, HT3, LT3, HT4, LT4, HT5, LT5 (HT1 best). Points: 70, 55, 46, 32, 25, 13, 7, 4, 2, 1 in that order.",
  "There is also a DiamondTier Tags Fabric mod for Minecraft 1.21.11 that shows tiers above players' heads.",
  "Keep everything safe for work and family-friendly. Never produce sexual, 18+, graphic violence, hateful, self-harm or illegal content.",
  "If someone asks for something like that or sends nonsense or spam, reply only with: I can't help with that.",
].join(" ");
const REFUSAL = "I can't help with that.";
const hits = new Map();

function jsonOut(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function chat(request, env) {
  if (request.method !== "POST") return jsonOut({ error: "POST only" }, 405);
  if (!env.AI) return jsonOut({ error: "AI is not set up" }, 503);

  // simple per-visitor limit: 20 messages a minute
  const ip = request.headers.get("cf-connecting-ip") || "x";
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 20) return jsonOut({ reply: "Slow down a little and try again in a minute." }, 429);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();

  let body;
  try { body = await request.json(); } catch (e) { return jsonOut({ error: "bad request" }, 400); }
  const raw = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
  const messages = [];
  for (const m of raw) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") continue;
    const content = m.content.slice(0, 500).trim();
    if (content) messages.push({ role: m.role, content: content });
  }
  if (!messages.length || messages[messages.length - 1].role !== "user") return jsonOut({ error: "no message" }, 400);

  try {
    // safety check on the whole conversation first
    const guard = await env.AI.run("@cf/meta/llama-guard-3-8b", { messages: messages });
    const verdict = JSON.stringify(guard && guard.response !== undefined ? guard.response : guard).toLowerCase();
    if (verdict.includes("unsafe") || verdict.includes('"safe":false')) return jsonOut({ reply: REFUSAL });

    const out = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "system", content: SYSTEM }].concat(messages),
      max_tokens: 400,
    });
    const reply = String((out && out.response) || "").trim();
    return jsonOut({ reply: reply || REFUSAL });
  } catch (e) {
    return jsonOut({ error: "AI error" }, 502);
  }
}

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=60",
  "access-control-allow-origin": "*",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/chat") return chat(request, env);
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

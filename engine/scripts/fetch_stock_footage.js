#!/usr/bin/env node
/**
 * Phase 1: Stock Footage Fetcher (Pexels API)
 * Reads scene manifest -> extracts keywords -> fetches HD clips -> saves to assets/footage/
 * Cost: FREE (Pexels free tier, commercial use, HD quality)
 */

"use strict";

const fs   = require("fs");
const path = require("path");
const https = require("https");

// --- Config ---
const ROOT_DIR = path.resolve(__dirname, "../..");

function loadEnv() {
  const envFile = path.join(ROOT_DIR, ".env");
  if (!fs.existsSync(envFile)) return;
  fs.readFileSync(envFile, "utf8").split("\n").forEach(line => {
    const eqIdx = line.indexOf("=");
    if (eqIdx < 1) return;
    const k = line.slice(0, eqIdx).trim();
    const v = line.slice(eqIdx + 1).trim();
    if (k && !k.startsWith("#")) process.env[k] = v;
  });
}
loadEnv();

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
if (!PEXELS_API_KEY) throw new Error("PEXELS_API_KEY not found in .env");

// --- Shot Keyword Map ---
// Each SHOT_XX maps to Pexels-friendly search terms
const SHOT_KEYWORD_MAP = {
  SHOT_01: "man talking camera studio moody",
  SHOT_02: "man speaking closeup studio dramatic",
  SHOT_03: "black gym bag car floor night",
  SHOT_04: "man washing car driveway sunny",
  SHOT_05: "house party backyard night",
  SHOT_06: "young man driver seat car night",
  SHOT_07: "gym bag car passenger seat",
  SHOT_08: "car driving highway night",
  SHOT_09: "highway night driving empty road",
  SHOT_10: "car dashboard night driving",
  SHOT_11: "police car parked dark highway",
  SHOT_12: "speedometer car sixty mph",
  SHOT_13: "police lights red blue flashing",
  SHOT_14: "rearview mirror lights reflection night",
  SHOT_15: "man driver seat anxious surprised",
  SHOT_16: "car pulling over gravel road",
  SHOT_17: "car hazard lights flashing",
  SHOT_18: "driver hands steering wheel",
  SHOT_19: "passenger seat man sweating nervous",
  SHOT_20: "man gripping bag knuckles white",
  SHOT_21: "man whispering urgent passenger",
  SHOT_22: "close up shocked face car",
  SHOT_23: "black gym bag close up floor",
  SHOT_24: "man terrified eyes wide open",
  SHOT_25: "prison bars dark dramatic",
  SHOT_26: "police boots gravel footsteps night",
  SHOT_27: "man gripping steering wheel",
  SHOT_28: "police flashlight bright beam",
  SHOT_29: "car window rolling down police",
  SHOT_30: "police officer night traffic stop",
  SHOT_31: "man driver nervous police officer",
  SHOT_32: "police flashlight scanning car",
  SHOT_33: "police officer suspicious looking car",
  SHOT_34: "man trembling hands holding paper",
  SHOT_35: "police officer stern expression",
  SHOT_36: "flashlight beam sweeping dashboard",
  SHOT_37: "police flashlight bag car floor",
  SHOT_38: "scared eyes face man closeup",
  SHOT_39: "police radio communication dispatch",
  SHOT_40: "police officer walking away car",
  SHOT_41: "police car lights turning off",
  SHOT_42: "police cruiser driving away highway",
  SHOT_43: "man exhaling relief car seat",
  SHOT_44: "man sitting car silent night",
  SHOT_45: "two men car silent not talking",
  SHOT_46: "empty highway night streetlights",
  SHOT_47: "young man driving dark night",
  SHOT_48: "car parked driveway night",
  SHOT_49: "man sitting alone car night",
  SHOT_50: "two friends sad silence",
  SHOT_51: "highway dawn early morning",
  SHOT_52: "man walking away alone"
};

// --- API Helpers ---
function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const follow = (u, depth) => {
      if (depth > 5) return reject(new Error("Too many redirects"));
      const mod = u.startsWith("https") ? require("https") : require("http");
      mod.get(u, { headers }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return follow(res.headers.location, depth + 1);
        }
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      }).on("error", reject);
    };
    follow(url, 0);
  });
}

async function searchPexels(query, perPage = 8) {
  const url = "https://api.pexels.com/videos/search?query=" + encodeURIComponent(query) + "&per_page=" + perPage + "&orientation=landscape&size=medium";
  const res = await httpsGet(url, { Authorization: PEXELS_API_KEY });
  if (res.status !== 200) throw new Error("Pexels API error " + res.status + " for: " + query);
  return JSON.parse(res.body.toString());
}

function bestFile(video) {
  return (video.video_files || []).sort((a, b) => {
    const h = x => (x.height >= 1080 ? 3 : x.height >= 720 ? 2 : 1);
    const q = x => (x.quality === "hd" ? 2 : 1);
    return (h(b) + q(b)) - (h(a) + q(a));
  })[0];
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (u, d) => {
      if (d > 5) return reject(new Error("Redirect loop"));
      const mod = u.startsWith("https") ? require("https") : require("http");
      mod.get(u, res => {
        if (res.statusCode >= 300 && res.statusCode < 400) return follow(res.headers.location, d + 1);
        if (res.statusCode !== 200) return reject(new Error("HTTP " + res.statusCode));
        const f = fs.createWriteStream(dest);
        res.pipe(f);
        f.on("finish", () => { f.close(); resolve(); });
        f.on("error", reject);
      }).on("error", reject);
    };
    follow(url, 0);
  });
}

// --- Main ---
async function run(episodeId, projectDirOverride = null) {
  const projectManager = require("../projects/project_manager");
  const epDir  = projectManager.resolveEpisodeDir(episodeId, projectDirOverride);
  const outDir = path.join(epDir, "assets", "footage");
  fs.mkdirSync(outDir, { recursive: true });

  const scene = JSON.parse(fs.readFileSync(path.join(epDir, "scene_generation_manifest.json"), "utf8"));
  const allShots = scene.batches.flatMap(b => b.shots.map(s => ({ shotId: s, audio: b.audio_file, tc: b.timecode_range })));

  console.log("\n=== PHASE 1: STOCK FOOTAGE FETCHER ===");
  console.log("Episode:", episodeId, "| Shots:", allShots.length);
  console.log("Output:", outDir, "\n");

  const manifest = { episode_id: episodeId, generated_at: new Date().toISOString(), shots: [] };
  let ok = 0, skip = 0, fail = 0;

  for (const { shotId, audio, tc } of allShots) {
    const dest = path.join(outDir, shotId + ".mp4");
    if (fs.existsSync(dest) && fs.statSync(dest).size > 50000) {
      process.stdout.write("[SKIP] " + shotId + " (cached)\n");
      manifest.shots.push({ shotId, audio, tc, file: "assets/footage/" + shotId + ".mp4", status: "cached" });
      skip++;
      continue;
    }

    const kw = SHOT_KEYWORD_MAP[shotId] || "cinematic dramatic";
    process.stdout.write("[FETCH] " + shotId + " | \"" + kw + "\"... ");

    try {
      let data = await searchPexels(kw, 8);
      if (!data.videos || !data.videos.length) {
        const short = kw.split(" ").slice(0, 3).join(" ");
        data = await searchPexels(short, 5);
      }
      if (!data.videos || !data.videos.length) throw new Error("No results");

      const vid = data.videos.reduce((a, b) => b.duration > a.duration ? b : a);
      const file = bestFile(vid);
      if (!file || !file.link) throw new Error("No downloadable file");

      process.stdout.write(file.width + "x" + file.height + " " + vid.duration + "s | Downloading... ");
      await download(file.link, dest);
      const mb = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
      process.stdout.write("OK " + mb + "MB\n");

      manifest.shots.push({ shotId, audio, tc, file: "assets/footage/" + shotId + ".mp4", pexels_id: vid.id, duration_sec: vid.duration, resolution: file.width + "x" + file.height, query: kw, status: "ok" });
      ok++;
    } catch (e) {
      process.stdout.write("FAIL: " + e.message + "\n");
      manifest.shots.push({ shotId, audio, tc, file: null, query: kw, status: "error", error: e.message });
      fail++;
    }

    await new Promise(r => setTimeout(r, 350)); // Pexels rate limit
  }

  fs.writeFileSync(path.join(epDir, "footage_manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log("\n--- COMPLETE ---");
  console.log("Downloaded:", ok, "| Cached:", skip, "| Failed:", fail);
  console.log("Manifest:", path.join(epDir, "footage_manifest.json"), "\n");
}

run(process.argv[2] || "EP001").catch(e => { console.error("[ERROR]", e.message); process.exit(1); });

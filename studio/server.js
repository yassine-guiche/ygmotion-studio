#!/usr/bin/env node
/**
 * YGMotion Studio Web Server V3 (Multi-Channel & Project Platform Edition)
 * Supports Option A (Central + External Picker) & Option B (Project Launcher Hub)
 */

"use strict";

const http = require("http");
const fs   = require("fs");
const path = require("path");
const { exec, spawn } = require("child_process");

const styleManager = require("../engine/styles/style_manager");
const colabEngine  = require("../engine/scripts/colab_engine");
const CalliopeBridge = require("../engine/scripts/calliope_bridge");
const characterContinuity = require("../engine/styles/character_continuity");
const projectManager = require("../engine/projects/project_manager");
const scriptToVisuals = require("../engine/scripts/script_to_visuals");
const youtubeChannelAnalyzer = require("../engine/scrapers/youtube_channel_analyzer");
const scriptGenerator = require("../engine/ai/script_generator");
const voiceDesigner = require("../engine/audio/voice_designer");
const motionEngine = require("../engine/motion/motion_engine");
const geminiEngine = require("../engine/ai/gemini_engine");
const automatedProducer = require("../engine/pipeline/automated_producer");

const calliopeBridge = new CalliopeBridge();

const PORT = 3300;
const ROOT_DIR = path.resolve(__dirname, "..");
const STUDIO_PUBLIC = path.join(__dirname, "public");
const BRAND_PROFILE_FILE = path.join(__dirname, "brand_profile.json");
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

const MIME_TYPES = {
  ".html": "text/html",
  ".css":  "text/css",
  ".js":   "application/javascript",
  ".json": "application/json",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg":  "image/svg+xml",
  ".mp4":  "video/mp4",
  ".mp3":  "audio/mpeg",
  ".srt":  "text/plain",
  ".ass":  "text/plain",
  ".md":   "text/markdown"
};

function getActivePaths() {
  const active = projectManager.getActiveProjectInfo();
  const projectDir = active.path;
  const epDir = path.join(projectDir, "episodes");
  const assetDir = path.join(projectDir, "channel_assets");
  if (!fs.existsSync(epDir)) fs.mkdirSync(epDir, { recursive: true });
  if (!fs.existsSync(assetDir)) fs.mkdirSync(assetDir, { recursive: true });
  return {
    active,
    projectDir,
    episodesDir: epDir,
    assetsDir: assetDir
  };
}

function streamFile(req, res, filePath) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("404 Not Found");
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (e) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("404 Not Found");
  }

  if (stat.isDirectory()) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    return res.end("403 Forbidden");
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    let end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

    // Validate byte range boundaries (prevent ERR_OUT_OF_RANGE)
    if (isNaN(start) || start < 0 || start >= stat.size || end < start) {
      res.writeHead(416, {
        "Content-Range": `bytes */${stat.size}`,
        "Access-Control-Allow-Origin": "*"
      });
      return res.end();
    }

    if (isNaN(end) || end >= stat.size) {
      end = stat.size - 1;
    }

    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    file.on("error", (err) => {
      console.warn("Media stream warning:", err.message);
      if (!res.headersSent) {
        res.writeHead(500);
      }
      res.end();
    });

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*"
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": stat.size,
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*"
    });
    const file = fs.createReadStream(filePath);
    file.on("error", (err) => {
      console.warn("File stream warning:", err.message);
      if (!res.headersSent) {
        res.writeHead(500);
      }
      res.end();
    });
    file.pipe(res);
  }
}

function getEpisodeSummary(epId) {
  const { episodesDir, active, projectDir } = getActivePaths();
  const epDir = path.join(episodesDir, epId);
  if (!fs.existsSync(epDir) || !fs.statSync(epDir).isDirectory()) return null;

  const scriptPath = path.join(epDir, "script_master.md");
  const scriptDataPath = path.join(epDir, "script_data.json");
  const footageManifestPath = path.join(epDir, "footage_manifest.json");
  const voiceChunksPath = path.join(epDir, "voice_chunks.json");
  const mixedAudioPath = path.join(epDir, "audio", `${epId.toLowerCase()}_mixed_master.mp3`);
  const finalVideoCandidates = [
    path.join(epDir, `${epId}_FINAL_VIDEO_1080P.mp4`),
    path.join(epDir, `${epId}_FULL_EPISODE_10MIN_MASTER_READY_TO_WATCH.mp4`),
    path.join(projectDir, "renders", `${epId}_FINAL_VIDEO_1080P.mp4`)
  ];

  let finalVideo = null;
  for (const v of finalVideoCandidates) {
    if (fs.existsSync(v)) {
      const st = fs.statSync(v);
      finalVideo = {
        name: path.basename(v),
        path: `/media/${epId}/${path.basename(v)}`,
        sizeBytes: st.size,
        sizeMb: (st.size / (1024 * 1024)).toFixed(1)
      };
      break;
    }
  }

  let shotCount = 0;
  if (fs.existsSync(footageManifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(footageManifestPath, "utf8"));
      shotCount = (manifest.shots || []).length;
    } catch {}
  } else {
    const footageDir = path.join(epDir, "assets", "footage");
    if (fs.existsSync(footageDir)) {
      shotCount = fs.readdirSync(footageDir).filter(f => f.endsWith(".mp4")).length;
    }
  }

  const hasScript = fs.existsSync(scriptPath);
  const hasVoice = fs.existsSync(voiceChunksPath);
  const hasAudio = fs.existsSync(mixedAudioPath);
  const hasCaptions = fs.existsSync(path.join(epDir, "subtitles_karaoke.ass")) || fs.existsSync(path.join(epDir, "subtitles_karaoke.srt"));
  const hasCapCutDraft = fs.existsSync(path.join(epDir, "capcut_draft", "draft_content.json"));

  // Detect real dynamic title
  let detectedTitle = null;
  if (fs.existsSync(scriptDataPath)) {
    try {
      const sData = JSON.parse(fs.readFileSync(scriptDataPath, "utf8"));
      if (sData.title && typeof sData.title === "string") detectedTitle = sData.title.trim();
    } catch {}
  }
  if (!detectedTitle && fs.existsSync(footageManifestPath)) {
    try {
      const mData = JSON.parse(fs.readFileSync(footageManifestPath, "utf8"));
      if (mData.title && typeof mData.title === "string") detectedTitle = mData.title.trim();
    } catch {}
  }
  if (!detectedTitle && fs.existsSync(scriptPath)) {
    try {
      const lines = fs.readFileSync(scriptPath, "utf8").split("\n");
      const h1 = lines.find(l => l.startsWith("# "));
      if (h1) detectedTitle = h1.replace(/^#\s*/, "").replace(/Master Script:?\s*/i, "").trim();
    } catch {}
  }

  return {
    id: epId,
    title: detectedTitle || `${active.name}: ${epId}`,
    hasScript,
    hasVoice,
    hasAudio,
    hasCaptions,
    hasCapCutDraft,
    shotCount,
    finalVideo,
    folderPath: epDir
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const paths = getActivePaths();

  // --- GOOGLE GEMINI CLOUD AI ENDPOINTS ---
  if (pathname === "/api/ai/gemini/status" && req.method === "GET") {
    try {
      const status = await geminiEngine.getStatus();
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(status));
    } catch (err) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ online: false, error: err.message }));
    }
  }

  if (pathname === "/api/ai/gemini/chat" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", async () => {
      try {
        const { message, history } = JSON.parse(body || "{}");
        const reply = await geminiEngine.chat({
          message,
          history,
          currentProject: paths.active,
          activeEpisode: "EP001"
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, reply }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // --- OLLAMA LOCAL AI STUDIO ENDPOINTS ---
  if (pathname === "/api/ai/ollama/status" && req.method === "GET") {
    const psReq = http.request(new URL("/api/ps", OLLAMA_HOST), (psRes) => {
      let data = "";
      psRes.on("data", (c) => (data += c));
      psRes.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const models = parsed.models || [];
          const totalVramBytes = models.reduce((acc, m) => acc + (m.size_vram || m.size || 0), 0);
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({
            online: true,
            isLoaded: models.length > 0,
            models: models.map(m => ({
              name: m.name,
              sizeVram: m.size_vram || m.size,
              expiresAt: m.expires_at
            })),
            totalVramMB: Math.round(totalVramBytes / (1024 * 1024)),
            totalVramGB: (totalVramBytes / (1024 * 1024 * 1024)).toFixed(2)
          }));
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: e.message, online: false }));
        }
      });
    });
    psReq.on("error", (err) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ online: false, isLoaded: false, error: err.message }));
    });
    psReq.end();
    return;
  }

  if (pathname === "/api/ai/ollama/start" && req.method === "POST") {
    try {
      const ollamaBin = "C:\\Users\\MSI\\AppData\\Local\\Programs\\Ollama\\ollama.exe";
      const proc = spawn(ollamaBin, ["serve"], { detached: true, stdio: "ignore" });
      proc.unref();
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: true, message: "Ollama service started" }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  if (pathname === "/api/ai/ollama/unload" && req.method === "POST") {
    const psReq = http.request(new URL("/api/ps", OLLAMA_HOST), (psRes) => {
      let data = "";
      psRes.on("data", (c) => (data += c));
      psRes.on("end", async () => {
        try {
          const parsed = JSON.parse(data);
          const models = parsed.models || [];
          for (const model of models) {
            await new Promise((resolve) => {
              const uReq = http.request(new URL("/api/generate", OLLAMA_HOST), {
                method: "POST",
                headers: { "Content-Type": "application/json" }
              }, (uRes) => {
                uRes.on("data", () => {});
                uRes.on("end", resolve);
              });
              uReq.write(JSON.stringify({ model: model.name, keep_alive: 0 }));
              uReq.end();
            });
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ status: "unloaded", count: models.length }));
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: e.message }));
        }
      });
    });
    psReq.on("error", (err) => {
      res.writeHead(502, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message }));
    });
    psReq.end();
    return;
  }

  if (pathname === "/api/ai/ollama/preload" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const { model } = JSON.parse(body || "{}");
        if (!model) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Missing model" }));
        }
        const pReq = http.request(new URL("/api/generate", OLLAMA_HOST), {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        }, (pRes) => {
          let pData = "";
          pRes.on("data", (c) => (pData += c));
          pRes.on("end", () => {
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ status: "loaded", model }));
          });
        });
        pReq.write(JSON.stringify({ model, keep_alive: "10m" }));
        pReq.end();
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (pathname === "/api/ai/ollama/chat" && req.method === "POST") {
    const targetUrl = new URL("/api/chat", OLLAMA_HOST);
    const proxyReq = http.request(targetUrl, {
      method: "POST",
      headers: { ...req.headers, host: targetUrl.host }
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on("error", (err) => {
      res.writeHead(502, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message }));
    });
    req.pipe(proxyReq);
    return;
  }

  // Media files: /media/<episodeId>/<subpath>
  if (pathname.startsWith("/media/")) {
    const relPath = pathname.slice("/media/".length);
    const targetFile = path.resolve(paths.episodesDir, relPath);
    if (!targetFile.startsWith(path.resolve(paths.episodesDir))) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      return res.end("403 Forbidden");
    }
    return streamFile(req, res, targetFile);
  }

  // Project Media files: /media-project/<slug>/<subpath>
  if (pathname.startsWith("/media-project/")) {
    const parts = pathname.slice("/media-project/".length).split("/");
    const slug = parts[0];
    const subpath = parts.slice(1).join("/");
    
    let projDir = path.resolve(ROOT_DIR, "projects", slug);
    if (paths.active && (paths.active.id === slug || path.basename(paths.active.path) === slug)) {
      projDir = path.resolve(paths.active.path);
    }
    const targetFile = path.resolve(projDir, subpath);
    if (!targetFile.startsWith(projDir)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      return res.end("403 Forbidden");
    }
    return streamFile(req, res, targetFile);
  }

  // Channel Assets: /channel_assets/<subpath>
  if (pathname.startsWith("/channel_assets/")) {
    const relPath = pathname.slice("/channel_assets/".length);
    const targetFile = path.resolve(paths.assetsDir, relPath);
    if (!targetFile.startsWith(path.resolve(paths.assetsDir))) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      return res.end("403 Forbidden");
    }
    return streamFile(req, res, targetFile);
  }

  // API: Get Multi-Channel Projects & Active Channel
  if (pathname === "/api/projects" && req.method === "GET") {
    const projects = projectManager.listProjects();
    const active = projectManager.getActiveProjectInfo();
    const templates = projectManager.listTemplates();
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ projects, active, templates }));
  }

  // API: Switch Active Project
  if (pathname === "/api/projects/switch" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      try {
        const { projectIdOrPath, idOrPath } = JSON.parse(body || "{}");
        const targetIdOrPath = projectIdOrPath || idOrPath;
        const updatedActive = projectManager.setActiveProject(targetIdOrPath);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, active: updatedActive }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Create New Channel Project
  if (pathname === "/api/projects/create" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      try {
        const data = JSON.parse(body || "{}");
        const newProj = projectManager.createProject(data);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, project: newProj }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Delete Channel Project
  if (pathname === "/api/projects/delete" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      try {
        const { projectIdOrPath, idOrPath } = JSON.parse(body || "{}");
        const target = projectIdOrPath || idOrPath;
        const result = projectManager.deleteProject(target);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Create / Save Custom Style Blueprint
  if (pathname === "/api/styles/create" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      try {
        const styleData = JSON.parse(body || "{}");
        const saved = styleManager.saveCustomStyle(styleData);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, style: saved }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Open External Channel Folder
  if (pathname === "/api/projects/open-external" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      try {
        const { folderPath } = JSON.parse(body || "{}");
        const opened = projectManager.openExternalFolder(folderPath);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, project: opened }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Get Channel Templates
  if (pathname === "/api/templates" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(projectManager.listTemplates()));
  }

  // API: Script-to-Visuals Generation (Documentary & POV Engines)
  if (pathname === "/api/script/generate-visuals" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      try {
        const { episodeId, chunks } = JSON.parse(body || "{}");
        const active = projectManager.getActiveProjectInfo();
        const epId = episodeId || "EP001";
        const epDir = path.join(paths.episodesDir, epId);
        const manifestPath = path.join(epDir, "footage_manifest.json");

        let scriptChunks = chunks;
        if (!scriptChunks) {
          // Parse from script_master.md if not passed
          const scriptFile = path.join(epDir, "script_master.md");
          if (fs.existsSync(scriptFile)) {
            const raw = fs.readFileSync(scriptFile, "utf8");
            const lines = raw.split("\n").filter(l => l.trim().length > 20 && !l.startsWith("#") && !l.startsWith("```"));
            scriptChunks = lines.slice(0, 30).map((l, i) => ({
              text: l.trim(),
              partId: 1,
              duration: 5.0
            }));
          }
        }

        const generatedShots = scriptToVisuals.generateShotsFromScript(scriptChunks || [], active);
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
          manifest.shots = generatedShots;
          manifest.updatedAt = new Date().toISOString();
          fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, count: generatedShots.length, shots: generatedShots }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Get Styles
  if (pathname === "/api/styles" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(styleManager.getAllStyles()));
  }

  // API: Get/Save Brand Profile
  if (pathname === "/api/brand-profile") {
    if (req.method === "GET") {
      let profile = {};
      const projProfile = path.join(paths.projectDir, "channel_profile.json");
      if (fs.existsSync(projProfile)) {
        try { profile = JSON.parse(fs.readFileSync(projProfile, "utf8")); } catch {}
      } else if (fs.existsSync(BRAND_PROFILE_FILE)) {
        try { profile = JSON.parse(fs.readFileSync(BRAND_PROFILE_FILE, "utf8")); } catch {}
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(profile));
    }
    if (req.method === "POST") {
      let body = "";
      req.on("data", c => { body += c; });
      req.on("end", () => {
        try {
          const updated = JSON.parse(body || "{}");
          updated.updatedAt = new Date().toISOString();
          const projProfile = path.join(paths.projectDir, "channel_profile.json");
          fs.writeFileSync(projProfile, JSON.stringify(updated, null, 2), "utf8");
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ success: true, profile: updated }));
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
  }

  // API: Colab Status
  if (pathname === "/api/colab/status" && req.method === "GET") {
    const isReady = colabEngine.checkColab();
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ready: isReady }));
  }

  // API: List Episodes
  if (pathname === "/api/episodes" && req.method === "GET") {
    const episodes = [];
    if (fs.existsSync(paths.episodesDir)) {
      const entries = fs.readdirSync(paths.episodesDir);
      for (const e of entries) {
        const summary = getEpisodeSummary(e);
        if (summary) episodes.push(summary);
      }
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ episodes }));
  }

  // API: Create Episode
  if (pathname === "/api/episode/create" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      try {
        const { episodeId, title, styleId } = JSON.parse(body || "{}");
        const newEp = projectManager.createEpisode(episodeId || "EP002", title, styleId, paths.projectDir);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, episode: newEp }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Episode Detail
  if (pathname.startsWith("/api/episode/") && !pathname.endsWith("/files") && req.method === "GET") {
    const epId = pathname.slice("/api/episode/".length);
    const epDir = path.join(paths.episodesDir, epId);
    if (!fs.existsSync(epDir)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Episode not found" }));
    }

    const summary = getEpisodeSummary(epId);
    const scriptPath = path.join(epDir, "script_master.md");
    const manifestPath = path.join(epDir, "footage_manifest.json");
    const srtPath = path.join(epDir, "subtitles_karaoke.srt");

    let scriptText = "";
    if (fs.existsSync(scriptPath)) scriptText = fs.readFileSync(scriptPath, "utf8");

    let shots = [];
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        const rawShots = manifest.shots || [];
        let runningTime = 0;

        shots = rawShots.map((s, idx) => {
          const duration = parseFloat(s.duration || 14.2);
          const startTime = s.startTime !== undefined ? s.startTime : runningTime;
          runningTime += duration;
          const endTime = s.endTime !== undefined ? s.endTime : runningTime;

          let videoUrl = null;
          let thumbnailUrl = null;

          // 1. Direct file check on disk
          if (s.file) {
            const shotPath = path.join(epDir, s.file);
            if (fs.existsSync(shotPath)) {
              const ext = path.extname(s.file).toLowerCase();
              if ([".mp4", ".mov", ".webm"].includes(ext)) {
                videoUrl = `/media/${epId}/${s.file}`;
              } else {
                thumbnailUrl = `/media/${epId}/${s.file}`;
              }
            }
          }

          // 2. Footage clip search in assets/footage
          if (!videoUrl) {
            const paddedIdx = String(idx + 1).padStart(2, "0");
            const footageCandidates = [
              path.join(epDir, "assets", "footage", `SHOT_${paddedIdx}.mp4`),
              path.join(epDir, "assets", "footage", `shot_${paddedIdx}.mp4`),
              path.join(ROOT_DIR, "projects", "crime_chronicles", "episodes", "EP001", "assets", "footage", `SHOT_${paddedIdx}.mp4`)
            ];
            for (const fc of footageCandidates) {
              if (fs.existsSync(fc)) {
                if (fc.startsWith(epDir)) {
                  videoUrl = `/media/${epId}/assets/footage/${path.basename(fc)}`;
                } else {
                  videoUrl = `/media-project/crime_chronicles/episodes/EP001/assets/footage/${path.basename(fc)}`;
                }
                break;
              }
            }
          }

          // 3. Character portrait if character-bound
          if (!thumbnailUrl && s.characterId) {
            const charFile = path.join(paths.assetsDir, "characters", s.characterId, "portrait.jpg");
            if (fs.existsSync(charFile)) {
              thumbnailUrl = `/channel_assets/characters/${s.characterId}/portrait.jpg`;
            }
          }

          // 4. Fallback to style reference image
          if (!thumbnailUrl) {
            thumbnailUrl = `/channel_assets/style/master_style_reference_16x9.jpg`;
          }

          const motionTypes = ["🎥 Slow Push In", "⚡ 2.5D Ken Burns", "✨ Pan Right", "🎬 Dutch Angle", "🔍 Macro Detail", "🚁 Drone Overhead"];
          const motion = s.motion || motionTypes[idx % motionTypes.length];

          return {
            ...s,
            startTime,
            endTime,
            duration,
            motion,
            visualPrompt: s.visualPrompt || s.text || `Shot ${idx + 1} narrative visual frame`,
            thumbnailUrl,
            videoUrl: videoUrl || (summary && summary.finalVideo ? summary.finalVideo.path : null),
            mediaUrl: videoUrl || thumbnailUrl
          };
        });
      } catch (err) {
        console.error("Error reading manifest:", err);
      }
    }

    let subtitles = "";
    if (fs.existsSync(srtPath)) subtitles = fs.readFileSync(srtPath, "utf8");

    const karaokeJsonPath = path.join(epDir, "subtitles_karaoke.json");
    let karaokeData = null;
    if (fs.existsSync(karaokeJsonPath)) {
      try {
        karaokeData = JSON.parse(fs.readFileSync(karaokeJsonPath, "utf8"));
      } catch {}
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      ...summary,
      scriptText,
      shots,
      subtitles,
      karaokeData
    }));
  }

  // API: Get Episode Directory Files (In-Tab Explorer)
  if (pathname.startsWith("/api/episode/") && pathname.endsWith("/files") && req.method === "GET") {
    const parts = pathname.split("/");
    const epId = parts[3];
    const epDir = path.join(paths.episodesDir, epId);
    if (!fs.existsSync(epDir)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Episode directory not found" }));
    }

    function scanDir(dir, prefix = "") {
      const items = [];
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith(".") || entry.name === "_tmp_render" || entry.name === "node_modules") continue;
          const full = path.join(dir, entry.name);
          const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            items.push({
              name: entry.name,
              relPath: rel,
              isDir: true,
              children: scanDir(full, rel)
            });
          } else {
            const st = fs.statSync(full);
            const ext = path.extname(entry.name).toLowerCase();
            const sizeMb = (st.size / (1024 * 1024)).toFixed(2);
            const sizeKb = (st.size / 1024).toFixed(1);
            const sizeFormatted = st.size > 1024 * 1024 ? `${sizeMb} MB` : `${sizeKb} KB`;
            items.push({
              name: entry.name,
              relPath: rel,
              mediaUrl: `/media/${epId}/${rel}`,
              isDir: false,
              ext,
              sizeBytes: st.size,
              sizeFormatted,
              modified: st.mtime
            });
          }
        }
      } catch (e) {}
      return items;
    }

    const fileTree = scanDir(epDir);
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      folderPath: epDir,
      episodeId: epId,
      files: fileTree
    }));
  }

  // API: Open in Windows Explorer
  if (pathname === "/api/open-folder" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      try {
        const { episodeId, subPath } = JSON.parse(body || "{}");
        const baseDir = path.join(paths.episodesDir, episodeId || "EP001");
        const targetDir = subPath ? path.join(baseDir, subPath) : baseDir;
        if (fs.existsSync(targetDir)) {
          exec(`explorer.exe "${targetDir}"`);
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ success: true, opened: targetDir }));
        }
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Folder not found" }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Export Full CapCut Timeline Draft
  if (pathname === "/api/export/capcut" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", async () => {
      try {
        const { episodeId } = JSON.parse(body || "{}");
        const targetId = episodeId || "EP001";
        const capcutBuilder = require("../engine/scripts/build_capcut_project");
        const result = await capcutBuilder.run(targetId, paths.projectDir);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: true,
          episodeId: targetId,
          ...result
        }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Trigger Video Render (supports styleId with real-time log tracking)
  if (pathname === "/api/render" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      try {
        const { episodeId, styleId } = JSON.parse(body || "{}");
        const targetId = episodeId || "EP001";
        const targetStyle = styleId || paths.active.category || "crime_suspense";
        const epDir = path.join(paths.episodesDir, targetId);
        if (!fs.existsSync(epDir)) fs.mkdirSync(epDir, { recursive: true });

        const logFile = path.join(epDir, "render.log");
        const logStream = fs.createWriteStream(logFile, { flags: "w" });

        const progressFile = path.join(epDir, "render_progress.json");
        fs.writeFileSync(progressFile, JSON.stringify({
          episodeId: targetId,
          styleId: targetStyle,
          status: "rendering",
          progress: 5,
          step: "Starting 1080p video render pipeline...",
          startedAt: new Date().toISOString()
        }, null, 2), "utf8");

        const renderProc = spawn("node", ["engine/scripts/render_video.js", targetId, targetStyle, paths.projectDir], {
          cwd: ROOT_DIR,
          detached: true
        });

        if (renderProc.stdout) renderProc.stdout.pipe(logStream);
        if (renderProc.stderr) renderProc.stderr.pipe(logStream);

        renderProc.on("close", (code) => {
          try { logStream.end(); } catch {}
          if (code !== 0) {
            try {
              fs.writeFileSync(progressFile, JSON.stringify({
                episodeId: targetId,
                styleId: targetStyle,
                status: "failed",
                progress: 0,
                step: `Render process exited with code ${code}`,
                error: `Render failed with code ${code}`,
                updatedAt: new Date().toISOString()
              }, null, 2), "utf8");
            } catch {}
          }
        });

        renderProc.unref();

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: true,
          message: `Render started for ${targetId} with style ${targetStyle}`,
          logUrl: `/media/${targetId}/render.log`
        }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Get Real-Time Render Progress Status
  if (pathname === "/api/render/status" && req.method === "GET") {
    const epId = url.searchParams.get("episodeId") || "EP001";
    const epDir = projectManager.resolveEpisodeDir(epId, paths.projectDir);
    const progressFile = path.join(epDir, "render_progress.json");
    if (fs.existsSync(progressFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(progressFile, "utf8"));
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(data));
      } catch {}
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "idle", progress: 0 }));
  }

  // API: 1-Click Automated Producer (Title -> 1080p Master Video)
  if (pathname === "/api/pipeline/auto-produce" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", async () => {
      try {
        const { title, episodeId, styleId, visualMode } = JSON.parse(body || "{}");
        if (!title) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Missing required video title" }));
        }

        const targetEpId = episodeId || automatedProducer.getNextEpisodeId(paths.projectDir);

        // Start production pipeline asynchronously
        automatedProducer.produceVideoFromTitle({
          title,
          episodeId: targetEpId,
          styleId: styleId || paths.active?.category || "crime_suspense",
          visualMode: visualMode || "hybrid",
          projectDirOverride: paths.projectDir
        }).catch(err => {
          console.error(`[PIPELINE ASYNC ERROR] ${targetEpId}:`, err.message);
        });

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: true,
          episodeId: targetEpId,
          title,
          visualMode: visualMode || "hybrid",
          message: `1-Click production initiated for "${title}". Track progress at /api/render/status?episodeId=${targetEpId}`
        }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: AI Idea to Viral Title & Visual Hook Expansion
  if (pathname === "/api/ai/expand-idea" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", async () => {
      try {
        const { idea, styleId } = JSON.parse(body || "{}");
        if (!idea) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Missing idea string" }));
        }

        const chosenStyle = styleManager.getStyle(styleId || paths.active?.category || "crime_suspense");
        const styleName = chosenStyle?.name || styleId || "Cinematic Storytelling";

        const prompt = `You are a viral YouTube channel strategist specializing in ${styleName}.
User's raw idea: "${idea}"
Style Archetype: "${chosenStyle?.id}" (${chosenStyle?.description})

Return a JSON object with:
1. "titles": Array of 4 high-CTR YouTube titles tailored for this specific niche (intriguing, high-curiosity, zero clickbait slop).
2. "openingHook": 2 sentences of high-retention narration opening.
3. "recommendedVisualMode": "photo" (for prehistoric/ancient/archival documentaries), "video" (for fast modern action/dashcam), or "hybrid" (for character dialogue + cinematic b-roll).
4. "visualKeywords": Array of 4 search terms for finding high-resolution stock video or generating 2.5D visual scenes.
Format strictly as JSON.`;

        let resultJson = null;
        try {
          const geminiRes = await geminiEngine.generateContent(prompt, { jsonMode: true, temperature: 0.6 });
          resultJson = JSON.parse(geminiRes.text);
        } catch (geminiErr) {
          console.warn("Gemini idea expansion fallback:", geminiErr.message);
          resultJson = {
            titles: [
              `${idea}: The Untold Truth`,
              `What Really Happened: ${idea}`,
              `The Shocking Mystery of ${idea}`,
              `How Everything Changed: ${idea}`
            ],
            openingHook: `Most people believe they know the story of ${idea}. But what really happened was far more unsettling.`,
            recommendedVisualMode: styleId === "deep_epoch" ? "photo" : "hybrid",
            visualKeywords: [idea, "cinematic atmosphere", "dramatic mystery", "dark lighting"]
          };
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: true,
          style: chosenStyle?.id,
          styleName,
          ...resultJson
        }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Calliope Studio Integration
  if (pathname === "/api/calliope/status" && req.method === "GET") {
    try {
      const status = await calliopeBridge.getStatus();
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(status));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ online: false, error: err.message }));
    }
  }

  if (pathname === "/api/calliope/export" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", async () => {
      try {
        const { episodeId } = JSON.parse(body || "{}");
        const targetId = episodeId || "EP001";
        const result = await calliopeBridge.exportEpisodeToCalliope(targetId);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Character & Entity Continuity (Project Scoped)
  if (pathname === "/api/characters" && req.method === "GET") {
    const characters = characterContinuity.getCharactersForProject(paths.projectDir);
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ characters }));
  }

  if (pathname === "/api/characters" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      try {
        const charData = JSON.parse(body || "{}");
        const saved = characterContinuity.upsertCharacterForProject(paths.projectDir, charData);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, character: saved }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Calliope-Grade Character Turnaround & Portrait Prompts
  if (pathname === "/api/character/generate-prompts" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      try {
        const { characterId } = JSON.parse(body || "{}");
        const sheetPrompt = characterContinuity.generateCharacterSheetPrompt(paths.projectDir, characterId);
        const portraitPrompt = characterContinuity.generatePortraitPrompt(paths.projectDir, characterId);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ sheetPrompt, portraitPrompt }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Director Mode Shot Inspector Update
  if (pathname === "/api/shot/update" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      try {
        const { episodeId, shotId, characterId, visualType, customPrompt, customFile } = JSON.parse(body || "{}");
        const epDir = path.join(paths.episodesDir, episodeId || "EP001");
        const manifestPath = path.join(epDir, "footage_manifest.json");
        if (!fs.existsSync(manifestPath)) {
          res.writeHead(404, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Manifest not found" }));
        }

        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        const shotIdx = (manifest.shots || []).findIndex(s => s.shotId === shotId);
        if (shotIdx === -1) {
          res.writeHead(404, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: `Shot ${shotId} not found` }));
        }

        const shot = manifest.shots[shotIdx];
        if (characterId !== undefined) shot.characterId = characterId;
        if (visualType !== undefined) shot.visualType = visualType;
        if (customPrompt !== undefined) shot.customPrompt = customPrompt;
        if (customFile !== undefined) shot.customFile = customFile;
        shot.updatedAt = new Date().toISOString();

        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, updatedShot: shot }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Phase 1 Consistency - Upload Style Reference Image
  if (pathname === "/api/consistency/upload-style" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      try {
        const { imageBase64, filename } = JSON.parse(body || "{}");
        if (!imageBase64) throw new Error("No image data received");
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        const styleDir = path.join(paths.assetsDir, "style");
        if (!fs.existsSync(styleDir)) fs.mkdirSync(styleDir, { recursive: true });

        const ext = path.extname(filename || ".jpg") || ".jpg";
        const targetPath = path.join(styleDir, `custom_style_master${ext}`);
        fs.writeFileSync(targetPath, Buffer.from(base64Data, "base64"));

        const url = `/channel_assets/style/custom_style_master${ext}`;
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, url }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Phase 1 Consistency - Upload Character Reference Image
  if (pathname === "/api/consistency/upload-character" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      try {
        const { characterId, imageBase64, filename } = JSON.parse(body || "{}");
        if (!characterId || !imageBase64) throw new Error("characterId and imageBase64 required");
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        
        const safeCharId = characterId.replace(/[^a-zA-Z0-9_-]/g, "_");
        const charDir = path.join(paths.assetsDir, "characters", safeCharId);
        if (!fs.existsSync(charDir)) fs.mkdirSync(charDir, { recursive: true });

        const rawExt = path.extname(filename || ".jpg").toLowerCase();
        const ext = [".jpg", ".jpeg", ".png", ".webp"].includes(rawExt) ? rawExt : ".jpg";
        const targetPath = path.join(charDir, `custom_face_dna${ext}`);
        fs.writeFileSync(targetPath, Buffer.from(base64Data, "base64"));

        const url = `/channel_assets/characters/${safeCharId}/custom_face_dna${ext}`;
        characterContinuity.upsertCharacterForProject(paths.projectDir, {
          id: characterId,
          portrait_url: url,
          face_locked: true
        });

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, url }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API: Phase 1 Consistency - Lock & Apply Anchors to Episode Shots
  if (pathname === "/api/consistency/apply-anchors" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      try {
        const { episodeId, stylePrompt } = JSON.parse(body || "{}");
        const epDir = path.join(paths.episodesDir, episodeId || "EP001");
        const manifestPath = path.join(epDir, "footage_manifest.json");
        if (!fs.existsSync(manifestPath)) {
          res.writeHead(404, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Manifest not found" }));
        }

        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        let updatedCount = 0;

        for (const shot of manifest.shots || []) {
          if (shot.characterId) {
            shot.customPrompt = characterContinuity.injectFaceConsistency(paths.projectDir, shot.query || shot.shotId, shot.characterId);
          }
          if (stylePrompt) {
            shot.styleAnchor = stylePrompt;
          }
          shot.dnaLocked = true;
          updatedCount++;
        }

        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, count: updatedCount, message: `Locked DNA anchors applied to all ${updatedCount} shots.` }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ==========================================
  // STAGE 1: YouTube Channel URL Ingestion & Niche Analysis
  // ==========================================
  if (pathname === "/api/channel/analyze" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", async () => {
      try {
        const { url } = JSON.parse(body || "{}");
        if (!url) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Missing required YouTube URL" }));
        }
        const blueprint = await youtubeChannelAnalyzer.analyzeChannelNiche(url);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, blueprint }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ==========================================
  // STAGE 2: AI Script Generation & Human Review Gate
  // ==========================================
  if (pathname === "/api/script/generate" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", async () => {
      try {
        const { blueprint, topic, targetDurationMin } = JSON.parse(body || "{}");
        const scriptData = await scriptGenerator.generateScript({ blueprint, topic, targetDurationMin });
        const markdown = scriptGenerator.formatToScriptMasterMd(scriptData);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, scriptData, markdown }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === "/api/script/save" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      try {
        const { episodeId, scriptText, scriptData } = JSON.parse(body || "{}");
        const epDir = path.join(paths.episodesDir, episodeId || "EP001");
        if (!fs.existsSync(epDir)) {
          fs.mkdirSync(epDir, { recursive: true });
        }
        if (scriptText) {
          fs.writeFileSync(path.join(epDir, "script_master.md"), scriptText, "utf8");
        } else if (scriptData) {
          try {
            const md = scriptGenerator.formatToScriptMasterMd(scriptData);
            fs.writeFileSync(path.join(epDir, "script_master.md"), md, "utf8");
          } catch {}
        }

        if (scriptData) {
          fs.writeFileSync(path.join(epDir, "script_data.json"), JSON.stringify(scriptData, null, 2), "utf8");

          // Automatically synchronize footage_manifest.json with the generated scene script
          if (scriptData.scenes && scriptData.scenes.length > 0) {
            const manifestPath = path.join(epDir, "footage_manifest.json");
            let existingShots = [];
            if (fs.existsSync(manifestPath)) {
              try {
                const ex = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
                existingShots = ex.shots || [];
              } catch {}
            }

            const synchronizedShots = scriptData.scenes.map((s, idx) => {
              const prevShot = existingShots[idx] || {};
              return {
                shotId: `shot_${String(idx + 1).padStart(3, "0")}`,
                partId: s.partIndex || (idx + 1),
                title: s.title || `Part ${idx + 1}`,
                text: s.text,
                visualPrompt: s.visualPrompt || s.text,
                motionType: s.cameraMotion || prevShot.motionType || "push_in",
                durationSec: s.estimatedDurationSec || prevShot.durationSec || 5.0,
                audio: `chunk_part_${String(idx + 1).padStart(2, "0")}.mp3`,
                visualType: prevShot.visualType || "ai_scene",
                characterId: prevShot.characterId || null,
                file: prevShot.file || `motion_shot_${String(idx + 1).padStart(3, "0")}.mp4`
              };
            });

            fs.writeFileSync(manifestPath, JSON.stringify({
              episodeId: episodeId || "EP001",
              updatedAt: new Date().toISOString(),
              shots: synchronizedShots
            }, null, 2), "utf8");
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, message: "Script locked and manifest synchronized." }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ==========================================
  // STAGE 3: Voice Design Studio & Timestamp Alignment Gate
  // ==========================================
  if ((pathname === "/api/voice/profiles" || pathname === "/api/voice/personas") && req.method === "GET") {
    const profiles = voiceDesigner.getProfiles();
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ profiles, personas: profiles }));
  }

  if (pathname === "/api/voice/design-preview" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", async () => {
      try {
        const { voiceId, text, stability, similarityBoost } = JSON.parse(body || "{}");
        const preview = await voiceDesigner.generateVoicePreview({ voiceId, text, stability, similarityBoost });
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(preview));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === "/api/voice/generate-master" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      try {
        const { episodeId, scenes, pacingWpm, fontName, primaryColor, highlightColor } = JSON.parse(body || "{}");
        const epDir = path.join(paths.episodesDir, episodeId || "EP001");
        if (!fs.existsSync(epDir)) fs.mkdirSync(epDir, { recursive: true });

        const timing = voiceDesigner.generateWordTimestamps(scenes || [], pacingWpm || 165);
        const assKaraoke = voiceDesigner.generateAssKaraoke(timing.chunks, { fontName, primaryColor, highlightColor });

        fs.writeFileSync(path.join(epDir, "subtitles_karaoke.json"), JSON.stringify(timing, null, 2), "utf8");
        fs.writeFileSync(path.join(epDir, "subtitles_karaoke.ass"), assKaraoke, "utf8");

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, timing, assKaraokeLength: assKaraoke.length }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ==========================================
  // STAGE 4: Image-to-Video Motion Animation Engine Gate
  // ==========================================
  if (pathname === "/api/motion/profiles" && req.method === "GET") {
    const profiles = motionEngine.getProfiles();
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ profiles }));
  }

  if (pathname === "/api/scenes/animate" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", async () => {
      try {
        const { episodeId, shotIndex, imageRelativePath, motionType, durationSec } = JSON.parse(body || "{}");
        const epDir = path.join(paths.episodesDir, episodeId || "EP001");
        const resolvedImg = path.isAbsolute(imageRelativePath) ? imageRelativePath : path.join(epDir, imageRelativePath);

        const outClipName = `motion_shot_${String(shotIndex || 1).padStart(3, "0")}.mp4`;
        const outClipPath = path.join(epDir, outClipName);

        const result = await motionEngine.animateImage({
          imagePath: resolvedImg,
          outputPath: outClipPath,
          durationSec: durationSec || 4.0,
          motionType: motionType || "push_in"
        });

        // Update footage_manifest.json
        const manifestPath = path.join(epDir, "footage_manifest.json");
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
          if (manifest.shots && manifest.shots[shotIndex - 1]) {
            manifest.shots[shotIndex - 1].file = outClipName;
            manifest.shots[shotIndex - 1].animated = true;
            manifest.shots[shotIndex - 1].motionType = motionType;
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: true,
          clipUrl: `/media/${episodeId || "EP001"}/${outClipName}`,
          result
        }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Static Assets
  let filePath = path.join(STUDIO_PUBLIC, pathname === "/" ? "index.html" : pathname);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(STUDIO_PUBLIC, "index.html");
  }

  return streamFile(req, res, filePath);
});

server.listen(PORT, () => {
  console.log("\n=======================================================");
  console.log("🚀  YGMOTION STUDIO V3 RUNNING (Multi-Channel Platform)");
  console.log(`    URL: http://localhost:${PORT}`);
  console.log("=======================================================\n");
});

process.on("uncaughtException", (err) => {
  console.error("Global uncaughtException caught:", err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error("Global unhandledRejection caught:", reason);
});

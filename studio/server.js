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

  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });

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
      "Access-Control-Allow-Origin": "*"
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

function getEpisodeSummary(epId) {
  const { episodesDir, active } = getActivePaths();
  const epDir = path.join(episodesDir, epId);
  if (!fs.existsSync(epDir) || !fs.statSync(epDir).isDirectory()) return null;

  const scriptPath = path.join(epDir, "script_master.md");
  const footageManifestPath = path.join(epDir, "footage_manifest.json");
  const voiceChunksPath = path.join(epDir, "voice_chunks.json");
  const mixedAudioPath = path.join(epDir, "audio", `${epId.toLowerCase()}_mixed_master.mp3`);
  const finalVideoCandidates = [
    path.join(epDir, `${epId}_FINAL_VIDEO_1080P.mp4`),
    path.join(epDir, `${epId}_FULL_EPISODE_10MIN_MASTER_READY_TO_WATCH.mp4`)
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

  return {
    id: epId,
    title: epId === "EP001" && active.id === "crime_chronicles" ? "The Cop Was About to Search My Car" : `${active.name}: ${epId}`,
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

  // API: Episode Detail
  if (pathname.startsWith("/api/episode/") && req.method === "GET") {
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
        shots = (manifest.shots || []).map(s => ({
          ...s,
          mediaUrl: `/media/${epId}/${s.file || 'placeholder.mp4'}`
        }));
      } catch {}
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

  // API: Trigger Video Render (supports styleId)
  if (pathname === "/api/render" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      try {
        const { episodeId, styleId } = JSON.parse(body || "{}");
        const targetId = episodeId || "EP001";
        const targetStyle = styleId || paths.active.category || "crime_suspense";
        
        const renderProc = spawn("node", ["engine/scripts/render_video.js", targetId, targetStyle], {
          cwd: ROOT_DIR,
          detached: true,
          stdio: "ignore"
        });
        renderProc.unref();

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, message: `Render started for ${targetId} with style ${targetStyle}` }));
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
        }
        if (scriptData) {
          fs.writeFileSync(path.join(epDir, "script_data.json"), JSON.stringify(scriptData, null, 2), "utf8");
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: true, message: "Script locked and saved." }));
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

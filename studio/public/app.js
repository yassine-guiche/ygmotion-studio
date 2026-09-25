/**
 * GoMotion & VidRush Studio V2 Controller
 * Multi-Style Archetypes, Brand Profiles, and Colab Integration
 */

"use strict";

let currentEpisode = "EP001";
let currentEpisodeId = "EP001";
let currentStyle = "crime_suspense";
let episodeData = null;
let allStyles = {};
let brandProfile = {};
let totalDurationSec = 610.7;

// DOM Elements
const masterVideo = document.getElementById("masterVideo");
const videoSource = document.getElementById("videoSource");
const playTrigger = document.getElementById("playTrigger");
const videoOverlay = document.getElementById("videoOverlay");
const playPauseBtn = document.getElementById("playPauseBtn");
const playIcon = document.getElementById("playIcon");
const pauseIcon = document.getElementById("pauseIcon");
const currentTimeEl = document.getElementById("currentTime");
const totalDurationEl = document.getElementById("totalDuration");
const timelineWrapper = document.getElementById("timelineWrapper");
const timelineProgress = document.getElementById("timelineProgress");
const shotMarkers = document.getElementById("shotMarkers");
const shotsGrid = document.getElementById("shotsGrid");
const scriptContent = document.getElementById("scriptContent");
const stylesGallery = document.getElementById("stylesGallery");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const openFolderBtn = document.getElementById("openFolderBtn");
const triggerRenderBtn = document.getElementById("triggerRenderBtn");
const renderBanner = document.getElementById("renderBanner");
const downloadVideoBtn = document.getElementById("downloadVideoBtn");
const videoSizeLabel = document.getElementById("videoSizeLabel");
const styleSelect = document.getElementById("styleSelect");
const activeStyleBadge = document.getElementById("activeStyleBadge");
const radarGradeText = document.getElementById("radarGradeText");

// Tab Switcher
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    const tabId = btn.getAttribute("data-tab");
    const targetContent = document.getElementById(tabId);
    if (targetContent) targetContent.classList.add("active");
  });
});

function formatTime(sec) {
  if (isNaN(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Load Styles
async function loadStyles() {
  try {
    const res = await fetch("/api/styles");
    allStyles = await res.json();
    renderStylesGallery();
  } catch (err) {
    console.error("Error loading styles:", err);
  }
}

function renderStylesGallery() {
  if (!stylesGallery) return;
  stylesGallery.innerHTML = "";

  for (const [id, style] of Object.entries(allStyles)) {
    const card = document.createElement("div");
    card.className = `style-card ${id === currentStyle ? "selected" : ""}`;
    card.id = `style-card-${id}`;
    card.innerHTML = `
      <div class="style-card-header">
        <span class="style-name">${style.name}</span>
        <span class="style-tone-tag">${style.colorGrade.tone}</span>
      </div>
      <p class="style-desc">${style.description}</p>
      <div class="style-meta-row">
        <span>Cut Pacing: ~${style.pacing.avgShotDurationSec}s</span>
        <span>•</span>
        <span>Highlight: ${style.subtitles.highlightColor}</span>
      </div>
    `;

    card.addEventListener("click", () => {
      selectStyle(id);
    });

    stylesGallery.appendChild(card);
  }
}

function selectStyle(styleId) {
  currentStyle = styleId;
  if (styleSelect) styleSelect.value = styleId;
  const s = allStyles[styleId];
  if (s) {
    if (activeStyleBadge) activeStyleBadge.textContent = s.name.toUpperCase();
    if (radarGradeText) radarGradeText.textContent = s.colorGrade.tone;
  }
  document.querySelectorAll(".style-card").forEach(c => c.classList.remove("selected"));
  const activeCard = document.getElementById(`style-card-${styleId}`);
  if (activeCard) activeCard.classList.add("selected");
}

if (styleSelect) {
  styleSelect.addEventListener("change", e => {
    selectStyle(e.target.value);
  });
}

// Load Brand Profile
async function loadBrandProfile() {
  try {
    const res = await fetch("/api/brand-profile");
    brandProfile = await res.json();
    if (brandProfile.channelName) {
      const el = document.getElementById("navChannelName");
      if (el) el.innerHTML = `${brandProfile.channelName.toUpperCase()}<span class="gradient-text">.STUDIO</span>`;
    }
    if (brandProfile.activeStyle && allStyles[brandProfile.activeStyle]) {
      selectStyle(brandProfile.activeStyle);
    }
  } catch (err) {
    console.error("Error loading brand profile:", err);
  }
}

// Load All Episodes
async function loadEpisodes() {
  try {
    const res = await fetch("/api/episodes");
    const data = await res.json();
    const eps = data.episodes || [];
    const sel = document.getElementById("episodeSelect");
    if (sel && eps.length > 0) {
      sel.innerHTML = "";
      eps.forEach(ep => {
        const opt = document.createElement("option");
        opt.value = ep.id;
        opt.textContent = `${ep.id} — ${ep.title}`;
        if (ep.id === currentEpisode) opt.selected = true;
        sel.appendChild(opt);
      });
    }
  } catch (err) {
    console.error("Error loading episodes:", err);
  }
}

// Load Episode Data
async function loadEpisode(epId = "EP001") {
  try {
    const res = await fetch(`/api/episode/${epId}`);
    if (!res.ok) throw new Error("Failed to fetch episode data");
    episodeData = await res.json();
    currentEpisode = epId;

    document.getElementById("currentEpTag").textContent = epId;
    document.getElementById("currentEpTitle").textContent = episodeData.title || epId;

    if (episodeData.finalVideo) {
      videoSource.src = episodeData.finalVideo.path;
      masterVideo.load();
      downloadVideoBtn.href = episodeData.finalVideo.path;
      videoSizeLabel.textContent = `1080p MP4 (${episodeData.finalVideo.sizeMb} MB)`;
      document.getElementById("renderStatusText").textContent = `1080p MP4 ready (${episodeData.finalVideo.sizeMb} MB)`;
      renderBanner.style.display = "none";
    } else {
      renderBanner.style.display = "flex";
      document.getElementById("renderStatusText").textContent = "Rendering in background...";
    }

    if (scriptContent) {
      scriptContent.textContent = episodeData.scriptText || "No script loaded.";
    }

    renderShots(episodeData.shots || []);
    renderAudioStems();

  } catch (err) {
    console.error("Error loading episode:", err);
  }
}

function renderAudioStems() {
  const stemsList = document.getElementById("stemsList");
  if (!stemsList) return;
  stemsList.innerHTML = "";

  const isDual = currentProject?.speakerMode === "host_and_guest";
  const voiceId = currentProject?.voiceProfile?.voiceId || "NARRATOR_V1";
  const pacing = currentProject?.voiceProfile?.pacingWpm || 145;
  const tone = currentProject?.voiceProfile?.tone || "Narrative Immersion";
  const hostVoiceId = currentProject?.hostVoice?.voiceId || "HOST_MASTER_V1";
  const bgm = currentProject?.audioProfile?.bgmStyle || "Atmospheric Ambient / Suspense";
  const sfxDucking = currentProject?.audioProfile?.sfxDuckingDb ? `${currentProject.audioProfile.sfxDuckingDb}dB` : "-18dB Auto-Ducked";
  const masterLUFS = currentProject?.audioProfile?.masterLoudnessLufs ? `${currentProject.audioProfile.masterLoudnessLufs} LUFS` : "-14 LUFS";

  const vocalStems = isDual ? [
    {
      name: `🎙️ Host Anchor Vocal Track (${hostVoiceId})`,
      desc: `Cold open introduction • Crime pilot dual-speaker format`,
      badge: "HOST TRACK",
      badgeClass: "badge-success"
    },
    {
      name: `🎙️ Guest Storyteller Vocal Track (${voiceId})`,
      desc: `Pacing: ${pacing} WPM • First-person confession • ElevenLabs V2`,
      badge: "GUEST TRACK",
      badgeClass: "badge-success"
    }
  ] : [
    {
      name: `🎙️ Master Solo Voiceover (${voiceId})`,
      desc: `Universal YouTube Solo Narrator • Pacing: ${pacing} WPM • Tone: ${tone}`,
      badge: "SOLO NARRATOR",
      badgeClass: "badge-success"
    }
  ];

  const stems = [
    ...vocalStems,
    {
      name: `🎵 Background Music (BGM)`,
      desc: `Style: ${bgm} • Sidechain ducking under voiceover • Dynamic volume automation`,
      badge: "DUCKED -18dB",
      badgeClass: "badge-success"
    },
    {
      name: `💥 Sound Effects & Foley (SFX)`,
      desc: `Atmospheric stingers, impacts, transitions • Ducking: ${sfxDucking}`,
      badge: "SYNCHRONIZED",
      badgeClass: "badge-success"
    },
    {
      name: `🎚️ Master Timeline Bus`,
      desc: `Stereo 48kHz / 24-bit • Target Loudness: ${masterLUFS} (YouTube standard)`,
      badge: "LOCKED 48kHz",
      badgeClass: "badge-success"
    }
  ];

  stems.forEach(stem => {
    const card = document.createElement("div");
    card.className = "stem-card";
    card.innerHTML = `
      <div>
        <span class="stem-name">${stem.name}</span>
        <span class="stem-desc">${stem.desc}</span>
      </div>
      <span class="${stem.badgeClass || 'badge-success'}">${stem.badge}</span>
    `;
    stemsList.appendChild(card);
  });
}

function renderShots(shots) {
  if (!shotsGrid) return;
  shotsGrid.innerHTML = "";
  if (shotMarkers) shotMarkers.innerHTML = "";

  if (shots.length === 0) {
    shotsGrid.innerHTML = '<div class="loading-state">No stock footage clips found.</div>';
    return;
  }

  const durPerShot = totalDurationSec / shots.length;

  shots.forEach((shot, index) => {
    const startTime = index * durPerShot;
    
    if (shotMarkers) {
      const tick = document.createElement("div");
      tick.className = "shot-tick";
      tick.style.left = `${(startTime / totalDurationSec) * 100}%`;
      tick.title = `${shot.shotId} (${formatTime(startTime)})`;
      shotMarkers.appendChild(tick);
    }

    const card = document.createElement("div");
    card.className = "shot-card";
    card.id = `shot-card-${shot.shotId}`;
    const charTag = shot.characterId ? `<span class="shot-char-tag">🎭 ${shot.characterId.replace('_', ' ').toUpperCase()}</span>` : '';
    card.innerHTML = `
      <div class="shot-thumb-wrapper">
        <video src="${shot.mediaUrl}#t=1" preload="metadata" muted playsinline></video>
        <span class="shot-badge">${shot.shotId}</span>
        <span class="shot-duration">${formatTime(startTime)}</span>
        <button class="edit-shot-btn" data-shotid="${shot.shotId}" title="Director Mode: Cast Character & Edit Prompt">Direct 🎬</button>
      </div>
      <div class="shot-query" title="${shot.customPrompt || shot.query || shot.shotId}">
        ${charTag} ${shot.customPrompt || shot.query || "Stock clip"}
      </div>
    `;

    const directBtn = card.querySelector(".edit-shot-btn");
    directBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openDirectorModal(shot);
    });

    card.addEventListener("click", () => {
      masterVideo.currentTime = startTime;
      masterVideo.play();
      highlightActiveShot(shot.shotId);
    });

    const cardVideo = card.querySelector("video");
    card.addEventListener("mouseenter", () => {
      if (cardVideo) cardVideo.play().catch(() => {});
    });
    card.addEventListener("mouseleave", () => {
      if (cardVideo) {
        cardVideo.pause();
        cardVideo.currentTime = 1;
      }
    });

    shotsGrid.appendChild(card);
  });
}

function highlightActiveShot(shotId) {
  document.querySelectorAll(".shot-card").forEach(c => c.classList.remove("active-shot"));
  const activeCard = document.getElementById(`shot-card-${shotId}`);
  if (activeCard) {
    activeCard.classList.add("active-shot");
  }
}

// Playback Controls
function togglePlay() {
  if (masterVideo.paused || masterVideo.ended) {
    masterVideo.play();
  } else {
    masterVideo.pause();
  }
}

if (playTrigger) playTrigger.addEventListener("click", togglePlay);
if (playPauseBtn) playPauseBtn.addEventListener("click", togglePlay);

if (masterVideo) {
  masterVideo.addEventListener("play", () => {
    videoOverlay.classList.add("hidden");
    playIcon.style.display = "none";
    pauseIcon.style.display = "block";
  });

  masterVideo.addEventListener("pause", () => {
    videoOverlay.classList.remove("hidden");
    playIcon.style.display = "block";
    pauseIcon.style.display = "none";
  });

  masterVideo.addEventListener("loadedmetadata", () => {
    if (masterVideo.duration && !isNaN(masterVideo.duration)) {
      totalDurationSec = masterVideo.duration;
      if (totalDurationEl) totalDurationEl.textContent = formatTime(totalDurationSec);
      if (episodeData && episodeData.shots) {
        renderShots(episodeData.shots);
      }
    }
  });

  masterVideo.addEventListener("timeupdate", () => {
    const cur = masterVideo.currentTime;
    if (currentTimeEl) currentTimeEl.textContent = formatTime(cur);
    const pct = (cur / (masterVideo.duration || totalDurationSec)) * 100;
    if (timelineProgress) timelineProgress.style.width = `${pct}%`;

    if (episodeData && episodeData.shots && episodeData.shots.length > 0) {
      const durPerShot = (masterVideo.duration || totalDurationSec) / episodeData.shots.length;
      const activeIndex = Math.min(Math.floor(cur / durPerShot), episodeData.shots.length - 1);
      const activeShot = episodeData.shots[activeIndex];
      if (activeShot) highlightActiveShot(activeShot.shotId);
    }

    // Live Synchronized Karaoke Subtitle HUD
    const curMs = cur * 1000;
    const hudText = document.getElementById("videoKaraokeText");
    const hudBox = document.getElementById("videoKaraokeHud");
    if (hudText && episodeData?.karaokeData?.chunks) {
      const chunk = episodeData.karaokeData.chunks.find(c => curMs >= c.startMs && curMs <= c.endMs);
      if (chunk && chunk.words && chunk.words.length > 0) {
        if (hudBox) hudBox.style.display = "flex";
        const formatted = chunk.words.map(w => {
          const isCurrent = curMs >= w.startMs && curMs <= w.endMs;
          if (isCurrent) {
            return `<span style="color: #facc15; font-size: 1.15em; font-weight: 900; text-shadow: 0 0 12px rgba(250, 204, 21, 0.95);">${w.word}</span>`;
          }
          const passed = curMs > w.endMs;
          return `<span style="opacity: ${passed ? 0.65 : 0.95};">${w.word}</span>`;
        }).join(" ");
        hudText.innerHTML = formatted;
      }
    }
  });
}

if (timelineWrapper) {
  timelineWrapper.addEventListener("click", e => {
    const rect = timelineWrapper.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = ratio * (masterVideo.duration || totalDurationSec);
    masterVideo.currentTime = newTime;
  });
}

const subtitlesToggle = document.getElementById("subtitlesToggle");
if (subtitlesToggle) {
  let subtitlesActive = true;
  subtitlesToggle.addEventListener("click", () => {
    subtitlesActive = !subtitlesActive;
    subtitlesToggle.classList.toggle("active", subtitlesActive);
  });
}

if (fullscreenBtn) {
  fullscreenBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.getElementById("videoWrapper").requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });
}

if (openFolderBtn) {
  openFolderBtn.addEventListener("click", async () => {
    try {
      const res = await fetch("/api/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: currentEpisode || "EP001" })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Folder opened in Windows Explorer:\n${data.opened}`);
      }
    } catch (err) {
      console.error("Open folder error:", err);
    }
  });
}

// Trigger Render with Selected Style
if (triggerRenderBtn) {
  triggerRenderBtn.addEventListener("click", async () => {
    const styleName = (allStyles[currentStyle] || {}).name || currentStyle;
    if (confirm(`Render ${currentEpisode || "EP001"} with style archetype: [${styleName}]?`)) {
      if (renderBanner) renderBanner.style.display = "flex";
      const renderBannerText = document.getElementById("renderBannerText");
      if (renderBannerText) renderBannerText.textContent = `Rendering with ${styleName}... Check terminal for real-time progress!`;
      try {
        await fetch("/api/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            episodeId: currentEpisode || "EP001",
            styleId: currentStyle
          })
        });
        alert(`Render launched with [${styleName}]!`);
      } catch (err) {
        console.error("Render trigger error:", err);
      }
    }
  });
}

// Brand Profile Modal
const brandModal = document.getElementById("brandModal");
const brandProfileBtn = document.getElementById("brandProfileBtn");
const closeBrandModalBtn = document.getElementById("closeBrandModalBtn");
const cancelBrandBtn = document.getElementById("cancelBrandBtn");
const saveBrandBtn = document.getElementById("saveBrandBtn");

if (brandProfileBtn) brandProfileBtn.addEventListener("click", () => {
  if (document.getElementById("brandChannelName")) {
    document.getElementById("brandChannelName").value = currentProject?.name || brandProfile.channelName || "";
  }
  if (document.getElementById("brandTag")) {
    document.getElementById("brandTag").value = currentProject?.tag || brandProfile.tag || "";
  }
  if (document.getElementById("brandVisualPipeline")) {
    document.getElementById("brandVisualPipeline").value = currentProject?.visualPipeline || "realistic_cinematic";
  }
  if (document.getElementById("brandSpeakerMode")) {
    document.getElementById("brandSpeakerMode").value = currentProject?.speakerMode || "solo_narrator";
  }
  if (document.getElementById("brandNarratorMode")) {
    document.getElementById("brandNarratorMode").value = currentProject?.narratorMode || "voiceover_only";
  }
  if (document.getElementById("brandVoiceId")) {
    document.getElementById("brandVoiceId").value = currentProject?.voiceProfile?.voiceId || "";
  }
  if (document.getElementById("brandVoicePacing")) {
    document.getElementById("brandVoicePacing").value = currentProject?.voiceProfile?.pacing || "moderate";
  }
  if (document.getElementById("brandStylePrompt")) {
    document.getElementById("brandStylePrompt").value = currentProject?.defaultStylePrompt || "";
  }
  if (document.getElementById("brandScriptStructure")) {
    document.getElementById("brandScriptStructure").value = currentProject?.scriptFormula || "";
  }
  brandModal.style.display = "flex";
});

if (closeBrandModalBtn) closeBrandModalBtn.addEventListener("click", () => { if (brandModal) brandModal.style.display = "none"; });
if (cancelBrandBtn) cancelBrandBtn.addEventListener("click", () => { if (brandModal) brandModal.style.display = "none"; });

if (saveBrandBtn) {
  saveBrandBtn.addEventListener("click", async () => {
    const updated = {
      ...brandProfile,
      channelName: document.getElementById("brandChannelName")?.value.trim() || "",
      tag: document.getElementById("brandTag")?.value.trim() || "",
      visualPipeline: document.getElementById("brandVisualPipeline")?.value || "realistic_cinematic",
      speakerMode: document.getElementById("brandSpeakerMode")?.value || "solo_narrator",
      narratorMode: document.getElementById("brandNarratorMode")?.value || "voiceover_only",
      voiceId: document.getElementById("brandVoiceId")?.value.trim() || "",
      pacing: document.getElementById("brandVoicePacing")?.value || "moderate",
      stylePrompt: document.getElementById("brandStylePrompt")?.value.trim() || "",
      scriptStructure: document.getElementById("brandScriptStructure")?.value.trim() || ""
    };

    try {
      const res = await fetch("/api/brand-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      if (data.success) {
        brandProfile = data.profile;
        const navName = document.getElementById("navChannelName");
        if (navName) navName.innerHTML = `${(brandProfile.channelName || 'YGMOTION').toUpperCase()}<span class="gradient-text">.STUDIO</span>`;
        alert("Brand Profile saved!");
        if (brandModal) brandModal.style.display = "none";
        await loadProjects();
      }
    } catch (e) {
      console.error("Save brand error:", e);
    }
  });
}

// New Episode Modal
const newEpisodeModal = document.getElementById("newEpisodeModal");
const newEpisodeBtn = document.getElementById("newEpisodeBtn");
const closeModalBtn = document.getElementById("closeModalBtn");
const cancelModalBtn = document.getElementById("cancelModalBtn");
const startPipelineBtn = document.getElementById("startPipelineBtn");

if (newEpisodeBtn) {
  newEpisodeBtn.addEventListener("click", () => {
    if (newEpisodeModal) newEpisodeModal.style.display = "flex";
  });
}

if (closeModalBtn) closeModalBtn.addEventListener("click", () => { if (newEpisodeModal) newEpisodeModal.style.display = "none"; });
if (cancelModalBtn) cancelModalBtn.addEventListener("click", () => { if (newEpisodeModal) newEpisodeModal.style.display = "none"; });

if (startPipelineBtn) {
  startPipelineBtn.addEventListener("click", () => {
    const epId = document.getElementById("modalEpId")?.value.trim() || "EP002";
    const style = document.getElementById("modalStyle")?.value || "ranks_pov";
    alert(`Episode ${epId} configured with style [${style}]! Run:\nnode engine/scripts/pipeline.js full ${epId}\n\nTo generate voice, fetch stock clips, and render 1080p video.`);
    if (newEpisodeModal) newEpisodeModal.style.display = "none";
  });
}

// Polling for video completion (only active in editor view)
setInterval(async () => {
  if (currentEpisode && masterVideo) {
    try {
      const res = await fetch(`/api/episode/${currentEpisode}`);
      const data = await res.json();
      if (data.finalVideo && (!episodeData || !episodeData.finalVideo || episodeData.finalVideo.path !== data.finalVideo.path)) {
        episodeData = data;
        if (videoSource) videoSource.src = data.finalVideo.path;
        if (masterVideo) masterVideo.load();
        if (downloadVideoBtn) downloadVideoBtn.href = data.finalVideo.path;
        if (videoSizeLabel) videoSizeLabel.textContent = `1080p MP4 (${data.finalVideo.sizeMb} MB)`;
        const rst = document.getElementById("renderStatusText");
        if (rst) rst.textContent = `1080p MP4 ready (${data.finalVideo.sizeMb} MB)`;
        if (renderBanner) renderBanner.style.display = "none";
      }
    } catch {}
  }
}, 5000);

// Calliope Studio Bridge Integration
const calliopeDot = document.getElementById("calliopeDot");
const calliopeStatusBadge = document.getElementById("calliopeStatusBadge");
const calliopeEndpoint = document.getElementById("calliopeEndpoint");
const calliopeLlm = document.getElementById("calliopeLlm");
const pushCalliopeBtn = document.getElementById("pushCalliopeBtn");
const openCalliopeLabBtn = document.getElementById("openCalliopeLabBtn");
const syncCalliopeBtnTop = document.getElementById("syncCalliopeBtnTop");
const charactersGrid = document.getElementById("charactersGrid");

async function loadCalliopeStatus() {
  try {
    const res = await fetch("/api/calliope/status");
    const status = await res.json();
    if (status.online) {
      calliopeDot.classList.remove("offline");
      calliopeStatusBadge.textContent = "CONNECTED";
      calliopeStatusBadge.className = "badge badge-success";
      if (status.settings) {
        calliopeLlm.textContent = status.settings.llmModel || "Qwen3.8-27B";
      }
    } else {
      calliopeDot.classList.add("offline");
      calliopeStatusBadge.textContent = "OFFLINE";
      calliopeStatusBadge.className = "badge badge-danger";
    }
  } catch (err) {
    if (calliopeDot) calliopeDot.classList.add("offline");
    if (calliopeStatusBadge) {
      calliopeStatusBadge.textContent = "OFFLINE";
      calliopeStatusBadge.className = "badge badge-danger";
    }
  }
}

async function pushToCalliope() {
  if (!pushCalliopeBtn) return;
  const originalText = pushCalliopeBtn.innerHTML;
  try {
    pushCalliopeBtn.disabled = true;
    pushCalliopeBtn.innerHTML = `<span>Syncing to Canvas...</span>`;

    const res = await fetch("/api/calliope/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeId: currentEpisode })
    });

    const data = await res.json();
    if (data.success) {
      alert(`🎉 Episode synced to Calliope Lab successfully!\n\n• Project ID: ${data.projectId}\n• Characters Synced: ${data.charactersCount}\n• Scenes Synced: ${data.scenesCount}\n\nYou can now open the Calliope Canvas at:\n${data.calliopeUrl}`);
      if (openCalliopeLabBtn) {
        openCalliopeLabBtn.href = data.calliopeUrl;
      }
    } else {
      alert(`Sync Notice: ${data.error || "Could not complete sync"}`);
    }
  } catch (err) {
    alert(`Sync Error: ${err.message}`);
  } finally {
    pushCalliopeBtn.disabled = false;
    pushCalliopeBtn.innerHTML = originalText;
  }
}

if (pushCalliopeBtn) pushCalliopeBtn.addEventListener("click", pushToCalliope);
if (syncCalliopeBtnTop) syncCalliopeBtnTop.addEventListener("click", pushToCalliope);

let allCharactersMap = {};

// Character Continuity Loader
async function loadCharacters() {
  if (!charactersGrid) return;
  try {
    const res = await fetch("/api/characters");
    const data = await res.json();
    const characters = data.characters || [];
    allCharactersMap = {};

    charactersGrid.innerHTML = "";
    characters.forEach(c => {
      allCharactersMap[c.id] = c;
      const card = document.createElement("div");
      card.className = "character-card";
      card.innerHTML = `
        <div class="character-card-header">
          <div class="char-title-block">
            <span class="char-name">${c.name}</span>
            <span class="char-role">${c.role}</span>
          </div>
          <span class="badge badge-accent">Seed: ${c.seed}</span>
        </div>
        ${c.portrait_url ? `
        <div class="char-card-media-preview">
          <img src="${c.portrait_url}" alt="${c.name} Face Lock Reference" class="char-portrait-thumb">
        </div>` : ''}
        <div class="char-traits-box">
          <strong>Physical DNA:</strong> ${c.appearance || c.visual_traits}
        </div>
        <div class="char-meta-row">
          <span>Age: ${c.age || 'N/A'}</span>
          <span>Face Lock: ${c.face_locked ? '🔒 LOCKED' : 'Auto'}</span>
        </div>
        <div class="char-actions">
          <button class="btn btn-secondary btn-sm" onclick="copyCharacterPrompt('${c.id}', 'cref')">
            <span>Copy --cref</span>
          </button>
          <button class="btn btn-secondary btn-sm" onclick="copyCharacterPrompt('${c.id}', 'sheet')">
            <span>Copy Turnaround</span>
          </button>
          <button class="btn btn-secondary btn-sm" onclick="copyCharacterPrompt('${c.id}', 'portrait')">
            <span>Copy Face Lock</span>
          </button>
        </div>
      `;
      charactersGrid.appendChild(card);
    });
  } catch (err) {
    console.error("Error loading characters:", err);
  }
}

async function copyCharacterPrompt(charId, type) {
  try {
    const res = await fetch("/api/character/generate-prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId: charId })
    });
    const data = await res.json();
    const char = allCharactersMap[charId];

    if (type === 'cref' && char) {
      await navigator.clipboard.writeText(char.midjourney_cref);
      alert(`Midjourney --cref prompt copied for ${char.name}!`);
    } else if (type === 'sheet') {
      await navigator.clipboard.writeText(data.sheetPrompt);
      alert(`Calliope Character Turnaround Sheet prompt copied for ${char.name}!`);
    } else if (type === 'portrait') {
      await navigator.clipboard.writeText(data.portraitPrompt);
      alert(`Calliope Character Face Lock Portrait prompt copied for ${char.name}!`);
    }
  } catch (e) {
    alert("Error copying prompt: " + e.message);
  }
}

// Director Shot Studio Modal (Human-In-The-Loop)
let activeDirectShot = null;
const directorModal = document.getElementById("directorModal");
const closeDirectorModalBtn = document.getElementById("closeDirectorModalBtn");
const cancelDirectorBtn = document.getElementById("cancelDirectorBtn");
const saveDirectorShotBtn = document.getElementById("saveDirectorShotBtn");
const directorVideo = document.getElementById("directorVideo");
const directorShotTitle = document.getElementById("directorShotTitle");
const directorShotTime = document.getElementById("directorShotTime");
const directorVisualType = document.getElementById("directorVisualType");
const directorCharacterSelect = document.getElementById("directorCharacterSelect");
const directorPrompt = document.getElementById("directorPrompt");
const directorAudioChunk = document.getElementById("directorAudioChunk");
const directorFaceCard = document.getElementById("directorFaceCard");
const directorFaceThumb = document.getElementById("directorFaceThumb");
const directorFaceName = document.getElementById("directorFaceName");
const directorFaceSeed = document.getElementById("directorFaceSeed");
const directorFaceTraits = document.getElementById("directorFaceTraits");
const copyCalliopeSheetBtn = document.getElementById("copyCalliopeSheetBtn");
const copyCalliopePortraitBtn = document.getElementById("copyCalliopePortraitBtn");

function populateDirectorCharacterSelect(selectedId) {
  if (!directorCharacterSelect) return;
  directorCharacterSelect.innerHTML = '<option value="">None (Environment / Atmosphere / B-roll)</option>';
  
  const charKeys = Object.keys(allCharactersMap || {});
  charKeys.forEach(key => {
    const char = allCharactersMap[key];
    const opt = document.createElement("option");
    opt.value = char.id;
    opt.textContent = `${char.name} (${char.role || 'Character'})`;
    if (selectedId && char.id === selectedId) opt.selected = true;
    directorCharacterSelect.appendChild(opt);
  });
}

function openDirectorModal(shot) {
  activeDirectShot = shot;
  if (!directorModal) return;

  directorShotTitle.textContent = `Direct Shot ${shot.shotId}`;
  directorShotTime.textContent = `${shot.tc} (Duration: ${shot.duration_sec}s)`;
  directorVideo.src = shot.mediaUrl;
  directorVisualType.value = shot.visualType || "stock_broll";
  
  populateDirectorCharacterSelect(shot.characterId || "");
  directorCharacterSelect.value = shot.characterId || "";
  directorPrompt.value = shot.customPrompt || shot.query || "";
  directorAudioChunk.textContent = `Audio cue: ${shot.audio || 'chunk_part_01.mp3'} • Timecode: ${shot.tc}`;

  updateFacePreview();
  directorModal.style.display = "flex";
}

function updateFacePreview() {
  const charId = directorCharacterSelect.value;
  const char = allCharactersMap[charId];
  if (char && directorFaceCard) {
    directorFaceCard.style.display = "flex";
    directorFaceThumb.src = char.portrait_url || "";
    directorFaceName.textContent = char.name;
    directorFaceSeed.textContent = `Seed: ${char.seed} • FACE LOCKED`;
    directorFaceTraits.textContent = char.appearance || char.visual_traits;
  } else if (directorFaceCard) {
    directorFaceCard.style.display = "none";
  }
}

if (directorCharacterSelect) {
  directorCharacterSelect.addEventListener("change", () => {
    updateFacePreview();
    const charId = directorCharacterSelect.value;
    const char = allCharactersMap[charId];
    if (char && !directorPrompt.value.includes("[FACE_LOCK:")) {
      directorPrompt.value = `${directorPrompt.value} | [FACE_LOCK: ${char.name} - ${char.appearance}] (Seed: ${char.seed})`;
    }
  });
}

if (closeDirectorModalBtn) closeDirectorModalBtn.addEventListener("click", () => { directorModal.style.display = "none"; });
if (cancelDirectorBtn) cancelDirectorBtn.addEventListener("click", () => { directorModal.style.display = "none"; });

if (copyCalliopeSheetBtn) {
  copyCalliopeSheetBtn.addEventListener("click", () => {
    const charId = directorCharacterSelect.value || Object.keys(allCharactersMap)[0];
    if (charId) {
      copyCharacterPrompt(charId, 'sheet');
    } else {
      alert("No character registered in this channel.");
    }
  });
}

if (copyCalliopePortraitBtn) {
  copyCalliopePortraitBtn.addEventListener("click", () => {
    const charId = directorCharacterSelect.value || Object.keys(allCharactersMap)[0];
    if (charId) {
      copyCharacterPrompt(charId, 'portrait');
    } else {
      alert("No character registered in this channel.");
    }
  });
}

if (saveDirectorShotBtn) {
  saveDirectorShotBtn.addEventListener("click", async () => {
    if (!activeDirectShot) return;
    try {
      saveDirectorShotBtn.disabled = true;
      saveDirectorShotBtn.textContent = "Saving...";

      const res = await fetch("/api/shot/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodeId: currentEpisode,
          shotId: activeDirectShot.shotId,
          characterId: directorCharacterSelect.value,
          visualType: directorVisualType.value,
          customPrompt: directorPrompt.value
        })
      });

      const data = await res.json();
      if (data.success) {
        activeDirectShot.characterId = directorCharacterSelect.value;
        activeDirectShot.visualType = directorVisualType.value;
        activeDirectShot.customPrompt = directorPrompt.value;
        alert(`✅ Shot ${activeDirectShot.shotId} Directives Saved!\n\nCharacter: ${directorCharacterSelect.value || 'None (B-roll)'}\nType: ${directorVisualType.value}\nYour custom directives will be honored on render.`);
        directorModal.style.display = "none";
        // Reload episode shots to update cards
        await loadEpisode(currentEpisode);
      } else {
        alert("Error saving shot: " + (data.error || "Unknown"));
      }
    } catch (err) {
      alert("Error saving: " + err.message);
    } finally {
      saveDirectorShotBtn.disabled = false;
      saveDirectorShotBtn.textContent = "Save Shot Directives";
    }
  });
}

// Phase 1: Consistency Setup Modal Controller (VidRush / GoMotion Engine)
const phase1ConsistencyBtn = document.getElementById("phase1ConsistencyBtn");
const consistencyModal = document.getElementById("consistencyModal");
const closeConsistencyModalBtn = document.getElementById("closeConsistencyModalBtn");
const cancelConsistencyBtn = document.getElementById("cancelConsistencyBtn");
const applyConsistencyBtn = document.getElementById("applyConsistencyBtn");
const activeStyleImg = document.getElementById("activeStyleImg");
const styleFileInput = document.getElementById("styleFileInput");
const styleFormulaText = document.getElementById("styleFormulaText");
const characterAnchorsGrid = document.getElementById("characterAnchorsGrid");

function renderCharacterAnchors() {
  if (!characterAnchorsGrid) return;
  characterAnchorsGrid.innerHTML = "";

  const chars = Object.values(allCharactersMap);
  if (chars.length === 0) {
    characterAnchorsGrid.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--text-muted); background: rgba(0,0,0,0.3); border-radius: 8px;">
        <span style="font-size: 2rem;">👥</span>
        <p style="margin-top: 8px; font-size: 0.85rem;">No characters defined in this project blueprint yet. Add characters in character continuity or upload a face below.</p>
      </div>
    `;
    return;
  }

  chars.forEach(char => {
    const card = document.createElement("div");
    card.className = "char-anchor-card";
    const portraitHtml = char.portrait_url
      ? `<img id="anchor-thumb-${char.id}" src="${char.portrait_url}" alt="${char.name} Face Anchor">`
      : `<div id="anchor-thumb-${char.id}" style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(15,23,42,0.8); font-size: 2rem; color: var(--text-muted);">
          <span>👤</span>
          <span style="font-size: 0.65rem; margin-top: 4px; color: var(--accent-cyan); font-weight: 600;">NO FACE DATA</span>
        </div>`;

    card.innerHTML = `
      <div class="char-anchor-thumb">
        ${portraitHtml}
      </div>
      <div class="char-anchor-info">
        <span class="char-anchor-name">${char.name}</span>
        <span class="char-anchor-role">${char.role || 'Key Character'}</span>
        <span class="char-anchor-status">${char.seed ? `Seed: ${char.seed} • ` : ''}${char.face_locked ? '🔒 LOCKED' : '⚡ DRAFT'}</span>
      </div>
      <label class="btn btn-secondary btn-sm upload-label" style="text-align: center; margin-top: auto;">
        <span>Upload Face Photo</span>
        <input type="file" accept="image/*" style="display: none;" onchange="uploadCharacterFace(event, '${char.id}')">
      </label>
    `;
    characterAnchorsGrid.appendChild(card);
  });
}

window.uploadCharacterFace = function(e, charId) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(ev) {
    const base64 = ev.target.result;
    try {
      const res = await fetch("/api/consistency/upload-character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: charId, imageBase64: base64, filename: file.name })
      });
      const data = await res.json();
      if (data.success) {
        if (allCharactersMap[charId]) {
          allCharactersMap[charId].portrait_url = data.url;
          allCharactersMap[charId].face_locked = true;
        }
        renderCharacterAnchors();
        await loadCharacters();
        alert(`✅ Face reference photo updated for ${allCharactersMap[charId]?.name || charId}!`);
      }
    } catch (err) {
      alert("Error uploading face photo: " + err.message);
    }
  };
  reader.readAsDataURL(file);
};

if (styleFileInput) {
  styleFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target.result;
      try {
        const res = await fetch("/api/consistency/upload-style", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, filename: file.name })
        });
        const data = await res.json();
        if (data.success) {
          if (activeStyleImg) {
            activeStyleImg.src = data.url;
            activeStyleImg.style.display = "block";
          }
          const styleEmptyState = document.getElementById("styleEmptyState");
          const styleAnchorOverlay = document.getElementById("styleAnchorOverlay");
          const styleBadge = document.getElementById("styleAnchorBadge");
          if (styleEmptyState) styleEmptyState.style.display = "none";
          if (styleAnchorOverlay) styleAnchorOverlay.style.display = "block";
          if (styleBadge) {
            styleBadge.className = "badge badge-success";
            styleBadge.textContent = "STYLE REFERENCE ACTIVE";
          }
          if (currentProject) currentProject.thumbnail = data.url;
          alert("✅ Master Visual Style Anchor uploaded & set as reference!");
        }
      } catch (err) {
        alert("Error uploading style image: " + err.message);
      }
    };
    reader.readAsDataURL(file);
  });
}

if (phase1ConsistencyBtn) {
  phase1ConsistencyBtn.addEventListener("click", () => {
    // Populate style anchor state dynamically from currentProject
    const styleBadge = document.getElementById("styleAnchorBadge");
    const styleEmptyState = document.getElementById("styleEmptyState");
    const styleAnchorOverlay = document.getElementById("styleAnchorOverlay");

    if (currentProject) {
      if (styleFormulaText) {
        styleFormulaText.value = currentProject.defaultStylePrompt || "";
      }
      if (currentProject.thumbnail) {
        if (activeStyleImg) {
          activeStyleImg.src = currentProject.thumbnail;
          activeStyleImg.style.display = "block";
        }
        if (styleEmptyState) styleEmptyState.style.display = "none";
        if (styleAnchorOverlay) styleAnchorOverlay.style.display = "block";
        if (styleBadge) {
          styleBadge.className = "badge badge-success";
          styleBadge.textContent = "STYLE REFERENCE ACTIVE";
        }
      } else {
        if (activeStyleImg) activeStyleImg.style.display = "none";
        if (styleEmptyState) styleEmptyState.style.display = "flex";
        if (styleAnchorOverlay) styleAnchorOverlay.style.display = "none";
        if (styleBadge) {
          styleBadge.className = "badge badge-warning";
          styleBadge.textContent = "AWAITING --sref";
        }
      }
    }

    renderCharacterAnchors();
    consistencyModal.style.display = "flex";
  });
}

if (closeConsistencyModalBtn) closeConsistencyModalBtn.addEventListener("click", () => { consistencyModal.style.display = "none"; });
if (cancelConsistencyBtn) cancelConsistencyBtn.addEventListener("click", () => { consistencyModal.style.display = "none"; });

if (applyConsistencyBtn) {
  applyConsistencyBtn.addEventListener("click", async () => {
    try {
      applyConsistencyBtn.disabled = true;
      applyConsistencyBtn.textContent = "Locking DNA Anchors...";

      const res = await fetch("/api/consistency/apply-anchors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodeId: currentEpisode,
          stylePrompt: styleFormulaText.value
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(`🎉 Success! ${data.message}\n\nYour Master Style Image and Character Face References are now locked into the episode generation pipeline.`);
        consistencyModal.style.display = "none";
        await loadEpisode(currentEpisode);
      } else {
        alert("Notice: " + (data.error || "Could not apply"));
      }
    } catch (err) {
      alert("Error applying anchors: " + err.message);
    } finally {
      applyConsistencyBtn.disabled = false;
      applyConsistencyBtn.textContent = "Lock & Apply DNA to All 52 Shots ⚡";
    }
  });
}

// ========================================================
// YGMOTION STUDIO V3: MULTI-CHANNEL & PROJECT HUB CONTROLLER
// ========================================================

let currentProject = null;
let allProjects = [];
let allTemplates = [];

const projectLauncher = document.getElementById("projectLauncher");
const studioEditor = document.getElementById("studioEditor");
const projectsList = document.getElementById("projectsList");
const templatesList = document.getElementById("templatesList");
const homeLauncherBtn = document.getElementById("homeLauncherBtn");
const projectSelect = document.getElementById("projectSelect");

const launcherCreateBtn = document.getElementById("launcherCreateBtn");
const launcherOpenFolderBtn = document.getElementById("launcherOpenFolderBtn");
const navNewProjectBtn = document.getElementById("navNewProjectBtn");
const navResumeStudioBtn = document.getElementById("navResumeStudioBtn");

const newProjectModal = document.getElementById("newProjectModal");
const closeNewProjectModalBtn = document.getElementById("closeNewProjectModalBtn");
const cancelNewProjectBtn = document.getElementById("cancelNewProjectBtn");
const confirmCreateProjectBtn = document.getElementById("confirmCreateProjectBtn");
const newProjName = document.getElementById("newProjName");
const newProjTemplate = document.getElementById("newProjTemplate");
const newProjVisualPipeline = document.getElementById("newProjVisualPipeline");
const newProjSpeakerMode = document.getElementById("newProjSpeakerMode");
const newProjHostGroup = document.getElementById("newProjHostGroup");
const newProjHostVoiceId = document.getElementById("newProjHostVoiceId");
const newProjNarratorMode = document.getElementById("newProjNarratorMode");
const newProjPrompt = document.getElementById("newProjPrompt");
const newProjVoiceId = document.getElementById("newProjVoiceId");
const newProjPacing = document.getElementById("newProjPacing");
const newProjScriptFormula = document.getElementById("newProjScriptFormula");

const deleteProjectModal = document.getElementById("deleteProjectModal");
const closeDeleteProjectModalBtn = document.getElementById("closeDeleteProjectModalBtn");
const cancelDeleteProjectBtn = document.getElementById("cancelDeleteProjectBtn");
const confirmDeleteProjectBtn = document.getElementById("confirmDeleteProjectBtn");
const deleteProjectId = document.getElementById("deleteProjectId");
const deleteProjectTargetName = document.getElementById("deleteProjectTargetName");

const openFolderModal = document.getElementById("openFolderModal");
const closeOpenFolderModalBtn = document.getElementById("closeOpenFolderModalBtn");
const cancelOpenFolderModalBtn = document.getElementById("cancelOpenFolderModalBtn");
const confirmOpenFolderBtn = document.getElementById("confirmOpenFolderBtn");
const externalFolderPath = document.getElementById("externalFolderPath");

function showLauncher() {
  if (projectLauncher) projectLauncher.classList.remove("view-hidden");
  if (studioEditor) studioEditor.classList.add("view-hidden");
  if (homeLauncherBtn) homeLauncherBtn.classList.add("active");
  document.body.classList.add("in-launcher-mode");
  document.body.classList.remove("in-editor-mode");
  window.scrollTo({ top: 0, behavior: "smooth" });
  loadProjects();
}

function showEditor() {
  if (projectLauncher) projectLauncher.classList.add("view-hidden");
  if (studioEditor) studioEditor.classList.remove("view-hidden");
  if (homeLauncherBtn) homeLauncherBtn.classList.remove("active");
  document.body.classList.remove("in-launcher-mode");
  document.body.classList.add("in-editor-mode");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

if (navResumeStudioBtn) {
  navResumeStudioBtn.addEventListener("click", () => {
    showEditor();
  });
}

if (homeLauncherBtn) {
  homeLauncherBtn.addEventListener("click", () => {
    if (projectLauncher && !projectLauncher.classList.contains("view-hidden")) {
      showEditor();
    } else {
      showLauncher();
    }
  });
}

// Load Projects & Templates
async function loadProjects() {
  try {
    const res = await fetch("/api/projects");
    const data = await res.json();
    allProjects = data.projects || [];
    currentProject = data.active || null;
    allTemplates = data.templates || [];

    renderProjectsList();
    renderTemplatesList();
    updateProjectDropdown();

    if (currentProject) {
      const navBrand = document.getElementById("navChannelName");
      if (navBrand) navBrand.innerHTML = `${currentProject.name.toUpperCase()}<span class="gradient-text">.STUDIO</span>`;
    }
  } catch (err) {
    console.error("Error loading projects:", err);
  }
}

function getCategoryIcon(cat) {
  if (!cat) return "🎬";
  const c = cat.toLowerCase();
  if (c.includes("crime") || c.includes("thriller")) return "🕵️";
  if (c.includes("pov") || c.includes("progression")) return "⚡";
  if (c.includes("stickman") || c.includes("animation")) return "✏️";
  if (c.includes("documentary") || c.includes("investigative") || c.includes("history")) return "📜";
  if (c.includes("horror") || c.includes("mystery")) return "🕯️";
  if (c.includes("finance") || c.includes("business")) return "📊";
  return "🎬";
}

function renderProjectsList() {
  if (!projectsList) return;
  projectsList.innerHTML = "";

  if (allProjects.length === 0) {
    projectsList.innerHTML = `<div style="color: var(--text-muted); font-size: 0.9rem;">No channels found. Create one to get started.</div>`;
    return;
  }

  allProjects.forEach(proj => {
    const card = document.createElement("div");
    card.className = `channel-card project-card ${proj.isActive ? "active-card" : ""}`;
    const primaryColor = proj.colorPalette?.primary || '#00f0ff';
    const thumbHtml = proj.thumbnail
      ? `<img src="${proj.thumbnail}" alt="${proj.name}">`
      : `<div class="channel-card-thumb-placeholder" style="background: radial-gradient(circle at 50% 50%, rgba(30, 41, 59, 0.8), #0b0f19); display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; border-bottom: 1px solid rgba(255,255,255,0.06);">
          <span style="font-size: 2.8rem; margin-bottom: 4px;">${getCategoryIcon(proj.category)}</span>
          <span style="font-size: 0.75rem; letter-spacing: 1px; color: ${primaryColor}; text-transform: uppercase; font-weight: 700;">${proj.visualPipeline || 'Pipeline'}</span>
          <span style="font-size: 0.65rem; color: var(--text-muted); margin-top: 2px;">⚡ Ready to Configure</span>
        </div>`;

    const voiceName = proj.voiceProfile?.voiceId || (proj.defaultVoices?.mainVoiceId) || 'Dynamic VO';
    const onscreenMode = proj.narratorMode || 'Auto';
    const formula = proj.scriptFormula || 'Narrative Arc';
    const speakerBadge = proj.speakerMode === "host_and_guest" ? "🎙️+🎙️ Host & Guest" : "🎙️ Solo Narrator";
    const canDelete = allProjects.length > 1;

    card.innerHTML = `
      <div class="channel-card-thumb">
        ${thumbHtml}
        <span class="channel-badge">${proj.tag || 'CHANNEL'}</span>
        ${proj.isActive ? `<span class="active-pill">ACTIVE WORKSPACE</span>` : ""}
      </div>
      <div class="channel-card-body">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
          <h3 class="channel-card-name">${proj.name}</h3>
          <span class="channel-archetype-tag">${proj.category || 'Storytelling'}</span>
        </div>
        <p class="channel-card-desc">${proj.description || ''}</p>
        <div class="channel-meta-pills">
          <span class="channel-meta-pill" style="color: var(--accent-gold); font-weight: 600;">${speakerBadge}</span>
          <span class="channel-meta-pill">🎙️ ${voiceName}</span>
          <span class="channel-meta-pill">🎭 ${onscreenMode}</span>
          <span class="channel-meta-pill">📜 ${formula}</span>
        </div>
        <div class="channel-card-footer">
          <span class="channel-card-stats">🎞️ ${proj.episodeCount || 0} Episodes • ${proj.visualPipeline || 'Flux'}</span>
          <div class="channel-card-actions">
            ${canDelete ? `
              <button class="delete-channel-btn" data-id="${proj.path || proj.id}" data-name="${proj.name.replace(/"/g, '&quot;')}" title="Delete channel workspace">
                🗑️
              </button>
            ` : ''}
            <button class="btn ${proj.isActive ? 'btn-primary btn-glow' : 'btn-secondary'} btn-sm open-studio-btn">
              ${proj.isActive ? 'Resume Studio 🎬' : 'Enter Studio 🎬'}
            </button>
          </div>
        </div>
      </div>
    `;

    card.addEventListener("click", async () => {
      await switchProject(proj.path || proj.id);
      showEditor();
    });

    const delBtn = card.querySelector(".delete-channel-btn");
    if (delBtn) {
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = delBtn.getAttribute("data-id");
        const name = delBtn.getAttribute("data-name");
        deleteProjectId.value = id;
        deleteProjectTargetName.textContent = name;
        deleteProjectModal.style.display = "flex";
      });
    }

    projectsList.appendChild(card);
  });
}

function renderTemplatesList() {
  if (!templatesList) return;
  templatesList.innerHTML = "";

  allTemplates.forEach(tpl => {
    const card = document.createElement("div");
    card.className = "template-card";
    card.innerHTML = `
      <div class="template-header">
        <span class="template-name">${tpl.name}</span>
        <span class="template-tag" style="color: ${tpl.colorPalette ? tpl.colorPalette.primary : '#00f0ff'}">${tpl.tag || 'ARCHETYPE'}</span>
      </div>
      <p class="template-desc">${tpl.description || ''}</p>
      <button class="btn btn-secondary btn-sm use-template-btn" style="margin-top: auto;">Use Blueprint 🚀</button>
    `;

    card.querySelector(".use-template-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      openNewProjectModalWithTemplate(tpl.id);
    });

    templatesList.appendChild(card);
  });
}

function updateProjectDropdown() {
  if (!projectSelect) return;
  projectSelect.innerHTML = "";
  allProjects.forEach(proj => {
    const opt = document.createElement("option");
    opt.value = proj.path || proj.id;
    opt.textContent = `${proj.isActive ? '🎬 ' : ''}${proj.name}`;
    if (proj.isActive) opt.selected = true;
    projectSelect.appendChild(opt);
  });
}

if (projectSelect) {
  projectSelect.addEventListener("change", async (e) => {
    await switchProject(e.target.value);
    showEditor();
  });
}

async function switchProject(idOrPath) {
  try {
    const res = await fetch("/api/projects/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectIdOrPath: idOrPath })
    });
    const data = await res.json();
    if (data.success) {
      currentProject = data.active;
      const navBrand = document.getElementById("navChannelName");
      if (navBrand) navBrand.innerHTML = `${currentProject.name.toUpperCase()}<span class="gradient-text">.STUDIO</span>`;
      
      // Reload studio data for newly active workspace
      await loadStyles();
      await loadBrandProfile();
      await loadCharacters();
      await loadEpisodes();
      await loadEpisode("EP001");
      await loadProjects();
    }
  } catch (err) {
    alert("Error switching project: " + err.message);
  }
}

// Delete Confirmation Modal Controls
if (closeDeleteProjectModalBtn) {
  closeDeleteProjectModalBtn.addEventListener("click", () => {
    deleteProjectModal.style.display = "none";
  });
}
if (cancelDeleteProjectBtn) {
  cancelDeleteProjectBtn.addEventListener("click", () => {
    deleteProjectModal.style.display = "none";
  });
}
if (confirmDeleteProjectBtn) {
  confirmDeleteProjectBtn.addEventListener("click", async () => {
    const idOrPath = (deleteProjectId.value || "").trim();
    if (!idOrPath) return;

    try {
      confirmDeleteProjectBtn.disabled = true;
      confirmDeleteProjectBtn.textContent = "Deleting...";

      const res = await fetch("/api/projects/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectIdOrPath: idOrPath })
      });
      const data = await res.json();
      if (data.success) {
        deleteProjectModal.style.display = "none";
        alert(`🗑️ Project successfully deleted.`);
        await loadProjects();
        if (data.activeProject) {
          await switchProject(data.activeProject.path || data.activeProject.id);
        }
      } else {
        alert("Delete failed: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      alert("Error deleting project: " + err.message);
    } finally {
      confirmDeleteProjectBtn.disabled = false;
      confirmDeleteProjectBtn.textContent = "Delete Channel 🗑️";
    }
  });
}

// Creation Wizard Modal Controls
const archetypeDefaults = {
  ranks_pov: {
    prompt: "Ultra-crisp 4K first-person POV shot, tactical gloves, cybernetic HUD subtle overlay, extreme wide dynamic angle, cinematic color grading, hyper-realistic, 8k render, unreal engine 5 style, octane render lighting",
    visualPipeline: "fal_flux_cinematic",
    speakerMode: "solo_narrator",
    narratorMode: "pov_hands_hud",
    voiceId: "POV_OPERATOR_V1",
    pacing: "165",
    scriptFormula: "5-Tier Gamified Progression"
  },
  stickman_animation: {
    prompt: "Minimalist crisp 2D vector stick figure art style, bold clean black outlines, expressive animated posture, solid soft background, modern infographic humor, clean Casually Explained and Kurzgesagt aesthetic, high resolution vector",
    visualPipeline: "stable_diffusion_xl",
    speakerMode: "solo_narrator",
    narratorMode: "stick_avatar",
    voiceId: "STICKMAN_HERO",
    pacing: "165",
    scriptFormula: "3-Act Comedic Confession"
  },
  visual_documentary: {
    prompt: "Cinematic archival documentary photography, rich forensic lighting, authentic vintage texture, high contrast chiaroscuro, investigative editorial style, 35mm film grain, 8k resolution, Leica M11 photography, dramatic historical tone",
    visualPipeline: "midjourney_proxy",
    speakerMode: "solo_narrator",
    narratorMode: "voiceover_only",
    voiceId: "DOC_NARRATOR_CALM",
    pacing: "130",
    scriptFormula: "Forensic Investigative Dossier"
  },
  crime_suspense: {
    prompt: "Cinematic 35mm film still, neo-noir police investigation atmosphere, rain-slicked asphalt, low-key dramatic lighting, moody neon reflections, subtle film grain, Kodak Vision3 500T, hyper-detailed, suspenseful atmosphere, photorealistic",
    visualPipeline: "fal_flux_cinematic",
    speakerMode: "host_and_guest",
    hostVoiceId: "HOST_MASTER_V1",
    narratorMode: "shadow_anchor",
    voiceId: "CRIME_CHRONICLER_V1",
    pacing: "145",
    scriptFormula: "Cold Open -> Police Clues -> Twist Reveal"
  },
  custom: {
    prompt: "",
    visualPipeline: "fal_flux_cinematic",
    speakerMode: "solo_narrator",
    narratorMode: "voiceover_only",
    voiceId: "CREATOR_CUSTOM_V1",
    pacing: "145",
    scriptFormula: "Custom Creator Narrative Arc"
  }
};

function openNewProjectModalWithTemplate(tplId) {
  if (newProjTemplate) {
    newProjTemplate.value = tplId || "ranks_pov";
    updateTemplatePromptPreview();
  }
  if (newProjectModal) newProjectModal.style.display = "flex";
}

function toggleHostVoiceGroup() {
  if (!newProjHostGroup || !newProjSpeakerMode) return;
  if (newProjSpeakerMode.value === "host_and_guest") {
    newProjHostGroup.style.display = "block";
  } else {
    newProjHostGroup.style.display = "none";
  }
}

function updateTemplatePromptPreview() {
  if (!newProjTemplate) return;
  const tplId = newProjTemplate.value;
  const def = archetypeDefaults[tplId] || archetypeDefaults.custom;

  if (newProjPrompt) newProjPrompt.value = def.prompt;
  if (newProjVisualPipeline) newProjVisualPipeline.value = def.visualPipeline;
  if (newProjSpeakerMode) {
    newProjSpeakerMode.value = def.speakerMode || "solo_narrator";
    toggleHostVoiceGroup();
  }
  if (newProjHostVoiceId) newProjHostVoiceId.value = def.hostVoiceId || "HOST_MASTER_V1";
  if (newProjNarratorMode) newProjNarratorMode.value = def.narratorMode;
  if (newProjVoiceId) newProjVoiceId.value = def.voiceId;
  if (newProjPacing) newProjPacing.value = def.pacing;
  if (newProjScriptFormula) newProjScriptFormula.value = def.scriptFormula;
}

if (newProjTemplate) {
  newProjTemplate.addEventListener("change", updateTemplatePromptPreview);
}

if (newProjSpeakerMode) {
  newProjSpeakerMode.addEventListener("change", toggleHostVoiceGroup);
}

if (launcherCreateBtn) launcherCreateBtn.addEventListener("click", () => openNewProjectModalWithTemplate("ranks_pov"));
if (navNewProjectBtn) navNewProjectBtn.addEventListener("click", () => openNewProjectModalWithTemplate("ranks_pov"));
if (closeNewProjectModalBtn) closeNewProjectModalBtn.addEventListener("click", () => { newProjectModal.style.display = "none"; });
if (cancelNewProjectBtn) cancelNewProjectBtn.addEventListener("click", () => { newProjectModal.style.display = "none"; });

if (confirmCreateProjectBtn) {
  confirmCreateProjectBtn.addEventListener("click", async () => {
    const name = (newProjName.value || "").trim();
    if (!name) {
      alert("Please enter a Channel Name.");
      return;
    }

    try {
      confirmCreateProjectBtn.disabled = true;
      confirmCreateProjectBtn.textContent = "Scaffolding Channel...";

      const speakerMode = newProjSpeakerMode ? newProjSpeakerMode.value : "solo_narrator";
      const hostVoice = (speakerMode === "host_and_guest") ? {
        voiceId: newProjHostVoiceId?.value || "HOST_MASTER_V1",
        voiceName: "Host Anchor"
      } : null;

      const res = await fetch("/api/projects/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          templateId: newProjTemplate.value,
          customPrompt: newProjPrompt ? newProjPrompt.value : "",
          visualPipeline: newProjVisualPipeline ? newProjVisualPipeline.value : "fal_flux_cinematic",
          speakerMode,
          hostVoice,
          narratorMode: newProjNarratorMode ? newProjNarratorMode.value : "voiceover_only",
          voiceProfile: {
            voiceId: newProjVoiceId ? newProjVoiceId.value : "POV_OPERATOR_V1",
            pacingWpm: parseInt(newProjPacing?.value || "145", 10)
          },
          scriptFormula: newProjScriptFormula ? newProjScriptFormula.value : "Standard Narrative"
        })
      });

      const data = await res.json();
      if (data.success) {
        newProjectModal.style.display = "none";
        newProjName.value = "";
        alert(`🎉 Channel '${data.project.name}' successfully scaffolded!\n\nEntering Studio timeline with locked channel DNA & visual pipeline.`);
        await switchProject(data.project.id);
        showEditor();
      } else {
        alert("Error creating project: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      alert("Creation error: " + err.message);
    } finally {
      confirmCreateProjectBtn.disabled = false;
      confirmCreateProjectBtn.textContent = "Create Channel & Launch Studio 🚀";
    }
  });
}

// External Folder Modal Controls
if (launcherOpenFolderBtn) launcherOpenFolderBtn.addEventListener("click", () => { openFolderModal.style.display = "flex"; });
const navOpenBtn = document.getElementById("openFolderBtn");
if (closeOpenFolderModalBtn) closeOpenFolderModalBtn.addEventListener("click", () => { openFolderModal.style.display = "none"; });
if (cancelOpenFolderModalBtn) cancelOpenFolderModalBtn.addEventListener("click", () => { openFolderModal.style.display = "none"; });

if (confirmOpenFolderBtn) {
  confirmOpenFolderBtn.addEventListener("click", async () => {
    const p = (externalFolderPath.value || "").trim();
    if (!p) {
      alert("Please enter a valid directory path.");
      return;
    }

    try {
      confirmOpenFolderBtn.disabled = true;
      confirmOpenFolderBtn.textContent = "Mounting...";

      const res = await fetch("/api/projects/open-external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderPath: p })
      });

      const data = await res.json();
      if (data.success) {
        openFolderModal.style.display = "none";
        alert(`📂 Mounted external workspace: ${data.project.name}`);
        await switchProject(data.project.path);
        showEditor();
      } else {
        alert("Mount failed: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      confirmOpenFolderBtn.disabled = false;
      confirmOpenFolderBtn.textContent = "Mount & Open Channel 📂";
    }
  });
}

// ==========================================
// 5-STAGE GUIDED WORKFLOW LOGIC (YouTube Ingestion -> Script -> Voice -> Motion)
// ==========================================
let activeBlueprint = null;
let activeScriptData = null;
let activeTimingData = null;
let selectedViralTopic = null;
let selectedVoicePersonaId = "POV_OPERATOR_V1";

// Modal Selectors
const channelIngestionModal = document.getElementById("channelIngestionModal");
const launcherIngestBtn = document.getElementById("launcherIngestBtn");
const closeChannelIngestionModalBtn = document.getElementById("closeChannelIngestionModalBtn");
const cancelChannelIngestionModalBtn = document.getElementById("cancelChannelIngestionModalBtn");
const btnRunChannelAnalyze = document.getElementById("btnRunChannelAnalyze");
const ytChannelUrlInput = document.getElementById("ytChannelUrlInput");
const ingestProgressCard = document.getElementById("ingestProgressCard");
const ingestResultsDashboard = document.getElementById("ingestResultsDashboard");
const btnLaunchScriptFromIngest = document.getElementById("btnLaunchScriptFromIngest");
const ingestViralTopicsList = document.getElementById("ingestViralTopicsList");
const ingestCustomTopicInput = document.getElementById("ingestCustomTopicInput");

// Script Gate Selectors
const scriptGateModal = document.getElementById("scriptGateModal");
const closeScriptGateModalBtn = document.getElementById("closeScriptGateModalBtn");
const cancelScriptGateModalBtn = document.getElementById("cancelScriptGateModalBtn");
const btnConfirmScriptGate = document.getElementById("btnConfirmScriptGate");
const btnRegenerateScript = document.getElementById("btnRegenerateScript");
const scriptGateScenesContainer = document.getElementById("scriptGateScenesContainer");

// Voice Gate Selectors
const voiceGateModal = document.getElementById("voiceGateModal");
const closeVoiceGateModalBtn = document.getElementById("closeVoiceGateModalBtn");
const cancelVoiceGateModalBtn = document.getElementById("cancelVoiceGateModalBtn");
const btnPreviewVoiceSample = document.getElementById("btnPreviewVoiceSample");
const btnConfirmVoiceGate = document.getElementById("btnConfirmVoiceGate");
const voiceGateGrid = document.getElementById("voiceGateGrid");

// Scene Director Selectors
const sceneDirectorModal = document.getElementById("sceneDirectorModal");
const closeSceneDirectorModalBtn = document.getElementById("closeSceneDirectorModalBtn");
const cancelSceneDirectorModalBtn = document.getElementById("cancelSceneDirectorModalBtn");
const btnBatchAnimateAll = document.getElementById("btnBatchAnimateAll");
const btnConfirmSceneDirector = document.getElementById("btnConfirmSceneDirector");
const sceneDirectorGrid = document.getElementById("sceneDirectorGrid");

// 1. Ingestion Modal Controls
if (launcherIngestBtn) {
  launcherIngestBtn.addEventListener("click", () => {
    channelIngestionModal.style.display = "flex";
  });
}
if (closeChannelIngestionModalBtn) closeChannelIngestionModalBtn.addEventListener("click", () => { channelIngestionModal.style.display = "none"; });
if (cancelChannelIngestionModalBtn) cancelChannelIngestionModalBtn.addEventListener("click", () => { channelIngestionModal.style.display = "none"; });

// Quick Preset Buttons
document.querySelectorAll(".quick-channel-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (ytChannelUrlInput) {
      ytChannelUrlInput.value = btn.dataset.url;
      if (btnRunChannelAnalyze) btnRunChannelAnalyze.click();
    }
  });
});

// Run Channel Analysis
if (btnRunChannelAnalyze) {
  btnRunChannelAnalyze.addEventListener("click", async () => {
    const url = (ytChannelUrlInput.value || "").trim();
    if (!url) {
      alert("Please paste a valid YouTube Channel or Video URL.");
      return;
    }

    try {
      btnRunChannelAnalyze.disabled = true;
      btnRunChannelAnalyze.textContent = "Analyzing...";
      ingestProgressCard.style.display = "block";
      ingestResultsDashboard.style.display = "none";
      if (btnLaunchScriptFromIngest) btnLaunchScriptFromIngest.style.display = "none";

      const res = await fetch("/api/channel/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      const data = await res.json();
      if (!data.success || !data.blueprint) {
        throw new Error(data.error || "Channel analysis failed");
      }

      activeBlueprint = data.blueprint;
      renderIngestResults(activeBlueprint);
    } catch (err) {
      alert("Analysis failed: " + err.message);
    } finally {
      btnRunChannelAnalyze.disabled = false;
      btnRunChannelAnalyze.textContent = "Analyze Niche 🔍";
      ingestProgressCard.style.display = "none";
    }
  });
}

function renderIngestResults(bp) {
  ingestResultsDashboard.style.display = "block";
  document.getElementById("ingestChannelTitle").textContent = bp.channelTitle || "YouTube Creator";
  document.getElementById("ingestChannelStats").textContent = `${bp.analyzedVideosCount || 30} Videos Analyzed • ${bp.subscribers || 'Active Audience'} • Solo Narrator Standard`;
  document.getElementById("ingestArchetypeBadge").textContent = bp.nicheInsights.archetypeName;
  document.getElementById("ingestPacingVal").textContent = `${bp.nicheInsights.pacingWpm} WPM`;
  document.getElementById("ingestPacingDesc").textContent = bp.nicheInsights.pacingDescriptor;
  document.getElementById("ingestMotionVal").textContent = bp.nicheInsights.archetype === 'stickman_animation' ? '2D Vector & Snap Zooms' : bp.nicheInsights.archetype === 'ranks_pov' ? '2.5D Push-In & HUD' : '2.5D Archival Float';
  document.getElementById("ingestVoiceVal").textContent = bp.suggestedVoice.presetId;
  document.getElementById("ingestVoiceDesc").textContent = bp.suggestedVoice.tone;
  document.getElementById("ingestHookFormula").textContent = bp.nicheInsights.hookFormula;

  if (bp.channelAvatar) {
    const av = document.getElementById("ingestChannelAvatar");
    av.innerHTML = `<img src="${bp.channelAvatar}" style="width:100%; height:100%; object-fit:cover;">`;
  }

  // Render Viral Topics
  ingestViralTopicsList.innerHTML = "";
  (bp.viralTopics || []).forEach((topic, idx) => {
    const card = document.createElement("div");
    card.className = "viral-topic-card";
    card.style.cssText = "padding: 14px 16px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); cursor: pointer; transition: all 0.2s;";
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
        <h5 style="margin: 0; font-size: 0.95rem; color: #f8fafc;">${idx + 1}. ${topic.title}</h5>
        <span class="topic-select-pill" style="font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; background: rgba(245, 158, 11, 0.15); color: #f59e0b;">Select ✍️</span>
      </div>
      <p style="margin: 0; font-size: 0.8rem; color: #94a3b8; font-style: italic; line-height: 1.4;">"${topic.hook}"</p>
    `;

    card.addEventListener("click", () => {
      document.querySelectorAll(".viral-topic-card").forEach(c => {
        c.style.borderColor = "var(--border-subtle)";
        c.style.background = "rgba(255,255,255,0.03)";
      });
      card.style.borderColor = "#f59e0b";
      card.style.background = "rgba(245, 158, 11, 0.08)";
      selectedViralTopic = topic;
      if (ingestCustomTopicInput) ingestCustomTopicInput.value = "";
      btnLaunchScriptFromIngest.style.display = "block";
    });

    ingestViralTopicsList.appendChild(card);
  });

  if (bp.viralTopics && bp.viralTopics.length > 0) {
    ingestViralTopicsList.firstChild.click();
  }
}

// 2. Launch Script Generation -> Open Gate 1
if (btnLaunchScriptFromIngest) {
  btnLaunchScriptFromIngest.addEventListener("click", async () => {
    const customTopic = (ingestCustomTopicInput?.value || "").trim();
    const topicToUse = customTopic ? { title: customTopic } : selectedViralTopic;

    if (!topicToUse) {
      alert("Please select a topic or type a custom episode topic.");
      return;
    }

    try {
      btnLaunchScriptFromIngest.disabled = true;
      btnLaunchScriptFromIngest.textContent = "Writing Script...";

      const res = await fetch("/api/script/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blueprint: activeBlueprint,
          topic: topicToUse,
          targetDurationMin: 3
        })
      });

      const data = await res.json();
      if (!data.success || !data.scriptData) {
        throw new Error(data.error || "Script generation failed");
      }

      activeScriptData = data.scriptData;
      channelIngestionModal.style.display = "none";
      openScriptGate(activeScriptData);
    } catch (err) {
      alert("Script generation failed: " + err.message);
    } finally {
      btnLaunchScriptFromIngest.disabled = false;
      btnLaunchScriptFromIngest.textContent = "Generate Script & Enter Gate 1 (Review) ✍️";
    }
  });
}

function openScriptGate(scriptData) {
  document.getElementById("scriptGateTitle").textContent = scriptData.title;
  document.getElementById("scriptGateMeta").textContent = `${scriptData.scenes.length} Scenes • ${scriptData.pacingWpm} WPM Pacing Standard`;
  document.getElementById("scriptGateWordCount").textContent = scriptData.totalWords;
  document.getElementById("scriptGateRuntime").textContent = `${Math.floor(scriptData.estimatedDurationSec / 60)}m ${scriptData.estimatedDurationSec % 60}s`;

  scriptGateScenesContainer.innerHTML = "";

  scriptData.scenes.forEach((scene, sIdx) => {
    const card = document.createElement("div");
    card.className = "script-gate-scene-card";
    card.style.cssText = "padding: 16px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);";
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <span style="font-size: 0.85rem; font-weight: 700; color: #38bdf8;">${scene.title}</span>
        <div style="display: flex; gap: 8px;">
          <span style="font-size: 0.75rem; padding: 2px 8px; background: rgba(168, 85, 247, 0.15); color: #c084fc; border-radius: 4px;">🎬 ${scene.cameraMotion}</span>
          <span style="font-size: 0.75rem; padding: 2px 8px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border-radius: 4px;">⏱️ ${scene.estimatedDurationSec}s</span>
        </div>
      </div>
      <div style="margin-bottom: 10px;">
        <label style="display: block; font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">Narration Spoken Dialogue (Editable):</label>
        <textarea class="form-input scene-text-input" data-scene-index="${sIdx}" style="width: 100%; min-height: 60px; padding: 10px; font-size: 0.9rem; line-height: 1.5; resize: vertical;">${scene.text}</textarea>
      </div>
      <div style="font-size: 0.75rem; color: #94a3b8; background: rgba(255,255,255,0.02); padding: 8px 10px; border-radius: 4px;">
        <strong style="color: #cbd5e1;">Visual Prompt:</strong> ${scene.visualPrompt}
      </div>
    `;

    const txtArea = card.querySelector(".scene-text-input");
    txtArea.addEventListener("input", () => {
      scene.text = txtArea.value;
      scene.wordsCount = txtArea.value.trim().split(/\s+/).length;
      scene.estimatedDurationSec = parseFloat((scene.wordsCount / (scriptData.pacingWpm / 60)).toFixed(1));
      
      const newTotalWords = scriptData.scenes.reduce((acc, s) => acc + s.wordsCount, 0);
      const newDuration = Math.round(newTotalWords / (scriptData.pacingWpm / 60));
      document.getElementById("scriptGateWordCount").textContent = newTotalWords;
      document.getElementById("scriptGateRuntime").textContent = `${Math.floor(newDuration / 60)}m ${newDuration % 60}s`;
    });

    scriptGateScenesContainer.appendChild(card);
  });

  scriptGateModal.style.display = "flex";
}

if (closeScriptGateModalBtn) closeScriptGateModalBtn.addEventListener("click", () => { scriptGateModal.style.display = "none"; });
if (cancelScriptGateModalBtn) cancelScriptGateModalBtn.addEventListener("click", () => { scriptGateModal.style.display = "none"; });

// Confirm Script -> Open Voice Gate 2
if (btnConfirmScriptGate) {
  btnConfirmScriptGate.addEventListener("click", async () => {
    try {
      btnConfirmScriptGate.disabled = true;
      btnConfirmScriptGate.textContent = "Locking Script...";

      await fetch("/api/script/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodeId: currentEpisodeId || "EP001",
          scriptData: activeScriptData
        })
      });

      scriptGateModal.style.display = "none";
      await openVoiceGate();
    } catch (err) {
      alert("Error saving script: " + err.message);
    } finally {
      btnConfirmScriptGate.disabled = false;
      btnConfirmScriptGate.textContent = "Lock Script & Proceed to Voice Design (Gate 2) 🎙️";
    }
  });
}

// 3. Voice Gate 2
async function openVoiceGate() {
  try {
    const res = await fetch("/api/voice/profiles");
    const data = await res.json();
    const profiles = data.profiles || [];

    voiceGateGrid.innerHTML = "";
    profiles.forEach(p => {
      const card = document.createElement("div");
      card.className = "voice-profile-card voice-persona-card";
      card.style.cssText = "padding: 14px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); cursor: pointer; transition: all 0.2s;";
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <strong style="font-size: 0.95rem; color: #fff;">${p.name}</strong>
          <span style="font-size: 0.75rem; color: #34d399;">${p.defaultWpm} WPM</span>
        </div>
        <p style="margin: 0 0 8px 0; font-size: 0.8rem; color: #94a3b8;">${p.style}</p>
        <div style="font-size: 0.75rem; color: #cbd5e1; font-style: italic;">"${p.sampleText.slice(0, 75)}..."</div>
      `;

      card.addEventListener("click", () => {
        document.querySelectorAll(".voice-profile-card").forEach(c => {
          c.style.borderColor = "var(--border-subtle)";
          c.style.background = "rgba(0,0,0,0.3)";
        });
        card.style.borderColor = "#34d399";
        card.style.background = "rgba(52, 211, 153, 0.08)";
        selectedVoicePersonaId = p.id;
      });

      voiceGateGrid.appendChild(card);
    });

    if (voiceGateGrid.firstChild) voiceGateGrid.firstChild.click();
    voiceGateModal.style.display = "flex";
  } catch (err) {
    alert("Could not load voice profiles: " + err.message);
  }
}

if (closeVoiceGateModalBtn) closeVoiceGateModalBtn.addEventListener("click", () => { voiceGateModal.style.display = "none"; });
if (cancelVoiceGateModalBtn) cancelVoiceGateModalBtn.addEventListener("click", () => { 
  voiceGateModal.style.display = "none";
  scriptGateModal.style.display = "flex";
});

// Voice Sample Preview
if (btnPreviewVoiceSample) {
  btnPreviewVoiceSample.addEventListener("click", async () => {
    try {
      btnPreviewVoiceSample.disabled = true;
      btnPreviewVoiceSample.textContent = "Synthesizing...";
      const res = await fetch("/api/voice/design-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: selectedVoicePersonaId })
      });
      const data = await res.json();
      if (data.audioBase64) {
        const audio = new Audio(`data:audio/mpeg;base64,${data.audioBase64}`);
        audio.play();
      } else {
        alert(`🎙️ Voice Persona [${selectedVoicePersonaId}] verified at ${data.durationEstimateSec}s preview.`);
      }
    } catch (e) {
      alert("Preview error: " + e.message);
    } finally {
      btnPreviewVoiceSample.disabled = false;
      btnPreviewVoiceSample.textContent = "Play Voice Sample 🔊";
    }
  });
}

// Confirm Voice -> Generate Master Timestamps -> Open Scene Director Gate 3
if (btnConfirmVoiceGate) {
  btnConfirmVoiceGate.addEventListener("click", async () => {
    try {
      btnConfirmVoiceGate.disabled = true;
      btnConfirmVoiceGate.textContent = "Aligning Timestamps...";

      const speedVal = parseFloat(document.getElementById("voiceGateSpeedSelect")?.value || "1.0");
      const baseWpm = activeScriptData?.pacingWpm || 165;
      const effectiveWpm = Math.round(baseWpm * speedVal);

      const res = await fetch("/api/voice/generate-master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodeId: currentEpisodeId || "EP001",
          scenes: activeScriptData.scenes,
          pacingWpm: effectiveWpm
        })
      });

      const data = await res.json();
      if (!data.success || !data.timing) {
        throw new Error(data.error || "Timestamp alignment failed");
      }

      activeTimingData = data.timing;
      voiceGateModal.style.display = "none";
      openSceneDirectorGate();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      btnConfirmVoiceGate.disabled = false;
      btnConfirmVoiceGate.textContent = "Synthesize Voice & Generate Timestamps (Gate 3) 🎬";
    }
  });
}

// 4. Scene & Motion Director Gate 3
function openSceneDirectorGate() {
  sceneDirectorGrid.innerHTML = "";

  const scenes = activeScriptData.scenes || [];
  const chunks = activeTimingData?.chunks || [];

  scenes.forEach((scene, sIdx) => {
    const chunk = chunks[sIdx] || {};
    const durSec = chunk.durationSec || scene.estimatedDurationSec || 4.0;

    const card = document.createElement("div");
    card.className = "scene-motion-card scene-director-card";
    card.style.cssText = "padding: 14px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);";
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <strong style="font-size: 0.9rem; color: #c084fc;">Scene ${sIdx + 1}: ${scene.title}</strong>
        <span style="font-size: 0.75rem; color: #38bdf8;">${durSec}s Duration</span>
      </div>

      <div class="scene-preview-container" style="margin-bottom: 10px; width: 100%; height: 130px; background: #000; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; position: relative; border: 1px solid rgba(255,255,255,0.06);">
        <img class="scene-preview-img" src="/media/${currentEpisodeId || 'EP001'}/channel_assets/style/master_style_reference_16x9.jpg" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'">
        <video class="scene-preview-video" style="width: 100%; height: 100%; object-fit: cover; display: none;" autoplay loop muted playsinline></video>
        <span class="motion-pill" style="position: absolute; bottom: 6px; right: 6px; font-size: 0.65rem; background: rgba(0,0,0,0.75); color: #38bdf8; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(56, 189, 248, 0.3);">Image Ready</span>
      </div>

      <p style="font-size: 0.8rem; color: #cbd5e1; margin-bottom: 10px; line-height: 1.4;">"${scene.text.slice(0, 100)}..."</p>
      
      <div style="margin-bottom: 10px;">
        <label style="display: block; font-size: 0.75rem; color: #94a3b8; margin-bottom: 4px;">Camera Motion Profile (Image-to-Video):</label>
        <select class="form-select scene-motion-select" style="width: 100%; padding: 8px; font-size: 0.85rem;">
          <option value="push_in" ${scene.cameraMotion === 'push_in' ? 'selected' : ''}>Cinematic Push-In (Slow Zoom)</option>
          <option value="zoom_out" ${scene.cameraMotion === 'zoom_out' ? 'selected' : ''}>Context Reveal (Zoom Out)</option>
          <option value="pan_left_right" ${scene.cameraMotion === 'pan_left_right' ? 'selected' : ''}>Documentary Lateral Pan</option>
          <option value="tilt_up_down" ${scene.cameraMotion === 'tilt_up_down' ? 'selected' : ''}>Archival Vertical Scan</option>
          <option value="parallax_float" ${scene.cameraMotion === 'parallax_float' ? 'selected' : ''}>2.5D Parallax Floating</option>
          <option value="camera_shake" ${scene.cameraMotion === 'camera_shake' ? 'selected' : ''}>Action Impact Camera Shake</option>
        </select>
      </div>

      <div style="display: flex; gap: 8px; align-items: center;">
        <button class="btn btn-secondary btn-animate-shot" style="flex: 1; padding: 6px 12px; font-size: 0.8rem;">Animate Scene 🎬</button>
        <span class="shot-status-badge" style="font-size: 0.75rem; color: #34d399;">✓ Motion Ready</span>
      </div>
    `;

    const btnAnimate = card.querySelector(".btn-animate-shot");
    const motionSelect = card.querySelector(".scene-motion-select");
    btnAnimate.addEventListener("click", async () => {
      btnAnimate.disabled = true;
      btnAnimate.textContent = "Rendering...";
      try {
        const res = await fetch("/api/scenes/animate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            episodeId: currentEpisodeId || "EP001",
            shotIndex: sIdx + 1,
            imageRelativePath: "channel_assets/style/master_style_reference_16x9.jpg",
            motionType: motionSelect.value,
            durationSec: durSec
          })
        });
        const data = await res.json();
        if (data.success) {
          btnAnimate.textContent = "✓ Animated!";
          const vid = card.querySelector(".scene-preview-video");
          const img = card.querySelector(".scene-preview-img");
          const pill = card.querySelector(".motion-pill");
          if (vid && data.clipUrl) {
            vid.src = `${data.clipUrl}?t=${Date.now()}`;
            vid.style.display = "block";
            if (img) img.style.display = "none";
            if (pill) {
              pill.textContent = `🎬 ${motionSelect.value.toUpperCase()}`;
              pill.style.color = "#34d399";
              pill.style.borderColor = "rgba(52, 211, 153, 0.4)";
            }
          }
        } else {
          alert("Animation failed: " + data.error);
          btnAnimate.textContent = "Animate Scene 🎬";
        }
      } catch (e) {
        alert("Animation error: " + e.message);
        btnAnimate.textContent = "Animate Scene 🎬";
      } finally {
        btnAnimate.disabled = false;
      }
    });

    sceneDirectorGrid.appendChild(card);
  });

  sceneDirectorModal.style.display = "flex";
}

if (closeSceneDirectorModalBtn) closeSceneDirectorModalBtn.addEventListener("click", () => { sceneDirectorModal.style.display = "none"; });
if (cancelSceneDirectorModalBtn) cancelSceneDirectorModalBtn.addEventListener("click", () => { sceneDirectorModal.style.display = "none"; });

// Batch Animate All
if (btnBatchAnimateAll) {
  btnBatchAnimateAll.addEventListener("click", async () => {
    btnBatchAnimateAll.disabled = true;
    btnBatchAnimateAll.textContent = "Batch Animating...";
    const btns = document.querySelectorAll(".btn-animate-shot");
    for (const b of btns) {
      await b.click();
    }
    btnBatchAnimateAll.disabled = false;
    btnBatchAnimateAll.textContent = "✓ All Scenes Animated!";
  });
}

// Master Assemble Video
if (btnConfirmSceneDirector) {
  btnConfirmSceneDirector.addEventListener("click", async () => {
    try {
      btnConfirmSceneDirector.disabled = true;
      btnConfirmSceneDirector.textContent = "Assembling Master 1080p Video...";
      sceneDirectorModal.style.display = "none";
      showEditor();
      
      const renderBtn = document.getElementById("renderEpisodeBtn");
      if (renderBtn) {
        renderBtn.click();
      } else {
        alert("Master scenes locked. Ready in Studio Editor for Final Render!");
      }
    } finally {
      btnConfirmSceneDirector.disabled = false;
      btnConfirmSceneDirector.textContent = "Lock All Scenes & Assemble Master Video 🚀";
    }
  });
}

// Initialize Studio Application
(async function init() {
  try {
    await loadProjects();
    await loadStyles();
    await loadBrandProfile();
    await loadCalliopeStatus();
    await loadCharacters();
    await loadEpisodes();
    await loadEpisode("EP001");
  } catch (e) {
    console.warn("[YGMotion init] Non-critical init error:", e);
  }
  
  // Option B: Show Project Launcher as Home Screen
  showLauncher();
})();

// Initialize AI Co-Director & Local GPU Telemetry (always runs, independent of init chain)
document.addEventListener("DOMContentLoaded", () => initAiCoDirector());
if (document.readyState !== "loading") initAiCoDirector();

/* ======================================================== */
/* YGMOTION STUDIO V3 — AI CO-DIRECTOR & OLLAMA CONTROLLER  */
/* ======================================================== */
let _aiDirectorInitialized = false;
function initAiCoDirector() {
  if (_aiDirectorInitialized) return;
  _aiDirectorInitialized = true;
  console.log("[YGMotion] AI Co-Director initializing...");
  const drawer = document.getElementById("aiDirectorDrawer");
  const openBtn = document.getElementById("openAiDirectorBtn");
  const closeBtn = document.getElementById("closeAiDirectorBtn");
  const tabQwen = document.getElementById("drawerTabQwen");
  const tabDeepseek = document.getElementById("drawerTabDeepseek");
  const messagesBox = document.getElementById("drawerMessages");
  const emptyState = document.getElementById("drawerEmptyState");
  const input = document.getElementById("drawerInput");
  const sendBtn = document.getElementById("drawerSendBtn");
  const clearBtn = document.getElementById("drawerClearBtn");
  const modelLabel = document.getElementById("drawerActiveModelLabel");

  const vramDot = document.getElementById("ygmotionVramDot");
  const vramText = document.getElementById("ygmotionVramText");
  const vramEjectBtn = document.getElementById("ygmotionVramEjectBtn");

  const actHook = document.getElementById("actGenerateHook");
  const actViralTitles = document.getElementById("actViralTitles");
  const actShots = document.getElementById("actGenerateShots");
  const actRetentionAudit = document.getElementById("actRetentionAudit");
  const actRefine = document.getElementById("actRefineScene");

  let activeModel = "qwen2.5-coder:7b";
  let isGenerating = false;
  let chatHistory = [];

  const backdrop = document.getElementById("aiDirectorBackdrop");

  // Toggle Drawer
  window.openAiDirectorDrawer = () => {
    if (drawer) {
      drawer.classList.add("open");
      if (backdrop) backdrop.classList.add("active");
      if (input) input.focus();
    }
  };
  window.closeAiDirectorDrawer = () => {
    if (drawer) drawer.classList.remove("open");
    if (backdrop) backdrop.classList.remove("active");
  };
  window.toggleAiDirectorDrawer = () => {
    if (drawer) {
      const isOpen = drawer.classList.toggle("open");
      if (backdrop) {
        if (isOpen) backdrop.classList.add("active");
        else backdrop.classList.remove("active");
      }
      if (isOpen && input) input.focus();
    }
  };

  const triggerButtons = document.querySelectorAll("#openAiDirectorBtn, #btnOpenAiDirector, .btn-ai-director, [data-trigger='ai-director']");
  triggerButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      window.toggleAiDirectorDrawer();
    });
  });

  if (backdrop) {
    backdrop.addEventListener("click", () => window.closeAiDirectorDrawer());
  }

  const closeButtons = document.querySelectorAll("#closeAiDirectorBtn, #btnCloseAiDrawer, .btn-drawer-close");
  closeButtons.forEach(btn => {
    btn.addEventListener("click", () => window.closeAiDirectorDrawer());
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      window.closeAiDirectorDrawer();
    }
  });

  // Model Toggle
  function selectModel(model) {
    activeModel = model;
    if (model.includes("qwen")) {
      tabQwen.className = "d-model-btn active-qwen";
      tabDeepseek.className = "d-model-btn";
      if (modelLabel) modelLabel.textContent = "Model: Qwen 2.5 Coder (7B)";
    } else {
      tabQwen.className = "d-model-btn";
      tabDeepseek.className = "d-model-btn active-deepseek";
      if (modelLabel) modelLabel.textContent = "Model: DeepSeek R1 (8B)";
    }
  }

  if (tabQwen) tabQwen.addEventListener("click", () => selectModel("qwen2.5-coder:7b"));
  if (tabDeepseek) tabDeepseek.addEventListener("click", () => selectModel("deepseek-r1:8b"));

  // VRAM Telemetry & Free GPU Eject
  async function pollVram() {
    try {
      const res = await fetch("/api/ai/ollama/status");
      if (res.ok) {
        const data = await res.json();
        if (data.isLoaded) {
          if (vramDot) vramDot.className = "vram-dot active";
          if (vramText) vramText.textContent = `VRAM: ${data.totalVramGB} GB`;
          if (vramEjectBtn) vramEjectBtn.style.display = "inline-block";
        } else {
          if (vramDot) vramDot.className = "vram-dot";
          if (vramText) vramText.textContent = "GPU Idle (0 MB)";
          if (vramEjectBtn) vramEjectBtn.style.display = "none";
        }
      }
    } catch (e) {}
  }

  if (vramEjectBtn) {
    vramEjectBtn.addEventListener("click", async () => {
      vramEjectBtn.disabled = true;
      vramEjectBtn.textContent = "Releasing...";
      try {
        await fetch("/api/ai/ollama/unload", { method: "POST" });
        await pollVram();
      } finally {
        vramEjectBtn.disabled = false;
        vramEjectBtn.textContent = "🛑 Free";
      }
    });
  }

  pollVram();
  setInterval(pollVram, 3000);

  // Chat Execution
  async function sendAiMessage(promptText) {
    const text = promptText || (input ? input.value.trim() : "");
    if (!text || isGenerating) return;

    if (input) input.value = "";
    if (emptyState) emptyState.style.display = "none";

    appendMsg("user", text);

    const assistantRow = appendMsg("assistant", "...");
    const contentEl = assistantRow.querySelector(".d-msg-content");

    isGenerating = true;
    if (sendBtn) sendBtn.disabled = true;

    const isDeepSeek = activeModel.includes("deepseek");
    let fullText = "";

    try {
      const messages = [
        ...chatHistory,
        { role: "user", content: text }
      ];

      const res = await fetch("/api/ai/ollama/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: activeModel,
          messages,
          stream: true
        })
      });

      if (!res.ok) throw new Error(`Ollama error (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const data = JSON.parse(trimmed);
            if (data.message && data.message.content) {
              fullText += data.message.content;
              renderStreaming(contentEl, fullText, isDeepSeek);
              messagesBox.scrollTop = messagesBox.scrollHeight;
            }
          } catch (e) {}
        }
      }

      renderFinal(contentEl, fullText, isDeepSeek);
      chatHistory.push({ role: "user", content: text });
      chatHistory.push({ role: "assistant", content: fullText });

    } catch (err) {
      contentEl.innerHTML = `<span style="color: #f43f5e;">Error: ${err.message}</span>`;
    } finally {
      isGenerating = false;
      if (sendBtn) sendBtn.disabled = false;
      messagesBox.scrollTop = messagesBox.scrollHeight;
      pollVram();
    }
  }

  function appendMsg(role, text) {
    const row = document.createElement("div");
    row.className = `d-msg-row ${role}`;
    const avatarClass = role === "user" ? "user" : (activeModel.includes("qwen") ? "qwen" : "deepseek");
    const avatarIcon = role === "user" ? "👤" : (activeModel.includes("qwen") ? "💻" : "🧠");

    row.innerHTML = `
      <div class="d-msg-avatar ${avatarClass}">${avatarIcon}</div>
      <div class="d-msg-content">${escapeHtml(text)}</div>
    `;
    messagesBox.appendChild(row);
    messagesBox.scrollTop = messagesBox.scrollHeight;
    return row;
  }

  function renderStreaming(el, text, isDeepSeek) {
    if (isDeepSeek) {
      const { thought, content } = parseThink(text);
      let html = "";
      if (thought) {
        html += `
          <div class="d-thought-box">
            <div class="d-thought-header" onclick="this.parentElement.classList.toggle('collapsed')">
              <span>🧠 Reasoning Process (${thought.length} chars)</span>
              <span>▼</span>
            </div>
            <div class="d-thought-body">${escapeHtml(thought)}</div>
          </div>
        `;
      }
      html += formatSimpleMarkdown(content) + `<span style="color: #c084fc;"> ▍</span>`;
      el.innerHTML = html;
    } else {
      el.innerHTML = formatSimpleMarkdown(text) + `<span style="color: #00f0ff;"> ▍</span>`;
    }
  }

  function renderFinal(el, text, isDeepSeek) {
    if (isDeepSeek) {
      const { thought, content } = parseThink(text);
      let html = "";
      if (thought) {
        html += `
          <div class="d-thought-box">
            <div class="d-thought-header" onclick="this.parentElement.classList.toggle('collapsed')">
              <span>🧠 DeepSeek Reasoning Chain</span>
              <span>▼</span>
            </div>
            <div class="d-thought-body">${escapeHtml(thought)}</div>
          </div>
        `;
      }
      html += formatSimpleMarkdown(content);
      el.innerHTML = html;
    } else {
      el.innerHTML = formatSimpleMarkdown(text);
    }
  }

  function parseThink(raw) {
    let thought = "";
    let content = raw;
    const m = raw.match(/<think>([\s\S]*?)(<\/think>|$)/);
    if (m) {
      thought = m[1].trim();
      content = raw.replace(/<think>[\s\S]*?(<\/think>|$)/, "").trim();
    }
    return { thought, content };
  }

  function formatSimpleMarkdown(str) {
    if (!str) return "";
    let s = escapeHtml(str);
    s = s.replace(/```([\s\S]*?)```/g, "<pre style='background:#05070d; padding:8px; border-radius:6px; overflow-x:auto; font-size:0.75rem; color:#00f0ff; margin:6px 0;'><code>$1</code></pre>");
    s = s.replace(/`([^`]+)`/g, "<code style='background:rgba(255,255,255,0.1); padding:1px 4px; border-radius:3px; color:#00f0ff;'>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\n/g, "<br>");
    return s;
  }

  function escapeHtml(s) {
    return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  if (sendBtn) sendBtn.addEventListener("click", () => sendAiMessage());
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendAiMessage();
      }
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      chatHistory = [];
      messagesBox.innerHTML = "";
      if (emptyState) {
        emptyState.style.display = "block";
        messagesBox.appendChild(emptyState);
      }
    });
  }

  // Quick Action: Hook & Plot (DeepSeek R1)
  if (actHook) {
    actHook.addEventListener("click", () => {
      selectModel("deepseek-r1:8b");
      const currentChannel = document.getElementById("navChannelName") ? document.getElementById("navChannelName").textContent : "YGMotion";
      const prompt = `Brainstorm 3 viral escalation hooks and high-retention psychological plot twists for the channel "${currentChannel}". Follow the high-retention escalation framework: Level 1 (The Initial Awakening/Hook), Level 10 (The Escalation), Level 50 (The Breaking Point), Level 100 (The Climax).`;
      sendAiMessage(prompt);
    });
  }

  // Quick Action: Viral Titles & Thumbnail Concepts (DeepSeek R1)
  if (actViralTitles) {
    actViralTitles.addEventListener("click", () => {
      selectModel("deepseek-r1:8b");
      const currentChannel = document.getElementById("navChannelName") ? document.getElementById("navChannelName").textContent : "YGMotion";
      const scriptBox = document.getElementById("scriptContent");
      const topic = scriptBox && scriptBox.value ? scriptBox.value.slice(0, 300) : "Viral High Retention Story";
      const prompt = `Act as an elite YouTube algorithm strategist (10M+ sub retention). For the channel "${currentChannel}" with topic excerpt "${topic}":\n1. Generate 5 High-CTR Curiosity-Gap Titles (under 55 chars, 1 all-caps trigger word, maximum intrigue).\n2. Design 3 High-CTR Thumbnail Concepts with exact visual composition, foreground focal point, color grading contrast, and punchy 2-word text overlay.`;
      sendAiMessage(prompt);
    });
  }

  // Quick Action: Shots Manifest (Qwen 2.5 Coder)
  if (actShots) {
    actShots.addEventListener("click", () => {
      selectModel("qwen2.5-coder:7b");
      const scriptBox = document.getElementById("scriptContent");
      const scriptSnippet = scriptBox && scriptBox.value ? scriptBox.value.slice(0, 800) : "A POV cyberpunk operative breaks into an abandoned high-tech server room.";
      const prompt = `Generate a JSON footage manifest structure for this scene snippet with shotId, duration (seconds), and hyper-realistic visual prompts with cinematic lighting and Unreal Engine 5 render style:\n\n"${scriptSnippet}"`;
      sendAiMessage(prompt);
    });
  }

  // Quick Action: Retention Audit (Qwen 2.5 Coder)
  if (actRetentionAudit) {
    actRetentionAudit.addEventListener("click", () => {
      selectModel("qwen2.5-coder:7b");
      const scriptBox = document.getElementById("scriptContent");
      const text = scriptBox && scriptBox.value ? scriptBox.value.slice(0, 1000) : "";
      const prompt = `Conduct a comprehensive YouTube Audience Retention Audit on this script excerpt:\n\n"${text}"\n\nIdentify:\n1. ⚠️ Retention cliff drops (where viewers might click away).\n2. ⚡ Pacing adjustments (WPM & sentence structure speed).\n3. 🎯 3 Micro-hooks to inject every 30 seconds to lock retention above 70%.`;
      sendAiMessage(prompt);
    });
  }

  // Quick Action: Polish Script
  if (actRefine) {
    actRefine.addEventListener("click", () => {
      selectModel("qwen2.5-coder:7b");
      const scriptBox = document.getElementById("scriptContent");
      const text = scriptBox && scriptBox.value ? scriptBox.value.slice(0, 600) : "";
      const prompt = text 
        ? `Review and punch up this script excerpt to increase spoken engagement and tension for YouTube storytelling:\n\n"${text}"`
        : `Give me 5 punchy opening hook sentences that immediately stop viewers from scrolling on YouTube.`;
      sendAiMessage(prompt);
    });
  }
}

// ==========================================
// CAPCUT DESKTOP TIMELINE EXPORTER CONTROLLER
// ==========================================
const exportCapCutBtn = document.getElementById("exportCapCutBtn");
const capcutModal = document.getElementById("capcutModal");
const closeCapcutModalBtn = document.getElementById("closeCapcutModalBtn");
const closeCapcutModalFooterBtn = document.getElementById("closeCapcutModalFooterBtn");
const capcutDraftPathInput = document.getElementById("capcutDraftPathInput");
const btnCopyCapcutPath = document.getElementById("btnCopyCapcutPath");
const btnOpenCapcutFolder = document.getElementById("btnOpenCapcutFolder");
const capcutDurationBadge = document.getElementById("capcutDurationBadge");
const capcutVideoCountLabel = document.getElementById("capcutVideoCountLabel");
const capcutCaptionsCountLabel = document.getElementById("capcutCaptionsCountLabel");
const capcutStatusLabel = document.getElementById("capcutStatusLabel");

if (exportCapCutBtn) {
  exportCapCutBtn.addEventListener("click", async () => {
    try {
      exportCapCutBtn.disabled = true;
      if (capcutStatusLabel) capcutStatusLabel.textContent = "Compiling Draft Timeline...";

      const res = await fetch("/api/export/capcut", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: currentEpisode || "EP001" })
      });
      const data = await res.json();
      if (data.success) {
        if (capcutDraftPathInput) capcutDraftPathInput.value = data.draftDir || data.draftPath || "";
        if (capcutDurationBadge) {
          const durSec = data.metaInfo?.duration_ms ? (data.metaInfo.duration_ms / 1000) : (data.timelineDurationSec || 120);
          const durMin = (durSec / 60).toFixed(1);
          const clips = data.videoSegments ?? data.shotsCount ?? 0;
          capcutDurationBadge.textContent = `${durMin} min • ${clips} clips`;
        }
        if (capcutVideoCountLabel) capcutVideoCountLabel.textContent = `${data.videoSegments ?? data.shotsCount ?? 0} visual clips loaded`;
        if (capcutCaptionsCountLabel) capcutCaptionsCountLabel.textContent = `${data.captionSegments ?? data.captionsCount ?? 0} karaoke word chunks`;
        if (capcutModal) capcutModal.style.display = "flex";
        if (capcutStatusLabel) capcutStatusLabel.textContent = "Draft compiled ready ✂️";
      } else {
        alert("CapCut Export Notice: " + (data.error || "Could not compile project"));
        if (capcutStatusLabel) capcutStatusLabel.textContent = "Export notice";
      }
    } catch (err) {
      alert("CapCut Export Error: " + err.message);
    } finally {
      exportCapCutBtn.disabled = false;
    }
  });
}

if (btnCopyCapcutPath && capcutDraftPathInput) {
  btnCopyCapcutPath.addEventListener("click", async () => {
    const val = capcutDraftPathInput.value;
    if (val) {
      try {
        await navigator.clipboard.writeText(val);
        const originalText = btnCopyCapcutPath.textContent;
        btnCopyCapcutPath.textContent = "Copied! ✓";
        setTimeout(() => { btnCopyCapcutPath.textContent = originalText; }, 2000);
      } catch (e) {
        capcutDraftPathInput.select();
        document.execCommand("copy");
      }
    }
  });
}

if (btnOpenCapcutFolder) {
  btnOpenCapcutFolder.addEventListener("click", async () => {
    try {
      btnOpenCapcutFolder.disabled = true;
      await fetch("/api/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodeId: currentEpisode || "EP001",
          subPath: "capcut_draft"
        })
      });
    } catch (e) {
      console.warn("Could not open CapCut folder:", e);
    } finally {
      btnOpenCapcutFolder.disabled = false;
    }
  });
}

if (closeCapcutModalBtn) {
  closeCapcutModalBtn.addEventListener("click", () => {
    if (capcutModal) capcutModal.style.display = "none";
  });
}
if (closeCapcutModalFooterBtn) {
  closeCapcutModalFooterBtn.addEventListener("click", () => {
    if (capcutModal) capcutModal.style.display = "none";
  });
}

// ==========================================
// GLOBAL DIALOG & MODAL UX ENHANCEMENTS
// ==========================================
// Close any modal when clicking directly on its outer backdrop or overlay
document.querySelectorAll(".modal-backdrop, .modal-overlay").forEach(modal => {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  });
});

// Close active modal or drawer on Escape key press
function handleGlobalEscape(e) {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-backdrop, .modal-overlay").forEach(modal => {
      if (modal.style.display && modal.style.display !== "none") {
        modal.style.display = "none";
      }
    });
    if (window.closeAiDirectorDrawer) window.closeAiDirectorDrawer();
  }
}
window.addEventListener("keydown", handleGlobalEscape);
document.addEventListener("keydown", handleGlobalEscape);



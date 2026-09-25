"use strict";

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const PROJECTS_DIR = path.join(ROOT_DIR, "projects");
const TEMPLATES_DIR = path.join(ROOT_DIR, "engine", "styles", "templates");
const ACTIVE_CONFIG_FILE = path.join(ROOT_DIR, "engine", "projects", "active_project.json");
const RECENT_FILE = path.join(ROOT_DIR, "engine", "projects", "recent_projects.json");

class ProjectManager {
  constructor() {
    this._ensureDirectories();
    this._bootstrapDefaultProject();
  }

  _ensureDirectories() {
    if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    if (!fs.existsSync(TEMPLATES_DIR)) fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  }

  _bootstrapDefaultProject() {
    const defaultSlug = "crime_chronicles";
    const defaultProjectDir = path.join(PROJECTS_DIR, defaultSlug);

    if (!fs.existsSync(defaultProjectDir)) {
      fs.mkdirSync(defaultProjectDir, { recursive: true });

      // Create channel_profile.json
      const templatePath = path.join(TEMPLATES_DIR, "crime_suspense_template.json");
      let profile = {
        id: defaultSlug,
        name: "True Crime Chronicles",
        category: "crime_suspense",
        tag: "TRUE CRIME",
        description: "Dark cinematic 35mm film aesthetic, high-tension narrative, police radio overlays, heavy bass drone music.",
        visualPipeline: "realistic_cinematic",
        colorPalette: {
          primary: "#e63946",
          background: "#0b0c10",
          accent: "#457b9d",
          text: "#f1faee"
        },
        defaultStylePrompt: "Cinematic 35mm photograph, Kodak Vision3 500T, dark atmospheric lighting, cool shadows with warm sodium streetlight amber rim light, high contrast, subtle film grain, photorealistic, 8k, anamorphic lens flare",
        defaultVoices: {
          hostVoiceId: "HOST_MASTER_V1",
          mainVoiceId: "JAKE_EP01_MASTER"
        },
        audioProfile: {
          bgmDuckDb: -18,
          sfxLevelDb: -12,
          karaokeGlowColor: "#ff4d4d",
          fontFamily: "Montserrat Black"
        },
        createdAt: new Date().toISOString()
      };

      if (fs.existsSync(templatePath)) {
        try {
          const tData = JSON.parse(fs.readFileSync(templatePath, "utf8"));
          profile = { ...profile, ...tData, id: defaultSlug, name: "True Crime Chronicles" };
        } catch (e) {}
      }
      fs.writeFileSync(path.join(defaultProjectDir, "channel_profile.json"), JSON.stringify(profile, null, 2), "utf8");

      // Copy existing episodes and channel_assets into default project if available
      const rootEpisodes = path.join(ROOT_DIR, "episodes");
      const targetEpisodes = path.join(defaultProjectDir, "episodes");
      if (fs.existsSync(rootEpisodes) && !fs.existsSync(targetEpisodes)) {
        this._copyRecursiveSync(rootEpisodes, targetEpisodes);
      }

      const rootAssets = path.join(ROOT_DIR, "channel_assets");
      const targetAssets = path.join(defaultProjectDir, "channel_assets");
      if (fs.existsSync(rootAssets) && !fs.existsSync(targetAssets)) {
        this._copyRecursiveSync(rootAssets, targetAssets);
      }
    }

    if (!fs.existsSync(ACTIVE_CONFIG_FILE)) {
      fs.writeFileSync(ACTIVE_CONFIG_FILE, JSON.stringify({ activeId: defaultSlug, customPath: null }, null, 2), "utf8");
    }
  }

  _copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    if (isDirectory) {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      fs.readdirSync(src).forEach(childItemName => {
        this._copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
      });
    } else if (exists) {
      fs.copyFileSync(src, dest);
    }
  }

  listTemplates() {
    if (!fs.existsSync(TEMPLATES_DIR)) return [];
    return fs.readdirSync(TEMPLATES_DIR)
      .filter(f => f.endsWith(".json"))
      .map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, f), "utf8"));
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);
  }

  listProjects() {
    const projects = [];
    const active = this.getActiveProjectInfo();

    // 1. Scan projects/
    if (fs.existsSync(PROJECTS_DIR)) {
      const dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        const pDir = path.join(PROJECTS_DIR, d.name);
        const meta = this._readProjectMeta(pDir, d.name, false);
        if (meta) {
          meta.isActive = (active && active.id === meta.id);
          projects.push(meta);
        }
      }
    }

    // 2. Scan recent external projects
    if (fs.existsSync(RECENT_FILE)) {
      try {
        const recents = JSON.parse(fs.readFileSync(RECENT_FILE, "utf8")) || [];
        for (const extPath of recents) {
          if (fs.existsSync(extPath) && fs.statSync(extPath).isDirectory()) {
            const extName = path.basename(extPath);
            const meta = this._readProjectMeta(extPath, extName, true);
            if (meta && !projects.some(p => p.path === extPath)) {
              meta.isActive = (active && active.path === extPath);
              projects.push(meta);
            }
          }
        }
      } catch (e) {}
    }

    return projects;
  }

  _readProjectMeta(projectPath, slug, isExternal) {
    const profileFile = path.join(projectPath, "channel_profile.json");
    let profile = {
      id: slug,
      name: slug.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
      category: "general",
      tag: "GENERAL",
      description: "YGMotion Video Production Workspace",
      visualPipeline: "realistic_cinematic",
      colorPalette: { primary: "#6366f1" }
    };

    if (fs.existsSync(profileFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(profileFile, "utf8"));
        profile = { ...profile, ...parsed };
      } catch (e) {}
    }

    // Count episodes
    const epDir = path.join(projectPath, "episodes");
    let episodeCount = 0;
    let latestEpisode = null;
    if (fs.existsSync(epDir) && fs.statSync(epDir).isDirectory()) {
      const eps = fs.readdirSync(epDir).filter(f => f.startsWith("EP"));
      episodeCount = eps.length;
      if (eps.length > 0) latestEpisode = eps[0];
    }

    // Look for thumbnail preview strictly within this project's own channel_assets/style directory
    let thumbnail = null;
    const styleDir = path.join(projectPath, "channel_assets", "style");
    if (fs.existsSync(styleDir) && fs.statSync(styleDir).isDirectory()) {
      const styleImages = fs.readdirSync(styleDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
      if (styleImages.length > 0) {
        const chosen = styleImages.find(f => f.startsWith("custom_style")) || styleImages[0];
        thumbnail = `/media-project/${slug}/channel_assets/style/${chosen}`;
      }
    }

    return {
      id: slug,
      name: profile.name,
      category: profile.category,
      tag: profile.tag || "CHANNEL",
      description: profile.description,
      visualPipeline: profile.visualPipeline || "realistic_cinematic",
      colorPalette: profile.colorPalette,
      defaultStylePrompt: profile.defaultStylePrompt,
      speakerMode: profile.speakerMode || (profile.hostVoice ? "host_and_guest" : "solo_narrator"),
      hostVoice: profile.hostVoice || null,
      voiceProfile: profile.voiceProfile || (profile.defaultVoices ? { voiceId: profile.defaultVoices.mainVoiceId || profile.defaultVoices.hostVoiceId, voiceName: "Default Storyteller", pacing: "moderate", tone: "Engaging" } : null),
      narratorMode: profile.narratorMode || "voiceover_only",
      scriptFormula: profile.scriptFormula || null,
      audioProfile: profile.audioProfile || null,
      episodeCount,
      latestEpisode,
      thumbnail,
      path: projectPath,
      isExternal: !!isExternal,
      createdAt: profile.createdAt || null
    };
  }

  getActiveProjectInfo() {
    let activeId = "crime_chronicles";
    let customPath = null;

    if (fs.existsSync(ACTIVE_CONFIG_FILE)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(ACTIVE_CONFIG_FILE, "utf8"));
        if (cfg.customPath && fs.existsSync(cfg.customPath)) {
          customPath = cfg.customPath;
          activeId = path.basename(customPath);
        } else if (cfg.activeId) {
          activeId = cfg.activeId;
        }
      } catch (e) {}
    }

    const projectDir = customPath || path.join(PROJECTS_DIR, activeId);
    if (!fs.existsSync(projectDir)) {
      return this._readProjectMeta(path.join(PROJECTS_DIR, "crime_chronicles"), "crime_chronicles", false);
    }

    return this._readProjectMeta(projectDir, activeId, !!customPath);
  }

  setActiveProject(idOrPath) {
    if (!idOrPath) throw new Error("Project ID or Path is required");

    let isPath = fs.existsSync(idOrPath) && fs.statSync(idOrPath).isDirectory();
    let config = { activeId: null, customPath: null };

    if (isPath) {
      config.customPath = path.resolve(idOrPath);
      config.activeId = path.basename(config.customPath);
      this._addRecentProject(config.customPath);
    } else {
      const targetDir = path.join(PROJECTS_DIR, idOrPath);
      if (!fs.existsSync(targetDir)) {
        throw new Error(`Project directory not found: ${idOrPath}`);
      }
      config.activeId = idOrPath;
      config.customPath = null;
    }

    fs.writeFileSync(ACTIVE_CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
    return this.getActiveProjectInfo();
  }

  _addRecentProject(extPath) {
    let recents = [];
    if (fs.existsSync(RECENT_FILE)) {
      try { recents = JSON.parse(fs.readFileSync(RECENT_FILE, "utf8")) || []; } catch (e) {}
    }
    recents = recents.filter(p => p !== extPath);
    recents.unshift(extPath);
    if (recents.length > 10) recents = recents.slice(0, 10);
    fs.writeFileSync(RECENT_FILE, JSON.stringify(recents, null, 2), "utf8");
  }

  deleteProject(idOrPath) {
    if (!idOrPath) throw new Error("Project ID or Path is required");
    let targetDir = null;
    let isExternal = false;

    if (fs.existsSync(idOrPath) && fs.statSync(idOrPath).isDirectory()) {
      targetDir = path.resolve(idOrPath);
      isExternal = true;
    } else {
      targetDir = path.resolve(PROJECTS_DIR, idOrPath);
    }

    if (!fs.existsSync(targetDir)) {
      throw new Error(`Project not found: ${idOrPath}`);
    }

    // Protect against deleting outside projects/ or safety limit
    const allProjects = this.listProjects();
    if (allProjects.length <= 1) {
      throw new Error("Cannot delete the only remaining channel in your workspace.");
    }

    const active = this.getActiveProjectInfo();
    const isCurrentActive = active && (active.path === targetDir || active.id === idOrPath);

    if (isExternal) {
      if (fs.existsSync(RECENT_FILE)) {
        try {
          let recents = JSON.parse(fs.readFileSync(RECENT_FILE, "utf8")) || [];
          recents = recents.filter(p => path.resolve(p) !== targetDir);
          fs.writeFileSync(RECENT_FILE, JSON.stringify(recents, null, 2), "utf8");
        } catch (e) {}
      }
    } else {
      // Must be safely inside PROJECTS_DIR
      if (!targetDir.startsWith(path.resolve(PROJECTS_DIR))) {
        throw new Error("Cannot delete directory outside the workspace projects folder.");
      }
      fs.rmSync(targetDir, { recursive: true, force: true });
    }

    // Switch active if deleted project was active
    let newActive = active;
    if (isCurrentActive) {
      const remaining = this.listProjects();
      if (remaining.length > 0) {
        newActive = this.setActiveProject(remaining[0].path || remaining[0].id);
      }
    }

    return {
      success: true,
      deleted: idOrPath,
      active: newActive,
      projects: this.listProjects()
    };
  }

  createProject({
    name,
    slug,
    templateId,
    description,
    tag,
    visualPipeline,
    customPrompt,
    defaultStylePrompt,
    speakerMode,
    hostVoice,
    voiceProfile,
    scriptFormula,
    narratorMode,
    audioProfile
  }) {
    if (!name) throw new Error("Project name is required");
    const safeSlug = (slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "_")).replace(/^_+|_+$/g, "");
    const targetDir = path.join(PROJECTS_DIR, safeSlug);

    if (fs.existsSync(targetDir)) {
      throw new Error(`Project '${safeSlug}' already exists.`);
    }

    // Load base template
    let template = {
      name,
      category: "custom",
      tag: tag || "CUSTOM",
      description: description || "Custom YGMotion channel project",
      visualPipeline: visualPipeline || "custom",
      defaultStylePrompt: customPrompt || defaultStylePrompt || "Cinematic 8k photograph, dramatic lighting, high quality",
      speakerMode: speakerMode || "solo_narrator",
      narratorMode: narratorMode || "voiceover_only",
      voiceProfile: voiceProfile || { voiceId: "CUSTOM_VOICE", voiceName: "Custom Solo Narrator", pacing: "moderate", tone: "Engaging" },
      scriptFormula: scriptFormula || { structureName: "Custom Blueprint", instructions: "Engaging hook and narrative flow" },
      audioProfile: audioProfile || { bgmDuckDb: -16, sfxLevelDb: -10, karaokeGlowColor: "#ffaa00" },
      defaultCharacters: []
    };

    if (templateId) {
      let tPath = path.join(TEMPLATES_DIR, `${templateId}_template.json`);
      if (!fs.existsSync(tPath)) {
        const allTpls = this.listTemplates();
        const found = allTpls.find(t => t.id === templateId || t.category === templateId || templateId.includes(t.id) || t.id.includes(templateId.split('_')[0]));
        if (found) {
          template = { ...template, ...found };
        }
      } else {
        try {
          const tData = JSON.parse(fs.readFileSync(tPath, "utf8"));
          template = { ...template, ...tData };
        } catch (e) {}
      }
    }

    // Create directories
    fs.mkdirSync(path.join(targetDir, "channel_assets", "style"), { recursive: true });
    fs.mkdirSync(path.join(targetDir, "channel_assets", "characters"), { recursive: true });
    fs.mkdirSync(path.join(targetDir, "channel_assets", "audio"), { recursive: true });
    fs.mkdirSync(path.join(targetDir, "episodes", "EP001"), { recursive: true });

    const finalSpeakerMode = speakerMode || template.speakerMode || "solo_narrator";

    // Profile
    const profile = {
      id: safeSlug,
      name,
      category: template.category || templateId || "custom",
      tag: tag || template.tag || "CHANNEL",
      description: description || template.description || "YGMotion Video Production Workspace",
      visualPipeline: visualPipeline || template.visualPipeline || "realistic_cinematic",
      colorPalette: template.colorPalette || { primary: "#00f0ff", background: "#0b0c10" },
      defaultStylePrompt: customPrompt || defaultStylePrompt || template.defaultStylePrompt,
      speakerMode: finalSpeakerMode,
      narratorMode: narratorMode || template.narratorMode || "voiceover_only",
      voiceProfile: voiceProfile || template.voiceProfile || {
        voiceId: (template.voiceProfile && template.voiceProfile.voiceId) || "DEFAULT_VOICE",
        voiceName: name + " Narrator",
        pacing: "moderate",
        tone: "Dynamic"
      },
      hostVoice: finalSpeakerMode === "host_and_guest" ? (hostVoice || template.hostVoice || { voiceId: "HOST_V1", voiceName: "Host Anchor" }) : null,
      scriptFormula: scriptFormula || template.scriptFormula || {
        structureName: "Standard Narrative",
        instructions: "Classic storytelling structure"
      },
      audioProfile: audioProfile || template.audioProfile || { bgmDuckDb: -16, sfxLevelDb: -10, karaokeGlowColor: "#00f0ff" },
      createdAt: new Date().toISOString()
    };
    fs.writeFileSync(path.join(targetDir, "channel_profile.json"), JSON.stringify(profile, null, 2), "utf8");

    // Generate Niche-Specific Starter Script
    let starterScriptText = "";
    if (template.category === "ranks_pov") {
      starterScriptText = `# EP001 Master Script: Level 1: The Underground Protocol
**Episode ID:** EP001  
**Category:** @Ranks First-Person POV Progression  
**Speaker Structure:** Solo Narrator (Single Master Voiceover)  
**Voice Persona:** ${profile.voiceProfile.voiceName} (\`${profile.voiceProfile.voiceId}\`)  
**Pacing:** ${profile.voiceProfile.pacing}  
**Narrator Mode:** First-Person POV HUD (No onscreen host)  

---

## Part 1: The Underdog Hook (0:00 – 0:30)
\`\`\`text
Level 1: You have zero rank, no connections, and a burner phone with a single unread notification. The rule of this game is simple: survive the climb, or vanish without a trace.
\`\`\`
`;
    } else if (template.category === "stickman_animation") {
      starterScriptText = `# EP001 Master Script: The Worst Mistake of My Entire Life
**Episode ID:** EP001  
**Category:** Stickman 2D Narrative Animation  
**Voice Persona:** ${profile.voiceProfile.voiceName} (\`${profile.voiceProfile.voiceId}\`)  
**Pacing:** ${profile.voiceProfile.pacing}  
**Narrator Mode:** 2D Animated Stick Avatar  

---

## Part 1: The Absurd Hook (0:00 – 0:25)
\`\`\`text
Look, I consider myself a relatively rational human being. But yesterday at 3:14 PM, I made a decision so catastrophic that it violated three laws of physics and common sense.
\`\`\`
`;
    } else if (template.category === "visual_documentary") {
      starterScriptText = `# EP001 Master Script: The Ghost Corporation of Zurich
**Episode ID:** EP001  
**Category:** Deep Script-Specific Documentary  
**Voice Persona:** ${profile.voiceProfile.voiceName} (\`${profile.voiceProfile.voiceId}\`)  
**Pacing:** ${profile.voiceProfile.pacing}  
**Narrator Mode:** Faceless Forensic Voiceover + Archival Motion  

---

## Part 1: The Paradox (0:00 – 0:35)
\`\`\`text
On March 14th, 2011, thirty-eight million dollars vanished from an offshore account in Zurich. There was no alarm, no break-in, and officially... the corporation holding it never existed.
\`\`\`
`;
    } else if (template.category === "crime_suspense") {
      starterScriptText = `# EP001 Master Script: The Cop Was About to Search My Car
**Episode ID:** EP001  
**Category:** True Crime & Midnight Suspense  
**Voice Persona:** ${profile.voiceProfile.voiceName} (\`${profile.voiceProfile.voiceId}\`)  
**Pacing:** ${profile.voiceProfile.pacing}  
**Narrator Mode:** Shadow Anchor & In-Car Tension  

---

## Part 1: The Red Lights (0:00 – 0:30)
\`\`\`text
The red and blue flashers were blinding in my rearview mirror. My hands were shaking against the steering wheel, and in the passenger seat... Chris hadn't said a word in twenty miles.
\`\`\`
`;
    } else {
      starterScriptText = `# EP001 Master Script: Welcome to ${name}
**Episode ID:** EP001  
**Category:** Custom Storytelling Channel  
**Voice Persona:** ${profile.voiceProfile.voiceName} (\`${profile.voiceProfile.voiceId}\`)  
**Pacing:** ${profile.voiceProfile.pacing}  
**Narrator Mode:** ${profile.narratorMode}  

---

## Part 1: The Hook (0:00 – 0:30)
\`\`\`text
Welcome to ${name}. Pay close attention to what happens next, because everything you thought you knew is about to change.
\`\`\`
`;
    }

    fs.writeFileSync(path.join(targetDir, "episodes", "EP001", "script_master.md"), starterScriptText, "utf8");

    const starterManifest = {
      episodeId: "EP001",
      style: template.category || "custom",
      visualPipeline: profile.visualPipeline,
      defaultStylePrompt: profile.defaultStylePrompt,
      shots: [
        {
          shotId: "shot_001",
          partId: 1,
          duration: 5.5,
          text: `Welcome to ${name}. Starting episode 1.`,
          visualPrompt: `${profile.defaultStylePrompt}, cinematic opening scene for ${name}`,
          visualType: "ai_consistent",
          characterId: template.defaultCharacters && template.defaultCharacters[0] ? template.defaultCharacters[0].id : null,
          dnaLocked: true
        }
      ]
    };
    fs.writeFileSync(path.join(targetDir, "episodes", "EP001", "footage_manifest.json"), JSON.stringify(starterManifest, null, 2), "utf8");

    // Copy starter characters if any
    if (template.defaultCharacters && template.defaultCharacters.length > 0) {
      for (const char of template.defaultCharacters) {
        const charDir = path.join(targetDir, "channel_assets", "characters", char.id);
        fs.mkdirSync(charDir, { recursive: true });
        fs.writeFileSync(path.join(charDir, "character_dna.json"), JSON.stringify(char, null, 2), "utf8");
      }
    }

    // Set as active
    this.setActiveProject(safeSlug);
    return this.getActiveProjectInfo();
  }

  openExternalFolder(folderPath) {
    if (!folderPath || !fs.existsSync(folderPath)) {
      throw new Error(`Directory does not exist: ${folderPath}`);
    }
    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${folderPath}`);
    }

    const resolved = path.resolve(folderPath);
    // Ensure essential folders exist
    const epDir = path.join(resolved, "episodes");
    const assetDir = path.join(resolved, "channel_assets");
    if (!fs.existsSync(epDir)) fs.mkdirSync(epDir, { recursive: true });
    if (!fs.existsSync(assetDir)) fs.mkdirSync(assetDir, { recursive: true });

    const profileFile = path.join(resolved, "channel_profile.json");
    if (!fs.existsSync(profileFile)) {
      const defaultProfile = {
        id: path.basename(resolved),
        name: path.basename(resolved).replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
        category: "custom",
        tag: "EXTERNAL",
        description: "External YGMotion channel workspace",
        createdAt: new Date().toISOString()
      };
      fs.writeFileSync(profileFile, JSON.stringify(defaultProfile, null, 2), "utf8");
    }

    this.setActiveProject(resolved);
    return this.getActiveProjectInfo();
  }

  resolveEpisodeDir(episodeId = "EP001", projectOverride = null) {
    let base = projectOverride;
    if (!base) {
      const active = this.getActiveProjectInfo();
      base = active ? active.path : path.join(PROJECTS_DIR, "crime_chronicles");
    }
    const epPath = path.join(base, "episodes", episodeId);
    if (fs.existsSync(epPath)) return epPath;

    if (fs.existsSync(base) && path.basename(base).startsWith("EP")) return base;

    const rootEp = path.join(ROOT_DIR, "episodes", episodeId);
    if (fs.existsSync(rootEp)) return rootEp;

    if (!fs.existsSync(epPath)) fs.mkdirSync(epPath, { recursive: true });
    return epPath;
  }

  resolveAssetsDir(projectOverride = null) {
    let base = projectOverride;
    if (!base) {
      const active = this.getActiveProjectInfo();
      base = active ? active.path : path.join(PROJECTS_DIR, "crime_chronicles");
    }
    const assetPath = path.join(base, "channel_assets");
    if (!fs.existsSync(assetPath)) fs.mkdirSync(assetPath, { recursive: true });
    return assetPath;
  }
}

module.exports = new ProjectManager();

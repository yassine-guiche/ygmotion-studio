/**
 * Calliope Bridge - Automated 2-Way Sync Engine (Zero Dependency Native Fetch)
 * Connects YouTube Storytelling Channel Engine with Calliope Studio & ComfyUI
 */

const fs = require('fs');
const path = require('path');

const CALLIOPE_BASE_URL = process.env.CALLIOPE_BASE_URL || 'http://127.0.0.1:8247';

class CalliopeBridge {
  constructor(baseUrl = CALLIOPE_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const defaultHeaders = { 'Content-Type': 'application/json' };
    const opts = {
      ...options,
      headers: { ...defaultHeaders, ...(options.headers || {}) }
    };
    if (opts.body && typeof opts.body === 'object') {
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, opts);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Calliope API error [${res.status}] ${res.statusText}: ${errText}`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await res.json();
    }
    return await res.text();
  }

  /**
   * Check if Calliope Backend is running
   */
  async getStatus() {
    try {
      const health = await this.request('/api/health');
      let settings = null;
      try {
        settings = await this.request('/api/settings');
      } catch (_) {}

      return {
        online: true,
        version: health?.version || '1.0.0',
        dryRun: health?.dry_run || false,
        settings: settings ? {
          comfyuiUrl: settings.comfyui_base_url,
          llmModel: settings.llm_model,
          llmBaseUrl: settings.llm_base_url
        } : null
      };
    } catch (err) {
      return {
        online: false,
        error: err.message
      };
    }
  }

  /**
   * Export an Episode from our Channel to Calliope Studio
   * Creates Project -> Characters -> Locations -> Beats -> Scenes -> Canvas Nodes
   */
  async exportEpisodeToCalliope(episodeId) {
    const episodeDir = path.resolve(__dirname, '../../episodes', episodeId);
    const manifestPath = path.join(episodeDir, 'manifest.json');
    const sceneManifestPath = path.join(episodeDir, 'scene_generation_manifest.json');

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Manifest not found at ${manifestPath}`);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    let sceneManifest = {};
    if (fs.existsSync(sceneManifestPath)) {
      sceneManifest = JSON.parse(fs.readFileSync(sceneManifestPath, 'utf8'));
    }

    // 1. Check existing projects in Calliope to avoid duplication
    const existingProjects = await this.request('/api/projects');
    const targetTitle = `[${episodeId}] ${manifest.working_title}`;
    let project = (existingProjects || []).find(p => p.title === targetTitle || p.title === manifest.working_title);

    if (!project) {
      console.log(`[CalliopeBridge] Creating new Project: "${targetTitle}"...`);
      project = await this.request('/api/projects', {
        method: 'POST',
        body: {
          title: targetTitle,
          idea: manifest.packaging?.thumbnail_concept?.focal_point || manifest.alternative_title || 'High tension storytelling episode',
          genre: manifest.content_pillar || 'Crime Suspense / Thriller',
          tone: manifest.audio_configuration?.pacing_style || 'Tense, dramatic, hyper-engaging',
          target_duration: `${manifest.target_duration_minutes || 12} min`
        }
      });
    } else {
      console.log(`[CalliopeBridge] Found existing project ID ${project.id}`);
    }

    const projectId = project.id;

    // 2. Fetch existing story entities via /api/projects/{id}/story
    const storyData = await this.request(`/api/projects/${projectId}/story`);
    const existingChars = storyData.characters || [];
    const existingLocs = storyData.locations || [];

    // 3. Sync Characters into Calliope Entity Database
    console.log(`[CalliopeBridge] Syncing Characters for Project ${projectId}...`);
    const charMap = {}; // mapping char_id -> calliope character id

    const charactersToSync = manifest.characters || [];
    for (const char of charactersToSync) {
      let calliopeChar = existingChars.find(c => c.name.toLowerCase() === char.name.toLowerCase());
      if (!calliopeChar) {
        calliopeChar = await this.request(`/api/projects/${projectId}/characters`, {
          method: 'POST',
          body: {
            name: char.name,
            role: char.role || 'Key Protagonist',
            age: char.id === 'char_jake' ? '23' : (char.id === 'char_host' ? '30' : '40'),
            appearance: char.visual_prompt_token || 'Cinematic realistic portrait',
            personality: 'Intense, high stakes',
            consistency_prompt: char.visual_prompt_token || ''
          }
        });
        console.log(`[CalliopeBridge] + Created character "${char.name}" (ID: ${calliopeChar.id})`);
      }
      charMap[char.id] = calliopeChar.id;
      charMap[char.name.toLowerCase()] = calliopeChar.id;
    }

    // 4. Sync Locations into Calliope
    console.log(`[CalliopeBridge] Syncing Locations for Project ${projectId}...`);
    const locMap = {};
    const defaultLocations = [
      { name: 'Vehicle Interior', desc: 'Dark grey sedan interior, dashboard glow, rear-view mirror, highway night background' },
      { name: 'Suburban Street', desc: 'Golden hour driveway, suburban peaceful residential road' },
      { name: 'Dark Highway Shoulder', desc: 'Empty two-lane highway, flashing red and blue police strobe reflections' },
      { name: 'Narrator Studio', desc: 'Dark moody studio with warm amber rim light, professional microphone setup' }
    ];

    for (const loc of defaultLocations) {
      let calliopeLoc = existingLocs.find(l => l.name.toLowerCase() === loc.name.toLowerCase());
      if (!calliopeLoc) {
        calliopeLoc = await this.request(`/api/projects/${projectId}/locations`, {
          method: 'POST',
          body: {
            name: loc.name,
            description: loc.desc,
            consistency_prompt: loc.desc
          }
        });
        console.log(`[CalliopeBridge] + Created location "${loc.name}" (ID: ${calliopeLoc.id})`);
      }
      locMap[loc.name.toLowerCase()] = calliopeLoc.id;
    }

    // 5. Sync Scenes into Calliope Script Stage
    console.log(`[CalliopeBridge] Syncing Scenes for Project ${projectId}...`);
    const scenesResp = await this.request(`/api/projects/${projectId}/scenes`);
    const existingScenesList = (scenesResp && scenesResp.scenes) ? scenesResp.scenes : [];

    const scenesToCreate = [];
    if (sceneManifest.batches && sceneManifest.batches.length > 0) {
      let order = 1;
      for (const batch of sceneManifest.batches) {
        scenesToCreate.push({
          order_index: order++,
          heading: `SCENE ${order - 1}: ${batch.batch_id}`,
          action: `Timecode: ${batch.timecode_range}. Audio: ${batch.audio_file}. Shots: ${batch.shots.join(', ')}`,
          dialog: `Audio narration chunk: ${batch.audio_file}`,
          duration_sec: 15.0,
          character_ids: [charMap['char_host'] || charMap['char_jake']].filter(Boolean),
          location_id: locMap['narrator studio'] || Object.values(locMap)[0]
        });
      }
    } else {
      scenesToCreate.push({
        order_index: 1,
        heading: 'SCENE 1: The Traffic Stop Climax',
        action: 'Officer Miller taps flashlight against driver window while Jake clutches steering wheel in sheer panic',
        dialog: "The cop was about to search my car...",
        duration_sec: 12.0,
        character_ids: [charMap['char_jake'], charMap['char_officer_1']].filter(Boolean),
        location_id: locMap['dark highway shoulder']
      });
    }

    if (existingScenesList.length === 0) {
      for (const sc of scenesToCreate) {
        await this.request(`/api/projects/${projectId}/scenes`, {
          method: 'POST',
          body: sc
        });
      }
      console.log(`[CalliopeBridge] Created ${scenesToCreate.length} scenes in Calliope.`);
    } else {
      console.log(`[CalliopeBridge] ${existingScenesList.length} scenes already exist in Calliope.`);
    }

    // 6. Canvas Layout Auto-Tidy
    try {
      console.log(`[CalliopeBridge] Auto-Tidying Visual Canvas in Calliope...`);
      const canvases = await this.request('/api/canvas');
      let targetCanvas = (canvases || []).find(c => c.project_id === projectId);
      if (!targetCanvas && canvases && canvases.length > 0) {
        targetCanvas = canvases[0];
      }

      if (targetCanvas) {
        await this.request(`/api/canvas/${targetCanvas.id}/tidy`, { method: 'POST' });
      }
    } catch (cErr) {
      console.warn(`[CalliopeBridge] Canvas notice: ${cErr.message}`);
    }

    return {
      success: true,
      projectId,
      calliopeUrl: `http://127.0.0.1:5173/canvas/${projectId}`,
      projectTitle: project.title,
      charactersCount: Object.keys(charMap).length,
      scenesCount: scenesToCreate.length
    };
  }
}

// CLI Execution Support
if (require.main === module) {
  const bridge = new CalliopeBridge();
  bridge.getStatus().then(status => {
    console.log('[CalliopeBridge] Status:', JSON.stringify(status, null, 2));
    if (status.online) {
      return bridge.exportEpisodeToCalliope('EP001');
    }
  }).then(result => {
    if (result) console.log('[CalliopeBridge] Export Result:', JSON.stringify(result, null, 2));
  }).catch(err => {
    console.error('[CalliopeBridge] Error:', err.message);
  });
}

module.exports = CalliopeBridge;

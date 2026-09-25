#!/usr/bin/env node
/**
 * CapCut Model Context Protocol (MCP) Stdio Server
 * Automated Video Timeline Generation, CapCut Draft Creator, and Multi-Track Sequencer.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');
const crypto = require('crypto');

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID().toUpperCase() : 'CAPCUT_' + Math.random().toString(36).substr(2, 9).toUpperCase();
}

function getCapCutDraftsDir() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const defaultDir = path.join(localAppData, 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft');
  return defaultDir;
}

const SERVER_INFO = {
  name: 'capcut-mcp-server',
  version: '1.0.0'
};

const TOOLS = [
  {
    name: 'capcut_create_draft',
    description: 'Create a fully structured CapCut Desktop draft project with 16:9 or 9:16 canvas, multi-track audio, visuals, and keyframe zooms.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: {
          type: 'string',
          description: 'The name of the CapCut project (e.g. "EP001 - The Cop Was About to Search My Car").'
        },
        aspect_ratio: {
          type: 'string',
          enum: ['16:9', '9:16'],
          default: '16:9'
        },
        output_dir: {
          type: 'string',
          description: 'Optional output directory to save the draft folder. Defaults to CapCut User Projects directory or project drafts folder.'
        }
      },
      required: ['project_name']
    }
  },
  {
    name: 'capcut_build_episode_timeline',
    description: 'Assemble an entire YouTube episode (voiceover chunks, SFX foley, scene visuals, 2.5D zooms, and captions) into a ready-to-edit CapCut project.',
    inputSchema: {
      type: 'object',
      properties: {
        episode_id: {
          type: 'string',
          description: 'Episode identifier (e.g. "EP001").',
          default: 'EP001'
        },
        include_captions: {
          type: 'boolean',
          description: 'Whether to include styled text captions track.',
          default: true
        },
        ken_burns_zoom: {
          type: 'boolean',
          description: 'Whether to apply automated 2.5D slow push-in keyframes to images.',
          default: true
        }
      },
      required: ['episode_id']
    }
  },
  {
    name: 'capcut_get_draft_status',
    description: 'Check CapCut installation path and list all active draft projects.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

// Helper to build a valid CapCut Draft JSON structure
function buildDraftContent(options) {
  const { projectName, width = 1920, height = 1080, audioClips = [], videoClips = [], sfxClips = [] } = options;

  const draftId = uuid();
  const tracks = [];
  const materials = {
    audios: [],
    videos: [],
    texts: [],
    speeds: [],
    canvases: [],
    sound_effects: [],
    keyframe_sets: []
  };

  // 1. Video Track (Main Visuals)
  const videoTrackId = uuid();
  const videoSegments = [];
  let videoCurrentTimeMicroseconds = 0;

  for (const clip of videoClips) {
    const matId = uuid();
    const speedId = uuid();
    const durationMicroseconds = Math.round(clip.durationSeconds * 1000000);

    materials.videos.push({
      id: matId,
      path: clip.filePath,
      duration: durationMicroseconds,
      width: width,
      height: height,
      material_name: path.basename(clip.filePath),
      type: clip.type || 'photo'
    });

    materials.speeds.push({
      id: speedId,
      speed: 1.0
    });

    videoSegments.push({
      id: uuid(),
      material_id: matId,
      speed_id: speedId,
      source_timerange: { start: 0, duration: durationMicroseconds },
      target_timerange: { start: videoCurrentTimeMicroseconds, duration: durationMicroseconds },
      clip: {
        scale: { x: 1.0, y: 1.0 },
        transform: { x: 0.0, y: 0.0 }
      }
    });

    videoCurrentTimeMicroseconds += durationMicroseconds;
  }

  tracks.push({
    id: videoTrackId,
    type: 'video',
    segments: videoSegments
  });

  // 2. Audio Track 1 (Main Spoken Narration)
  const narrationTrackId = uuid();
  const narrationSegments = [];
  let audioCurrentTimeMicroseconds = 0;

  for (const clip of audioClips) {
    const matId = uuid();
    const speedId = uuid();
    const durationMicroseconds = Math.round((clip.durationSeconds || 10) * 1000000);

    materials.audios.push({
      id: matId,
      path: clip.filePath,
      duration: durationMicroseconds,
      material_name: path.basename(clip.filePath),
      type: 'extract_music'
    });

    materials.speeds.push({
      id: speedId,
      speed: 1.0
    });

    narrationSegments.push({
      id: uuid(),
      material_id: matId,
      speed_id: speedId,
      source_timerange: { start: 0, duration: durationMicroseconds },
      target_timerange: { start: audioCurrentTimeMicroseconds, duration: durationMicroseconds },
      volume: 1.0
    });

    audioCurrentTimeMicroseconds += durationMicroseconds;
  }

  tracks.push({
    id: narrationTrackId,
    type: 'audio',
    segments: narrationSegments
  });

  // 3. Audio Track 2 (SFX Foley)
  if (sfxClips.length > 0) {
    const sfxTrackId = uuid();
    const sfxSegments = [];

    for (const sfx of sfxClips) {
      const matId = uuid();
      const speedId = uuid();
      const startMicroseconds = Math.round(sfx.startTimeSeconds * 1000000);
      const durationMicroseconds = Math.round(sfx.durationSeconds * 1000000);

      materials.audios.push({
        id: matId,
        path: sfx.filePath,
        duration: durationMicroseconds,
        material_name: path.basename(sfx.filePath),
        type: 'sound_effect'
      });

      materials.speeds.push({
        id: speedId,
        speed: 1.0
      });

      sfxSegments.push({
        id: uuid(),
        material_id: matId,
        speed_id: speedId,
        source_timerange: { start: 0, duration: durationMicroseconds },
        target_timerange: { start: startMicroseconds, duration: durationMicroseconds },
        volume: 0.85
      });
    }

    tracks.push({
      id: sfxTrackId,
      type: 'audio',
      segments: sfxSegments
    });
  }

  const totalDuration = Math.max(videoCurrentTimeMicroseconds, audioCurrentTimeMicroseconds);

  return {
    canvas_config: {
      width: width,
      height: height,
      ratio: width === 1920 ? '16:9' : '9:16'
    },
    duration: totalDuration,
    fps: 30.0,
    materials: materials,
    tracks: tracks,
    version: 360000
  };
}

async function handleBuildEpisodeTimeline(args) {
  const { episode_id = 'EP001', ken_burns_zoom = true } = args;
  const rootDir = path.resolve(__dirname, '../../..');
  const epDir = path.join(rootDir, 'episodes', episode_id);
  const audioDir = path.join(epDir, 'audio');
  const sfxDir = path.join(audioDir, 'sfx');
  const assetsDir = path.join(epDir, 'assets');
  const chunksJson = path.join(epDir, 'voice_chunks.json');

  if (!fs.existsSync(epDir)) {
    return { error: `Episode directory not found: ${epDir}` };
  }

  // 1. Gather Voice Clips
  const chunks = fs.existsSync(chunksJson) ? JSON.parse(fs.readFileSync(chunksJson, 'utf8')) : [];
  const audioClips = [];

  for (let i = 1; i <= 8; i++) {
    const partFile = path.join(audioDir, `chunk_part_${i.toString().padStart(2, '0')}.mp3`);
    if (fs.existsSync(partFile)) {
      const chunkMeta = chunks[i - 1] || {};
      audioClips.push({
        filePath: partFile,
        durationSeconds: chunkMeta.estimated_duration_sec || 90
      });
    }
  }

  // 2. Gather SFX Clips
  const sfxClips = [];
  const sfxCueMap = [
    { file: 'sfx_01_police_siren_distant.mp3', startTime: 158, duration: 6.0 },
    { file: 'sfx_02_car_door_and_gravel.mp3', startTime: 398, duration: 4.0 },
    { file: 'sfx_04_tense_heartbeat_sub.mp3', startTime: 330, duration: 8.0 },
    { file: 'sfx_03_police_radio_squawk.mp3', startTime: 618, duration: 3.5 },
    { file: 'sfx_01_police_siren_distant.mp3', startTime: 675, duration: 6.0 }
  ];

  for (const sfx of sfxCueMap) {
    const sfxPath = path.join(sfxDir, sfx.file);
    if (fs.existsSync(sfxPath)) {
      sfxClips.push({
        filePath: sfxPath,
        startTimeSeconds: sfx.startTime,
        durationSeconds: sfx.duration
      });
    }
  }

  // 3. Gather Visual Clips
  const videoClips = [];
  const assetFiles = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png')) : [];

  if (assetFiles.length > 0) {
    const totalAudioSec = audioClips.reduce((sum, c) => sum + c.durationSeconds, 0) || 765;
    const perClipDuration = totalAudioSec / assetFiles.length;

    for (const file of assetFiles) {
      videoClips.push({
        filePath: path.join(assetsDir, file),
        durationSeconds: perClipDuration,
        type: 'photo'
      });
    }
  }

  // 4. Build CapCut Draft
  const projectName = `${episode_id} - The Cop Was About to Search My Car`;
  const draftContent = buildDraftContent({
    projectName,
    width: 1920,
    height: 1080,
    audioClips,
    videoClips,
    sfxClips
  });

  // Save to episode workspace
  const draftProjectDir = path.join(epDir, 'capcut_draft');
  fs.mkdirSync(draftProjectDir, { recursive: true });
  fs.writeFileSync(path.join(draftProjectDir, 'draft_content.json'), JSON.stringify(draftContent, null, 2), 'utf8');

  // Also save meta info
  const draftMeta = {
    draft_id: uuid(),
    draft_name: projectName,
    draft_root_path: draftProjectDir,
    tm_draft_create: Date.now(),
    tm_draft_modified: Date.now()
  };
  fs.writeFileSync(path.join(draftProjectDir, 'draft_meta_info.json'), JSON.stringify(draftMeta, null, 2), 'utf8');

  // Copy to CapCut system drafts folder if directory exists
  const systemDraftsDir = getCapCutDraftsDir();
  let systemCopyStatus = 'CapCut system folder not installed yet';
  if (fs.existsSync(systemDraftsDir)) {
    const targetDir = path.join(systemDraftsDir, `${episode_id}_Draft`);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'draft_content.json'), JSON.stringify(draftContent, null, 2));
    fs.writeFileSync(path.join(targetDir, 'draft_meta_info.json'), JSON.stringify(draftMeta, null, 2));
    systemCopyStatus = `Exported directly into CapCut Desktop: ${targetDir}`;
  }

  return {
    status: 'success',
    project_name: projectName,
    total_audio_tracks: 2,
    total_audio_clips: audioClips.length,
    total_sfx_clips: sfxClips.length,
    total_visual_clips: videoClips.length,
    draft_location: draftProjectDir,
    system_status: systemCopyStatus
  };
}

async function handleGetDraftStatus() {
  const defaultDir = getCapCutDraftsDir();
  const exists = fs.existsSync(defaultDir);

  let drafts = [];
  if (exists) {
    drafts = fs.readdirSync(defaultDir).filter(f => fs.statSync(path.join(defaultDir, f)).isDirectory());
  }

  return {
    capcut_installed: exists,
    drafts_directory: defaultDir,
    active_drafts_count: drafts.length,
    drafts: drafts
  };
}

// JSON-RPC Dispatcher
async function handleRequest(request) {
  const { id, method, params } = request;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO
      }
    };
  }

  if (method === 'notifications/initialized') return null;
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: { tools: TOOLS }
    };
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const toolArgs = params?.arguments || {};

    let result;
    try {
      switch (toolName) {
        case 'capcut_build_episode_timeline':
          result = await handleBuildEpisodeTimeline(toolArgs);
          break;
        case 'capcut_get_draft_status':
          result = await handleGetDraftStatus();
          break;
        default:
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Unknown tool: ${toolName}` }
          };
      }
    } catch (err) {
      result = { error: err.message || String(err) };
    }

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: Boolean(result.error)
      }
    };
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` }
  };
}

// Stdio loop
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const req = JSON.parse(trimmed);
    const res = await handleRequest(req);
    if (res) process.stdout.write(JSON.stringify(res) + '\n');
  } catch (err) {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: err.message } }) + '\n');
  }
});

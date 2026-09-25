/**
 * Populate CapCut Project 0903 with ALL 8 Episode Parts, Full Audio & Watermark-Free Host Video
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function uuid() {
  return crypto.randomUUID().toUpperCase();
}

function getMp3DurationMicro(filePath) {
  // Use binary MPEG frame header scanning for microsecond precision
  const buffer = fs.readFileSync(filePath);
  let offset = 0;
  if (buffer.toString('ascii', 0, 3) === 'ID3') {
    const size = ((buffer[6] & 0x7f) << 21) |
                 ((buffer[7] & 0x7f) << 14) |
                 ((buffer[8] & 0x7f) << 7) |
                 (buffer[9] & 0x7f);
    offset = 10 + size;
  }

  const bitrates = [
    [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
  ];
  const sampleRates = [
    [44100, 48000, 32000],
    [22050, 24000, 16000],
    [11025, 12000, 8000]
  ];

  let totalSamples = 0;
  let sampleRate = 44100;

  while (offset < buffer.length - 4) {
    if (buffer[offset] === 0xFF && (buffer[offset + 1] & 0xE0) === 0xE0) {
      const b1 = buffer[offset + 1];
      const b2 = buffer[offset + 2];
      const versionIdx = (b1 >> 3) & 0x03;
      const layerIdx = (b1 >> 1) & 0x03;
      const bitrateIdx = (b2 >> 4) & 0x0F;
      const sRateIdx = (b2 >> 2) & 0x03;
      const padding = (b2 >> 1) & 0x01;

      if (versionIdx !== 1 && layerIdx === 1 && bitrateIdx > 0 && bitrateIdx < 15 && sRateIdx < 3) {
        const v = versionIdx === 3 ? 0 : (versionIdx === 2 ? 1 : 2);
        const l = 3 - layerIdx;
        const br = bitrates[l][bitrateIdx] * 1000;
        const sr = sampleRates[v][sRateIdx];
        sampleRate = sr;

        const frameSize = Math.floor((144 * br) / sr) + padding;
        if (frameSize > 0 && offset + frameSize <= buffer.length) {
          totalSamples += 1152;
          offset += frameSize;
          continue;
        }
      }
    }
    offset++;
  }

  return Math.round((totalSamples / sampleRate) * 1000000);
}

function assembleAllParts() {
  const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\MSI\\AppData\\Local';
  const draftRoot = path.join(localAppData, 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft');
  const projectDir = path.join(draftRoot, '0903');

  if (!fs.existsSync(projectDir)) {
    console.error('[ERROR] Project 0903 folder does not exist:', projectDir);
    return;
  }

  const rootDir = path.resolve(__dirname, '../..');
  const epDir = path.join(rootDir, 'episodes', 'EP001');
  const audioDir = path.join(epDir, 'audio');
  const assetsDir = path.join(epDir, 'assets');
  const sfxDir = path.join(audioDir, 'sfx');

  // Load existing native 0903 content to preserve device platform IDs
  const contentPath = path.join(projectDir, 'draft_content.json');
  const draftContent = JSON.parse(fs.readFileSync(contentPath, 'utf8'));

  draftContent.name = 'EP001 - The Cop Was About to Search My Car';

  // 1. Calculate precise speech chunk offsets
  const speechFiles = [
    'chunk_part_01.mp3',
    'chunk_part_02.mp3',
    'chunk_part_03.mp3',
    'chunk_part_04.mp3',
    'chunk_part_05.mp3',
    'chunk_part_06.mp3',
    'chunk_part_07.mp3',
    'chunk_part_08.mp3'
  ];

  let currentMicro = 0;
  const speechClips = [];

  speechFiles.forEach((file, idx) => {
    const fullPath = path.join(audioDir, file);
    const durMicro = getMp3DurationMicro(fullPath);
    speechClips.push({
      part: idx + 1,
      file: file,
      path: fullPath.replace(/\\/g, '/'),
      startMicro: currentMicro,
      durationMicro: durMicro
    });
    console.log(`  [PART ${idx + 1}] ${file} -> ${(durMicro / 1000000).toFixed(2)}s (starts at ${(currentMicro / 1000000).toFixed(2)}s)`);
    currentMicro += durMicro;
  });

  const totalTimelineMicro = currentMicro;
  draftContent.duration = totalTimelineMicro;
  console.log(`\nTotal Timeline Duration: ${(totalTimelineMicro / 1000000 / 60).toFixed(2)} mins (${(totalTimelineMicro / 1000000).toFixed(2)}s)`);

  // Reset materials and tracks
  draftContent.materials.videos = [];
  draftContent.materials.audios = [];
  draftContent.materials.speeds = [];
  draftContent.materials.canvases = [];

  const canvasId = uuid();
  draftContent.materials.canvases.push({ id: canvasId, type: 'canvas_color', color: '#000000', blur: 0 });

  const tracks = [];

  // ==========================================
  // TRACK 0: VIDEO TRACK (Faceless Host for Part 1 + Smoking Storyteller for Story)
  // ==========================================
  const facelessHostVideo = path.join(assetsDir, 'faceless_host_studio_loop_1080p.mp4').replace(/\\/g, '/');
  const smokingStoryVideo = path.join(assetsDir, 'storyteller_smoking_loop_1080p.mp4').replace(/\\/g, '/');

  const hostVidMatId = uuid();
  const hostVidSpeedId = uuid();
  const loopDurMicro = 8000000; // 8.0s per loop

  draftContent.materials.videos.push({
    id: hostVidMatId,
    path: facelessHostVideo,
    duration: loopDurMicro,
    width: 1920,
    height: 1080,
    material_name: 'faceless_host_studio_loop_1080p.mp4',
    type: 'video',
    has_audio: false,
    category_name: 'local',
    crop: { lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1, upper_left_x: 0, upper_left_y: 0, upper_right_x: 1, upper_right_y: 0 },
    crop_ratio: 'free',
    crop_scale: 1,
    source_platform: 0
  });

  const smokingVidMatId = uuid();
  draftContent.materials.videos.push({
    id: smokingVidMatId,
    path: smokingStoryVideo,
    duration: loopDurMicro,
    width: 1920,
    height: 1080,
    material_name: 'storyteller_smoking_loop_1080p.mp4',
    type: 'video',
    has_audio: false,
    category_name: 'local',
    crop: { lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1, upper_left_x: 0, upper_right_y: 0, upper_right_x: 1, upper_right_y: 0 },
    crop_ratio: 'free',
    crop_scale: 1,
    source_platform: 0
  });

  draftContent.materials.speeds.push({ id: hostVidSpeedId, type: 'speed', mode: 0, speed: 1.0 });
  const smokingSpeedId = uuid();
  draftContent.materials.speeds.push({ id: smokingSpeedId, type: 'speed', mode: 0, speed: 1.0 });

  const videoSegments = [];

  // A. Host Intro (Part 1 duration)
  const part1DurationMicro = speechClips[0].durationMicro;
  let hostCursor = 0;
  while (hostCursor < part1DurationMicro) {
    const chunkDur = Math.min(loopDurMicro, part1DurationMicro - hostCursor);
    videoSegments.push({
      id: uuid(),
      material_id: hostVidMatId,
      speed_id: hostVidSpeedId,
      source_timerange: { start: 0, duration: chunkDur },
      target_timerange: { start: hostCursor, duration: chunkDur },
      render_timerange: { start: 0, duration: 0 },
      clip: { scale: { x: 1.0, y: 1.0 }, transform: { x: 0.0, y: 0.0 }, rotation: 0, flip: { horizontal: false, vertical: false }, alpha: 1.0 },
      uniform_scale: { on: true, value: 1.0 },
      volume: 1.0,
      last_nonzero_volume: 1.0,
      visible: true,
      enable_adjust: true,
      enable_lut: true,
      extra_material_refs: [hostVidSpeedId, canvasId]
    });
    hostCursor += chunkDur;
  }

  // B. Storyteller Smoking Loop (Part 2 through end of timeline)
  let storyCursor = part1DurationMicro;
  while (storyCursor < totalTimelineMicro) {
    const chunkDur = Math.min(loopDurMicro, totalTimelineMicro - storyCursor);
    videoSegments.push({
      id: uuid(),
      material_id: smokingVidMatId,
      speed_id: smokingSpeedId,
      source_timerange: { start: 0, duration: chunkDur },
      target_timerange: { start: storyCursor, duration: chunkDur },
      render_timerange: { start: 0, duration: 0 },
      clip: { scale: { x: 1.0, y: 1.0 }, transform: { x: 0.0, y: 0.0 }, rotation: 0, flip: { horizontal: false, vertical: false }, alpha: 1.0 },
      uniform_scale: { on: true, value: 1.0 },
      volume: 1.0,
      last_nonzero_volume: 1.0,
      visible: true,
      enable_adjust: true,
      enable_lut: true,
      extra_material_refs: [smokingSpeedId, canvasId]
    });
    storyCursor += chunkDur;
  }

  tracks.push({
    id: uuid(),
    type: 'video',
    segments: videoSegments,
    attribute: 0,
    flag: 0
  });

  // ==========================================
  // TRACK 1: SPEECH DIALOGUE (All 8 Parts Gapless)
  // ==========================================
  const speechSegments = [];
  for (const sc of speechClips) {
    const matId = uuid();
    const speedId = uuid();

    draftContent.materials.audios.push({
      id: matId,
      path: sc.path,
      duration: sc.durationMicro,
      material_name: sc.file,
      type: 'extract_music',
      category_name: 'local',
      source_platform: 0
    });

    draftContent.materials.speeds.push({ id: speedId, type: 'speed', mode: 0, speed: 1.0 });

    speechSegments.push({
      id: uuid(),
      material_id: matId,
      speed_id: speedId,
      source_timerange: { start: 0, duration: sc.durationMicro },
      target_timerange: { start: sc.startMicro, duration: sc.durationMicro },
      render_timerange: { start: 0, duration: 0 },
      volume: 1.0,
      last_nonzero_volume: 1.0,
      visible: true,
      extra_material_refs: [speedId]
    });
  }

  tracks.push({
    id: uuid(),
    type: 'audio',
    segments: speechSegments,
    attribute: 0,
    flag: 0
  });

  // ==========================================
  // TRACK 2: FOLEY SOUND EFFECTS (7 Cues)
  // ==========================================
  const sfxClips = [
    { file: 'sfx_01_police_siren_distant.mp3', startSec: 100.0, durSec: 6.0 },
    { file: 'sfx_02_car_door_and_gravel.mp3', startSec: 155.0, durSec: 4.0 },
    { file: 'sfx_04_tense_heartbeat_sub.mp3', startSec: 220.0, durSec: 8.0 },
    { file: 'sfx_02_car_door_and_gravel.mp3', startSec: 290.0, durSec: 4.0 },
    { file: 'sfx_04_tense_heartbeat_sub.mp3', startSec: 400.0, durSec: 8.0 },
    { file: 'sfx_03_police_radio_squawk.mp3', startSec: 485.0, durSec: 3.5 },
    { file: 'sfx_01_police_siren_distant.mp3', startSec: 510.0, durSec: 6.0 }
  ];

  const sfxSegments = [];
  for (const s of sfxClips) {
    const sfxFullPath = path.join(sfxDir, s.file).replace(/\\/g, '/');
    if (fs.existsSync(path.join(sfxDir, s.file))) {
      const matId = uuid();
      const speedId = uuid();
      const startMicro = Math.round(s.startSec * 1000000);
      const durMicro = Math.round(s.durSec * 1000000);

      draftContent.materials.audios.push({
        id: matId,
        path: sfxFullPath,
        duration: durMicro,
        material_name: s.file,
        type: 'sound_effect',
        category_name: 'local',
        source_platform: 0
      });

      draftContent.materials.speeds.push({ id: speedId, type: 'speed', mode: 0, speed: 1.0 });

      sfxSegments.push({
        id: uuid(),
        material_id: matId,
        speed_id: speedId,
        source_timerange: { start: 0, duration: durMicro },
        target_timerange: { start: startMicro, duration: durMicro },
        render_timerange: { start: 0, duration: 0 },
        volume: 0.85,
        last_nonzero_volume: 0.85,
        visible: true,
        extra_material_refs: [speedId]
      });
    }
  }

  if (sfxSegments.length > 0) {
    tracks.push({
      id: uuid(),
      type: 'audio',
      segments: sfxSegments,
      attribute: 0,
      flag: 0
    });
  }

  // ==========================================
  // TRACK 3: BACKGROUND MUSIC DRONE (Ambient Loop at -16.5dB)
  // ==========================================
  const musicFile = path.join(audioDir, 'music_dark_suspense_drone.mp3');
  if (fs.existsSync(musicFile)) {
    const musicSegments = [];
    const musicDurMicro = 22000000; // 22s loop
    let musicCurrentMicro = 0;

    const musicMatId = uuid();
    const musicSpeedId = uuid();

    draftContent.materials.audios.push({
      id: musicMatId,
      path: musicFile.replace(/\\/g, '/'),
      duration: musicDurMicro,
      material_name: 'music_dark_suspense_drone.mp3',
      type: 'music',
      category_name: 'local',
      source_platform: 0
    });

    draftContent.materials.speeds.push({ id: musicSpeedId, type: 'speed', mode: 0, speed: 1.0 });

    while (musicCurrentMicro < totalTimelineMicro) {
      const segDuration = Math.min(musicDurMicro, totalTimelineMicro - musicCurrentMicro);
      musicSegments.push({
        id: uuid(),
        material_id: musicMatId,
        speed_id: musicSpeedId,
        source_timerange: { start: 0, duration: segDuration },
        target_timerange: { start: musicCurrentMicro, duration: segDuration },
        render_timerange: { start: 0, duration: 0 },
        volume: 0.15, // Ducked to -16.5 dB
        last_nonzero_volume: 0.15,
        visible: true,
        extra_material_refs: [musicSpeedId]
      });
      musicCurrentMicro += segDuration;
    }

    tracks.push({
      id: uuid(),
      type: 'audio',
      segments: musicSegments,
      attribute: 0,
      flag: 0
    });
  }

  draftContent.tracks = tracks;

  // Write draft_content.json
  fs.writeFileSync(contentPath, JSON.stringify(draftContent, null, 2), 'utf8');

  // Update draft_cover.jpg
  const coverSource = path.join(assetsDir, 'storyteller_smoking_base.jpg');
  if (fs.existsSync(coverSource)) {
    fs.copyFileSync(coverSource, path.join(projectDir, 'draft_cover.jpg'));
  }

  // Update native draft_meta_info.json
  const metaPath = path.join(projectDir, 'draft_meta_info.json');
  const draftMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  draftMeta.draft_name = '0903';
  draftMeta.tm_duration = totalTimelineMicro;
  draftMeta.tm_draft_modified = Date.now() * 1000;
  draftMeta.tm_draft_removed = 0;
  fs.writeFileSync(metaPath, JSON.stringify(draftMeta, null, 2), 'utf8');

  // Update root_meta_info.json
  const rootMetaPath = path.join(draftRoot, 'root_meta_info.json');
  const rootEntry = {
    cloud_draft_cover: false,
    cloud_draft_sync: false,
    draft_cloud_last_action_download: false,
    draft_cloud_purchase_info: '',
    draft_cloud_template_id: '',
    draft_cloud_tutorial_info: '',
    draft_cloud_videocut_purchase_info: '',
    draft_cover: path.join(projectDir, 'draft_cover.jpg').replace(/\\/g, '/'),
    draft_fold_path: projectDir.replace(/\\/g, '/'),
    draft_id: draftMeta.draft_id,
    draft_is_ai_shorts: false,
    draft_is_cloud_temp_draft: false,
    draft_is_infinite_canvas_draft: false,
    draft_is_invisible: false,
    draft_is_pippit_draft: false,
    draft_is_web_article_video: false,
    draft_json_file: path.join(projectDir, 'draft_content.json').replace(/\\/g, '/'),
    draft_name: '0903',
    draft_new_version: '',
    draft_root_path: draftRoot.replace(/\\/g, '/'),
    draft_timeline_materials_size: 70667,
    draft_type: '',
    draft_web_article_video_enter_from: '',
    pippit_avatar_url: '',
    pippit_extra_info: '',
    pippit_id: '',
    pippit_user_name: '',
    streaming_edit_draft_ready: true,
    tm_draft_cloud_completed: '',
    tm_draft_cloud_entry_id: -1,
    tm_draft_cloud_modified: 0,
    tm_draft_cloud_parent_entry_id: -1,
    tm_draft_cloud_space_id: -1,
    tm_draft_cloud_user_id: -1,
    tm_draft_create: draftMeta.tm_draft_create,
    tm_draft_modified: Date.now() * 1000,
    tm_draft_removed: 0,
    tm_duration: totalTimelineMicro
  };

  fs.writeFileSync(rootMetaPath, JSON.stringify({
    all_draft_store: [rootEntry],
    draft_ids: 1,
    root_path: draftRoot.replace(/\\/g, '/')
  }, null, 2), 'utf8');

  console.log('\n[SUCCESS] Project 0903 populated with ALL 8 parts, full audio & clean video!');
  console.log(`Total Speech Duration: ${(totalTimelineMicro / 1000000 / 60).toFixed(2)} Minutes`);
  console.log(`Narration Audio Segments: ${speechSegments.length}`);
  console.log(`Foley SFX Cues: ${sfxSegments.length}`);
  console.log(`Video Track: Part 1 Clean Watermark-Free Host Video`);
}

assembleAllParts();

/**
 * Populate Native 0903 Project with Part 1 Media
 * Preserves CapCut's native hardware signature, device_id, and mac_address.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function uuid() {
  return crypto.randomUUID().toUpperCase();
}

function populate0903() {
  const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\MSI\\AppData\\Local';
  const draftRoot = path.join(localAppData, 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft');
  const projectDir = path.join(draftRoot, '0903');

  if (!fs.existsSync(projectDir)) {
    console.error('[ERROR] Project 0903 not found:', projectDir);
    return;
  }

  const rootDir = path.resolve(__dirname, '../..');
  const epDir = path.join(rootDir, 'episodes', 'EP001');
  const audioFile = path.join(epDir, 'audio', 'chunk_part_01.mp3').replace(/\\/g, '/');
  const videoFile = path.join(epDir, 'assets', 'host_talking_intro.mp4').replace(/\\/g, '/');
  const coverFile = path.join(epDir, 'assets', 'host_studio_master_16x9.jpg');

  const durationMicro = 17528163; // 17.53 seconds

  // Read native draft_content.json to preserve platform metadata
  const contentPath = path.join(projectDir, 'draft_content.json');
  const draftContent = JSON.parse(fs.readFileSync(contentPath, 'utf8'));

  // Update Project Name and Duration
  draftContent.name = 'EP001 - Part 1 Host Intro';
  draftContent.duration = durationMicro;

  const videoMatId = uuid();
  const videoSpeedId = uuid();
  const audioMatId = uuid();
  const audioSpeedId = uuid();
  const canvasId = uuid();

  // Add Materials
  draftContent.materials.videos = [
    {
      id: videoMatId,
      path: videoFile,
      duration: durationMicro,
      width: 1920,
      height: 1080,
      material_name: 'host_talking_intro.mp4',
      type: 'video',
      has_audio: false,
      category_name: 'local',
      crop: { lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1, upper_left_x: 0, upper_left_y: 0, upper_right_x: 1, upper_right_y: 0 },
      crop_ratio: 'free',
      crop_scale: 1,
      source_platform: 0
    }
  ];

  draftContent.materials.audios = [
    {
      id: audioMatId,
      path: audioFile,
      duration: durationMicro,
      material_name: 'chunk_part_01.mp3',
      type: 'extract_music',
      category_name: 'local',
      source_platform: 0
    }
  ];

  draftContent.materials.speeds = [
    { id: videoSpeedId, type: 'speed', mode: 0, speed: 1.0 },
    { id: audioSpeedId, type: 'speed', mode: 0, speed: 1.0 }
  ];

  draftContent.materials.canvases = [
    { id: canvasId, type: 'canvas_color', color: '', blur: 0 }
  ];

  // Add Tracks
  draftContent.tracks = [
    {
      id: uuid(),
      type: 'video',
      segments: [
        {
          id: uuid(),
          material_id: videoMatId,
          speed_id: videoSpeedId,
          source_timerange: { start: 0, duration: durationMicro },
          target_timerange: { start: 0, duration: durationMicro },
          render_timerange: { start: 0, duration: 0 },
          clip: {
            scale: { x: 1.0, y: 1.0 },
            transform: { x: 0.0, y: 0.0 },
            rotation: 0,
            flip: { horizontal: false, vertical: false },
            alpha: 1.0
          },
          uniform_scale: { on: true, value: 1.0 },
          volume: 1.0,
          last_nonzero_volume: 1.0,
          visible: true,
          enable_adjust: true,
          enable_lut: true,
          extra_material_refs: [videoSpeedId, canvasId]
        }
      ],
      attribute: 0,
      flag: 0
    },
    {
      id: uuid(),
      type: 'audio',
      segments: [
        {
          id: uuid(),
          material_id: audioMatId,
          speed_id: audioSpeedId,
          source_timerange: { start: 0, duration: durationMicro },
          target_timerange: { start: 0, duration: durationMicro },
          render_timerange: { start: 0, duration: 0 },
          volume: 1.0,
          last_nonzero_volume: 1.0,
          visible: true,
          extra_material_refs: [audioSpeedId]
        }
      ],
      attribute: 0,
      flag: 0
    }
  ];

  fs.writeFileSync(contentPath, JSON.stringify(draftContent, null, 2), 'utf8');

  // Copy cover
  if (fs.existsSync(coverFile)) {
    fs.copyFileSync(coverFile, path.join(projectDir, 'draft_cover.jpg'));
  }

  // Update native draft_meta_info.json
  const metaPath = path.join(projectDir, 'draft_meta_info.json');
  const draftMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  draftMeta.draft_name = '0903';
  draftMeta.tm_duration = durationMicro;
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
    tm_duration: durationMicro
  };

  fs.writeFileSync(rootMetaPath, JSON.stringify({
    all_draft_store: [rootEntry],
    draft_ids: 1,
    root_path: draftRoot.replace(/\\/g, '/')
  }, null, 2), 'utf8');

  console.log('[SUCCESS] Native Project 0903 populated with Part 1 media!');
  console.log('Duration:', (durationMicro / 1000000).toFixed(2) + 's');
}

populate0903();

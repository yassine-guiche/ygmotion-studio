/**
 * motion_engine.js - Image-to-Video Motion Animation Engine
 * 
 * Animates static images into dynamic 1080p 30fps video clips using cinematic
 * camera motion profiles (Push-In, Zoom-Out, Pan, Tilt, 2.5D Float, Shake).
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

function getFfmpegPath() {
  const candidates = [
    "ffmpeg",
    path.join(process.env.LOCALAPPDATA || "", "Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-full_build\\bin\\ffmpeg.exe"),
    "C:\\ffmpeg\\bin\\ffmpeg.exe"
  ];
  for (const c of candidates) {
    try {
      execSync(`"${c}" -version`, { stdio: "pipe" });
      return c;
    } catch {}
  }
  return "ffmpeg";
}

const MOTION_PROFILES = {
  push_in: {
    name: 'Cinematic Push-In (Slow Zoom)',
    description: 'Slow continuous zoom toward focal point (1.0x -> 1.15x)',
    getFilter: (fps, dur) => {
      const frames = Math.max(30, Math.round(fps * dur));
      return `scale=2160:1215:force_original_aspect_ratio=increase,crop=2160:1215,zoompan=z='min(zoom+0.0010,1.15)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=${fps}`;
    }
  },
  zoom_out: {
    name: 'Context Reveal (Zoom Out)',
    description: 'Starts close and slowly pulls back to reveal environment (1.15x -> 1.0x)',
    getFilter: (fps, dur) => {
      const frames = Math.max(30, Math.round(fps * dur));
      return `scale=2160:1215:force_original_aspect_ratio=increase,crop=2160:1215,zoompan=z='if(lte(zoom,1.0),1.15,max(1.0,zoom-0.0010))':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=${fps}`;
    }
  },
  pan_left_right: {
    name: 'Documentary Lateral Pan',
    description: 'Smooth panoramic camera sweep from left to right',
    getFilter: (fps, dur) => {
      const frames = Math.max(30, Math.round(fps * dur));
      return `scale=2400:1080:force_original_aspect_ratio=increase,crop=2400:1080,zoompan=z='1.05':d=${frames}:x='(in/${frames})*(iw-iw/zoom)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=${fps}`;
    }
  },
  tilt_up_down: {
    name: 'Archival Vertical Scan',
    description: 'Downward camera tilt scanning character or document',
    getFilter: (fps, dur) => {
      const frames = Math.max(30, Math.round(fps * dur));
      return `scale=1920:1350:force_original_aspect_ratio=increase,crop=1920:1350,zoompan=z='1.05':d=${frames}:x='iw/2-(iw/zoom/2)':y='(in/${frames})*(ih-ih/zoom)':s=1920x1080:fps=${fps}`;
    }
  },
  parallax_float: {
    name: '2.5D Parallax Floating Camera',
    description: 'Subtle handheld breathing camera drift',
    getFilter: (fps, dur) => {
      const frames = Math.max(30, Math.round(fps * dur));
      return `scale=2160:1215:force_original_aspect_ratio=increase,crop=2160:1215,zoompan=z='1.08+0.03*sin(in/18)':d=${frames}:x='(iw/2-(iw/zoom/2))+15*sin(in/25)':y='(ih/2-(ih/zoom/2))+10*cos(in/30)':s=1920x1080:fps=${fps}`;
    }
  },
  camera_shake: {
    name: 'Action Impact Camera Shake',
    description: 'High-tension impact tremor with subtle jitter',
    getFilter: (fps, dur) => {
      const frames = Math.max(30, Math.round(fps * dur));
      return `scale=2160:1215:force_original_aspect_ratio=increase,crop=2160:1215,zoompan=z='1.10':d=${frames}:x='(iw/2-(iw/zoom/2))+8*sin(in*3.5)':y='(ih/2-(ih/zoom/2))+6*cos(in*4.2)':s=1920x1080:fps=${fps}`;
    }
  }
};

class MotionEngine {
  constructor() {
    this.ffmpeg = getFfmpegPath();
  }

  getProfiles() {
    return Object.entries(MOTION_PROFILES).map(([key, val]) => ({
      id: key,
      name: val.name,
      description: val.description
    }));
  }

  /**
   * Animate a single still image into an MP4 clip
   */
  async animateImage({ imagePath, outputPath, durationSec = 4.0, motionType = 'push_in', colorFilter = '' }) {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Source image not found: ${imagePath}`);
    }

    const profile = MOTION_PROFILES[motionType] || MOTION_PROFILES.push_in;
    const fps = 30;
    let vf = profile.getFilter(fps, durationSec);

    if (colorFilter) {
      vf += `,${colorFilter}`;
    }

    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const args = [
      '-y',
      '-loop', '1',
      '-t', durationSec.toFixed(3),
      '-i', imagePath,
      '-vf', vf,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      outputPath
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn(this.ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve({
            success: true,
            outputPath,
            durationSec,
            motionType
          });
        } else {
          reject(new Error(`Motion render failed (code ${code}): ${stderr.slice(-300)}`));
        }
      });
      proc.on('error', reject);
    });
  }

  /**
   * Batch animate multiple scene images in parallel
   */
  async batchAnimateScenes(scenes, outDir) {
    const results = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const targetOut = path.join(outDir, `scene_${String(i + 1).padStart(2, '0')}.mp4`);
      const motion = scene.cameraMotion || 'push_in';
      const dur = scene.durationSec || 4.0;

      if (scene.imagePath && fs.existsSync(scene.imagePath)) {
        const res = await this.animateImage({
          imagePath: scene.imagePath,
          outputPath: targetOut,
          durationSec: dur,
          motionType: motion
        });
        results.push(res);
      }
    }
    return results;
  }
}

module.exports = new MotionEngine();

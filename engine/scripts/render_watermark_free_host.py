"""
Render 100% Watermark-Free Host in Office Talking Video
Processes every frame with a feathered elliptical alpha mask over the 4K clean background.
"""

import os
import cv2
import numpy as np
from moviepy import VideoFileClip, AudioFileClip

def render_clean_host():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ep_assets = os.path.join(base_dir, 'episodes', 'EP001', 'assets')
    ep_audio = os.path.join(base_dir, 'episodes', 'EP001', 'audio')

    raw_video = os.path.join(ep_assets, 'host_talking_intro.mp4')
    clean_bg_path = os.path.join(ep_assets, 'host_in_office_16x9.jpg')
    temp_video = os.path.join(ep_assets, 'temp_visual_clean.mp4')
    final_output = os.path.join(ep_assets, 'host_talking_intro_clean.mp4')
    voice_audio = os.path.join(ep_audio, 'chunk_part_01.mp3')

    print("=== RENDERING 100% WATERMARK-FREE HOST VIDEO ===")
    cap = cv2.VideoCapture(raw_video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 714
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    print(f"Source video: {w}x{h} @ {fps} fps ({total_frames} frames)")

    # Load clean background
    clean_bg = cv2.imread(clean_bg_path)
    clean_bg = cv2.resize(clean_bg, (w, h))

    # Precompute the feathered elliptical mask around the host's head
    mask = np.zeros((h, w), dtype=np.float32)
    # Head center: X=640, Y=205. Semi-axes: width 110, height 140
    cv2.ellipse(mask, (640, 205), (110, 140), 0, 0, 360, 1.0, -1)
    mask = cv2.GaussianBlur(mask, (35, 35), 13)
    mask_3d = np.repeat(mask[:, :, np.newaxis], 3, axis=2)
    inv_mask_3d = 1.0 - mask_3d
    clean_bg_f = clean_bg.astype(np.float32) * inv_mask_3d

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(temp_video, fourcc, fps, (w, h))

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        # Feather blend: animated face + clean pristine background
        blended = (frame.astype(np.float32) * mask_3d + clean_bg_f).astype(np.uint8)
        out.write(blended)
        frame_idx += 1
        if frame_idx % 75 == 0:
            print(f"  Processed {frame_idx}/{total_frames} frames ({frame_idx/total_frames*100:.1f}%)")

    cap.release()
    out.release()
    print("Video frames blending complete. Attaching audio...")

    # Attach clean ElevenLabs voice audio using MoviePy
    visual_clip = VideoFileClip(temp_video)
    audio_clip = AudioFileClip(voice_audio)
    
    # Trim to match
    final_duration = min(visual_clip.duration, audio_clip.duration)
    final_clip = visual_clip.subclipped(0, final_duration).with_audio(audio_clip.subclipped(0, final_duration))

    final_clip.write_videofile(
        final_output,
        codec='libx264',
        audio_codec='aac',
        fps=fps,
        preset='fast',
        threads=4
    )

    visual_clip.close()
    audio_clip.close()
    final_clip.close()

    # Cleanup temp
    if os.path.exists(temp_video):
        os.remove(temp_video)

    # Overwrite host_talking_intro.mp4 so it's always the clean version
    import shutil
    shutil.copyfile(final_output, raw_video)

    print(f"\n[SUCCESS] Rendered 100% Watermark-Free Host Video:")
    print(f"File: {final_output}")
    print(f"Size: {os.path.getsize(final_output) / 1024 / 1024:.2f} MB")

if __name__ == '__main__':
    render_clean_host()

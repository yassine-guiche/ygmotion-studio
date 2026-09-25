import os
import cv2
import numpy as np
import math
import time
import subprocess
import imageio_ffmpeg

def create_faceless_host_loop(
    input_image_path="episodes/EP001/assets/faceless_host_studio.jpg",
    output_video_path="episodes/EP001/assets/faceless_host_studio_loop_1080p.mp4",
    duration_sec=8.0,
    fps=30,
    output_width=1920,
    output_height=1080
):
    print(f"[1/5] Loading faceless host image: {input_image_path}")
    base_img = cv2.imread(input_image_path)
    if base_img is None:
        raise FileNotFoundError(f"Could not load image from {input_image_path}")

    base_1080 = cv2.resize(base_img, (output_width, output_height), interpolation=cv2.INTER_LANCZOS4)
    h, w = output_height, output_width

    scale_x = output_width / base_img.shape[1]
    scale_y = output_height / base_img.shape[0]

    # Coordinates in 1080p:
    # ON AIR sign: x: [0, 240], y: [650, 850]
    on_air_x1 = int(0 * scale_x)
    on_air_x2 = int(220 * scale_x)
    on_air_y1 = int(460 * scale_y)
    on_air_y2 = int(600 * scale_y)

    # VU meters: x: [230, 520], y: [620, 750]
    vu_x1 = int(230 * scale_x)
    vu_x2 = int(520 * scale_x)
    vu_y1 = int(620 * scale_y)
    vu_y2 = int(740 * scale_y)

    # Tape reels on right:
    # Left reel: center ~(1100*scale_x, 420*scale_y), radius ~100*scale_x
    # Right reel: center ~(1280*scale_x, 420*scale_y), radius ~100*scale_x
    reel1_cx = int(1110 * scale_x)
    reel1_cy = int(420 * scale_y)
    reel2_cx = int(1280 * scale_x)
    reel2_cy = int(420 * scale_y)
    reel_r = int(95 * scale_x)

    # Extract reels for smooth rotation
    reel1_crop = base_1080[reel1_cy - reel_r : reel1_cy + reel_r, reel1_cx - reel_r : reel1_cx + reel_r].copy()
    reel2_crop = base_1080[reel2_cy - reel_r : reel2_cy + reel_r, reel2_cx - reel_r : reel2_cx + reel_r].copy()

    # Circular mask for reels
    Y_reel, X_reel = np.ogrid[:reel_r * 2, :reel_r * 2]
    reel_mask = ((X_reel - reel_r) ** 2 + (Y_reel - reel_r) ** 2 <= (reel_r - 2) ** 2).astype(np.float32)
    reel_mask_3ch = cv2.GaussianBlur(reel_mask, (9, 9), 3.0)[:, :, None]

    total_frames = int(duration_sec * fps)
    print(f"[2/5] Rendering {total_frames} frames ({duration_sec}s @ {fps}fps)...")

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    temp_raw = output_video_path.replace(".mp4", "_raw.mp4")
    out = cv2.VideoWriter(temp_raw, fourcc, fps, (output_width, output_height))

    t0 = time.time()
    for frame_idx in range(total_frames):
        if frame_idx % 30 == 0 or frame_idx == total_frames - 1:
            print(f"  Rendering frame {frame_idx + 1}/{total_frames} ({((frame_idx + 1)/total_frames)*100:.1f}%)")

        theta = 2.0 * math.pi * (frame_idx / total_frames)
        frame = base_1080.copy()

        # 1. TAPE REELS ROTATION (Seamless integer revolutions over loop)
        # 1 complete revolution over 8 seconds (45 deg/sec)
        angle_deg = (frame_idx / total_frames) * 360.0
        M1 = cv2.getRotationMatrix2D((reel_r, reel_r), angle_deg, 1.0)
        M2 = cv2.getRotationMatrix2D((reel_r, reel_r), angle_deg, 1.0)
        rot_reel1 = cv2.warpAffine(reel1_crop, M1, (reel_r * 2, reel_r * 2))
        rot_reel2 = cv2.warpAffine(reel2_crop, M2, (reel_r * 2, reel_r * 2))

        # Blend rotating reels back onto frame
        sub1 = frame[reel1_cy - reel_r : reel1_cy + reel_r, reel1_cx - reel_r : reel1_cx + reel_r]
        frame[reel1_cy - reel_r : reel1_cy + reel_r, reel1_cx - reel_r : reel1_cx + reel_r] = (
            rot_reel1 * reel_mask_3ch + sub1 * (1.0 - reel_mask_3ch)
        ).astype(np.uint8)

        sub2 = frame[reel2_cy - reel_r : reel2_cy + reel_r, reel2_cx - reel_r : reel2_cx + reel_r]
        frame[reel2_cy - reel_r : reel2_cy + reel_r, reel2_cx - reel_r : reel2_cx + reel_r] = (
            rot_reel2 * reel_mask_3ch + sub2 * (1.0 - reel_mask_3ch)
        ).astype(np.uint8)

        # 2. ON AIR SIGN GLOW MODULATION
        # Gentle tube pulsation
        air_factor = 1.0 + 0.12 * math.sin(4 * theta) + 0.05 * math.cos(7 * theta)
        sub_air = frame[on_air_y1:on_air_y2, on_air_x1:on_air_x2].astype(np.float32)
        frame[on_air_y1:on_air_y2, on_air_x1:on_air_x2] = np.clip(sub_air * air_factor, 0, 255).astype(np.uint8)

        # 3. VU METERS AUDIO-REACTIVE WARMTH
        vu_pulse = 1.0 + 0.15 * math.sin(3 * theta) + 0.10 * math.sin(6 * theta)
        sub_vu = frame[vu_y1:vu_y2, vu_x1:vu_x2].astype(np.float32)
        frame[vu_y1:vu_y2, vu_x1:vu_x2] = np.clip(sub_vu * vu_pulse, 0, 255).astype(np.uint8)

        # 4. CINEMATIC 35mm FILM GRAIN
        np.random.seed(frame_idx * 23 + 202)
        frame_float = frame.astype(np.float32)
        grain = np.random.normal(0, 2.5, (h, w, 1)).astype(np.float32)
        frame_float = np.clip(frame_float + grain, 0, 255)

        # 5. SUBTLE SLOW BREATHING CAMERA MOTION (1.0% max zoom)
        zoom = 1.0 + 0.008 * (0.5 - 0.5 * math.cos(theta))
        M_cam = cv2.getRotationMatrix2D((w // 2, h // 2), 0, zoom)
        M_cam[0, 2] += 0.8 * math.sin(theta)
        M_cam[1, 2] += 0.6 * math.cos(theta)
        final_frame = cv2.warpAffine(frame_float.astype(np.uint8), M_cam, (w, h), borderMode=cv2.BORDER_REFLECT_101)

        out.write(final_frame)

    out.release()
    print(f"[3/5] Raw host video written to {temp_raw}")

    # Transcode to high quality H.264
    print(f"[4/5] Transcoding host video with ffmpeg...")
    ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        ffmpeg_bin, "-y",
        "-i", temp_raw,
        "-c:v", "libx264",
        "-profile:v", "high",
        "-level", "4.1",
        "-pix_fmt", "yuv420p",
        "-crf", "17",
        "-preset", "fast",
        output_video_path
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode == 0:
        if os.path.exists(temp_raw):
            os.remove(temp_raw)
        print(f"[5/5] SUCCESS! Faceless host loop ready: {output_video_path}")
    else:
        print("FFmpeg error:", res.stderr)

if __name__ == "__main__":
    create_faceless_host_loop()

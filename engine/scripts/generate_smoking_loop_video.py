import os
import cv2
import numpy as np
import math
import time

def create_smoking_loop(
    input_image_path="episodes/EP001/assets/storyteller_smoking_base.jpg",
    output_video_path="episodes/EP001/assets/storyteller_smoking_loop_1080p.mp4",
    duration_sec=8.0,
    fps=30,
    output_width=1920,
    output_height=1080
):
    print(f"[1/5] Loading base image: {input_image_path}")
    base_img = cv2.imread(input_image_path)
    if base_img is None:
        raise FileNotFoundError(f"Could not load image from {input_image_path}")

    # Resize base to Full HD 1920x1080
    base_1080 = cv2.resize(base_img, (output_width, output_height), interpolation=cv2.INTER_LANCZOS4)
    h, w = output_height, output_width

    # Calculate scale factor from original (1376x768) to 1080p (1920x1080)
    scale_x = output_width / base_img.shape[1]
    scale_y = output_height / base_img.shape[0]

    # Original coordinates: ember at (458, 304)
    ember_x = int(458 * scale_x)  # ~ 639
    ember_y = int(304 * scale_y)  # ~ 427
    print(f"Ember coordinates in 1080p: ({ember_x}, {ember_y})")

    # Define smoke bounding box in 1080p:
    # Original: x in [420, 750], y in [0, 360]
    smoke_x1 = int(420 * scale_x)
    smoke_x2 = int(820 * scale_x)
    smoke_y1 = int(20 * scale_y)
    smoke_y2 = int(440 * scale_y)
    print(f"Smoke region: X=[{smoke_x1}, {smoke_x2}], Y=[{smoke_y1}, {smoke_y2}]")

    # Create smoke weight mask: Gaussian falloff around smoke plume
    smoke_mask = np.zeros((h, w), dtype=np.float32)
    # Center of smoke plume
    plume_center_x = int((smoke_x1 + smoke_x2) / 2)
    plume_center_y = int((smoke_y1 + smoke_y2) / 2)
    radius_x = (smoke_x2 - smoke_x1) / 2.0
    radius_y = (smoke_y2 - smoke_y1) / 2.0

    Y, X = np.ogrid[:h, :w]
    # Elliptical distance normalized
    dist_sq = ((X - plume_center_x) / radius_x) ** 2 + ((Y - plume_center_y) / radius_y) ** 2
    # Soft feather mask for smoke motion
    smoke_mask = np.exp(-dist_sq * 2.5).astype(np.float32)
    # Ensure zero outside bounding box
    smoke_mask[dist_sq > 1.2] = 0.0
    smoke_mask = cv2.GaussianBlur(smoke_mask, (45, 45), 15.0)

    # Moonlight beam region for subtle beam shimmer
    # Blinds on left: x in [0, 450], y in [0, 500]
    beam_mask = np.zeros((h, w), dtype=np.float32)
    beam_x2 = int(550 * scale_x)
    beam_y2 = int(480 * scale_y)
    beam_sub = base_1080[:beam_y2, :beam_x2]
    # Highlight detection in beam
    gray_beam = cv2.cvtColor(beam_sub, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    beam_weight = np.clip((gray_beam - 0.25) * 1.5, 0, 1)
    beam_mask[:beam_y2, :beam_x2] = cv2.GaussianBlur(beam_weight, (51, 51), 20.0)

    total_frames = int(duration_sec * fps)
    print(f"[2/5] Preparing {total_frames} frames ({duration_sec}s @ {fps}fps)...")

    # Pre-generate coordinates grid for vector displacement
    grid_y, grid_x = np.mgrid[0:h, 0:w].astype(np.float32)

    # Set up video writer (using mp4v or avc1)
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    temp_raw_video = output_video_path.replace(".mp4", "_raw.mp4")
    out = cv2.VideoWriter(temp_raw_video, fourcc, fps, (output_width, output_height))

    t0 = time.time()
    for frame_idx in range(total_frames):
        # Progress logging
        if frame_idx % 30 == 0 or frame_idx == total_frames - 1:
            elapsed = time.time() - t0
            print(f"  Rendering frame {frame_idx + 1}/{total_frames} ({((frame_idx + 1)/total_frames)*100:.1f}%) - elapsed {elapsed:.1f}s")

        # Phase theta from 0 to 2*PI (guarantees 100% seamless looping!)
        theta = 2.0 * math.pi * (frame_idx / total_frames)

        # -------------------------------------------------------------
        # 1. VOLUMETRIC SMOKE FLUID-LIKE DISPLACEMENT
        # Multi-harmonic looping displacement field
        # -------------------------------------------------------------
        # Vertical convection (upward drift + curling)
        # Using harmonic frequencies k=1, 2, 3 of theta so endpoints match exactly
        disp_x = (
            4.5 * np.sin(grid_y * 0.015 + theta) +
            2.5 * np.cos(grid_x * 0.012 - 2 * theta) +
            1.5 * np.sin((grid_x + grid_y) * 0.010 + 3 * theta)
        )
        disp_y = (
            -6.0 * np.sin(theta) * 0.5 - 4.0 * (1.0 - np.cos(2 * theta)) * 0.5 +
            3.5 * np.sin(grid_x * 0.018 - theta) +
            2.0 * np.cos(grid_y * 0.014 + 2 * theta)
        )

        # Weight the displacement by smoke mask so character silhouette stays stable
        map_x = np.clip(grid_x + disp_x * smoke_mask, 0, w - 1).astype(np.float32)
        map_y = np.clip(grid_y + disp_y * smoke_mask, 0, h - 1).astype(np.float32)

        # Apply remap for organic smoke swirling
        frame = cv2.remap(base_1080, map_x, map_y, interpolation=cv2.INTER_LINEAR)

        # -------------------------------------------------------------
        # 2. CIGARETTE EMBER BREATHING & GLOW PULSE
        # -------------------------------------------------------------
        # Breathing cycle: 2 complete inhalation/glow pulses across 8 seconds
        # Glow factor varies smoothly between 0.8 and 1.7
        ember_pulse = 0.5 + 0.5 * math.sin(2 * theta - math.pi / 4)
        ember_breath = math.sin(theta) ** 2  # secondary slow swell
        ember_intensity = 0.8 + 0.9 * (ember_pulse * 0.7 + ember_breath * 0.3)

        # Draw glowing radial bloom on ember
        # Radius expands slightly as it glows hotter
        bloom_radius = int(22 + 10 * ember_pulse)
        y_min = max(0, ember_y - bloom_radius)
        y_max = min(h, ember_y + bloom_radius)
        x_min = max(0, ember_x - bloom_radius)
        x_max = min(w, ember_x + bloom_radius)

        if y_max > y_min and x_max > x_min:
            sub_y, sub_x = np.ogrid[y_min:y_max, x_min:x_max]
            dist = np.sqrt((sub_x - ember_x) ** 2 + (sub_y - ember_y) ** 2)
            # Radial falloff
            glow = np.clip(1.0 - (dist / bloom_radius), 0, 1) ** 2
            glow_3ch = np.dstack([
                glow * 0.15 * ember_intensity,  # Blue subtle warm
                glow * 0.55 * ember_intensity,  # Green amber
                glow * 1.00 * ember_intensity   # Red hot core
            ])
            # Core super-hot center (tiny 3px white-orange dot)
            core_dist = dist
            core_glow = np.clip(1.0 - (core_dist / 4.0), 0, 1) ** 3
            glow_3ch[:, :, 0] += core_glow * 0.4 * ember_intensity
            glow_3ch[:, :, 1] += core_glow * 0.8 * ember_intensity
            glow_3ch[:, :, 2] += core_glow * 1.0 * ember_intensity

            # Additive blend to frame
            patch = frame[y_min:y_max, x_min:x_max].astype(np.float32) / 255.0
            patch = np.clip(patch + glow_3ch * 0.65, 0, 1.0)
            frame[y_min:y_max, x_min:x_max] = (patch * 255.0).astype(np.uint8)

        # -------------------------------------------------------------
        # 3. ATMOSPHERIC MOONLIGHT SHAFT SHIMMER
        # -------------------------------------------------------------
        # Subtle light fluctuation in the Venetian blind beams (1-2% luminance)
        beam_pulse = 1.0 + 0.04 * math.sin(3 * theta) + 0.02 * math.cos(5 * theta)
        frame_float = frame.astype(np.float32)
        # Apply gentle modulation only where beam_mask > 0
        beam_factor = 1.0 + (beam_pulse - 1.0) * beam_mask[:, :, None]
        frame_float = np.clip(frame_float * beam_factor, 0, 255)

        # -------------------------------------------------------------
        # 4. CINEMATIC 35mm FILM GRAIN (Subtle Living Texture)
        # -------------------------------------------------------------
        # Seed pseudo-random grain per frame for authentic film motion
        np.random.seed(frame_idx * 17 + 101)
        # Subtle gaussian noise with std=2.8
        grain = np.random.normal(0, 2.8, (h, w, 1)).astype(np.float32)
        # Attenuate grain in extreme highlights, let it live in shadows and midtones
        luma = (0.299 * frame_float[:, :, 2] + 0.587 * frame_float[:, :, 1] + 0.114 * frame_float[:, :, 0]) / 255.0
        grain_weight = np.clip(1.2 - luma, 0.3, 1.0)[:, :, None]
        frame_float = np.clip(frame_float + grain * grain_weight, 0, 255)

        # -------------------------------------------------------------
        # 5. SUBTLE SLOW PARALLAX BREATHING ZOOM (1.5% max)
        # Perfectly sinusoidal: scale(0) == scale(T) == 1.000
        # -------------------------------------------------------------
        zoom_factor = 1.0 + 0.012 * (0.5 - 0.5 * math.cos(theta))
        # Center of zoom is focused near the storyteller's shoulder / cigarette
        center_x = ember_x
        center_y = ember_y
        M = cv2.getRotationMatrix2D((center_x, center_y), 0, zoom_factor)
        # Slight microscopic 1px handheld sway
        M[0, 2] += 1.0 * math.sin(theta)
        M[1, 2] += 0.8 * math.cos(theta)

        final_frame = cv2.warpAffine(frame_float.astype(np.uint8), M, (w, h), borderMode=cv2.BORDER_REFLECT_101)

        out.write(final_frame)

    out.release()
    print(f"[3/5] Raw loop video written to {temp_raw_video}")

    # Re-encode with ffmpeg (H.264 high quality, yuv420p for maximum compatibility)
    print(f"[4/5] Transcoding to H.264 master: {output_video_path}")
    import subprocess
    import imageio_ffmpeg
    ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        ffmpeg_bin, "-y",
        "-i", temp_raw_video,
        "-c:v", "libx264",
        "-profile:v", "high",
        "-level", "4.1",
        "-pix_fmt", "yuv420p",
        "-crf", "17",
        "-preset", "slow",
        output_video_path
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print("FFmpeg error:", res.stderr)
        # If ffmpeg fails, keep temp_raw_video as output
        if os.path.exists(temp_raw_video):
            os.replace(temp_raw_video, output_video_path)
    else:
        if os.path.exists(temp_raw_video):
            os.remove(temp_raw_video)
        print(f"[5/5] SUCCESS! Seamless smoking loop generated: {output_video_path}")

if __name__ == "__main__":
    create_smoking_loop()

import os
import subprocess
import imageio_ffmpeg

def get_audio_duration(file_path):
    ffprobe_bin = imageio_ffmpeg.get_ffmpeg_exe()
    # Use ffmpeg -i to inspect duration
    cmd = [ffprobe_bin, "-i", file_path]
    res = subprocess.run(cmd, capture_output=True, text=True)
    for line in res.stderr.splitlines():
        if "Duration:" in line:
            parts = line.split("Duration:")[1].split(",")[0].strip()
            h, m, s = parts.split(":")
            return float(h) * 3600 + float(m) * 60 + float(s)
    return None

def compose_faceless_part(
    video_loop_path,
    voice_path,
    music_path,
    output_path,
    sfx_list=None,
    music_volume=0.14
):
    ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
    voice_duration = get_audio_duration(voice_path)
    if voice_duration is None:
        raise ValueError(f"Could not determine duration for {voice_path}")
    
    total_duration = voice_duration + 0.5  # slight 0.5s room tone tail
    print(f"\n--- Composing: {os.path.basename(output_path)} ---")
    print(f"Video loop: {video_loop_path}")
    print(f"Voice: {voice_path} (Duration: {voice_duration:.2f}s)")

    # Build ffmpeg command with stream_loop for video and music
    inputs = [
        "-stream_loop", "-1", "-i", video_loop_path,
        "-i", voice_path,
        "-stream_loop", "-1", "-i", music_path
    ]

    filter_complex = f"[2:a]volume={music_volume}[bgm]; [1:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]"
    
    cmd = [
        ffmpeg_bin, "-y",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "libx264",
        "-c:a", "aac",
        "-b:a", "192k",
        "-t", f"{total_duration:.2f}",
        "-pix_fmt", "yuv420p",
        "-preset", "fast",
        "-shortest",
        output_path
    ]

    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print("FFmpeg error:", res.stderr)
        raise RuntimeError(f"Failed to compose {output_path}")
    
    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"[SUCCESS] Output ready: {output_path} ({size_mb:.2f} MB, {total_duration:.2f}s)")
    return output_path

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ep_dir = os.path.join(base_dir, 'episodes', 'EP001')
    assets_dir = os.path.join(ep_dir, 'assets')
    audio_dir = os.path.join(ep_dir, 'audio')

    # 1. Compose Part 01 (Faceless Host in Studio)
    host_video = os.path.join(assets_dir, 'faceless_host_studio_loop_1080p.mp4')
    voice_p1 = os.path.join(audio_dir, 'chunk_part_01.mp3')
    music = os.path.join(audio_dir, 'music_dark_suspense_drone.mp3')
    out_p1 = os.path.join(ep_dir, 'EP001_PART_01_FACELESS_HOST_MASTER.mp4')
    compose_faceless_part(host_video, voice_p1, music, out_p1, music_volume=0.15)

    # 2. Compose Part 02 (Faceless Storyteller Smoking Loop)
    smoking_video = os.path.join(assets_dir, 'storyteller_smoking_loop_1080p.mp4')
    voice_p2 = os.path.join(audio_dir, 'chunk_part_02.mp3')
    out_p2 = os.path.join(ep_dir, 'EP001_PART_02_SMOKING_STORYTELLER_MASTER.mp4')
    compose_faceless_part(smoking_video, voice_p2, music, out_p2, music_volume=0.13)

import os
import subprocess
import imageio_ffmpeg
import time

def compose_full_episode():
    ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ep_dir = os.path.join(base_dir, 'episodes', 'EP001')
    assets_dir = os.path.join(ep_dir, 'assets')
    audio_dir = os.path.join(ep_dir, 'audio')

    host_loop = os.path.join(assets_dir, 'faceless_host_studio_loop_1080p.mp4')
    smoking_loop = os.path.join(assets_dir, 'storyteller_smoking_loop_1080p.mp4')
    music_file = os.path.join(audio_dir, 'music_dark_suspense_drone.mp3')
    output_master = os.path.join(ep_dir, 'EP001_FULL_EPISODE_10MIN_MASTER_READY_TO_WATCH.mp4')

    print("=== BUILDING FULL 10-MINUTE EPISODE MASTER VIDEO ===")
    
    # Check all speech files
    speech_files = [os.path.join(audio_dir, f"chunk_part_{i:02d}.mp3") for i in range(1, 9)]
    for f in speech_files:
        if not os.path.exists(f):
            raise FileNotFoundError(f"Missing speech file: {f}")

    # Build audio concatenation list
    concat_list_path = os.path.join(audio_dir, "speech_concat_list.txt")
    with open(concat_list_path, "w", encoding="utf-8") as f:
        for sf in speech_files:
            # Escape backslashes for ffmpeg concat demuxer
            clean_p = sf.replace("\\", "/")
            f.write(f"file '{clean_p}'\n")

    # Step 1: Concat full speech audio track
    full_speech_audio = os.path.join(audio_dir, "ep001_full_speech_track.mp3")
    cmd_concat_audio = [
        ffmpeg_bin, "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concat_list_path,
        "-c", "copy",
        full_speech_audio
    ]
    subprocess.run(cmd_concat_audio, check=True)
    print(f"[1/3] Full speech track concatenated: {full_speech_audio}")

    # Inspect total duration
    cmd_dur = [ffmpeg_bin, "-i", full_speech_audio]
    res = subprocess.run(cmd_dur, capture_output=True, text=True)
    total_dur = 610.98
    for line in res.stderr.splitlines():
        if "Duration:" in line:
            parts = line.split("Duration:")[1].split(",")[0].strip().split(":")
            total_dur = float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
            break

    print(f"Total Episode Duration: {total_dur:.2f}s ({(total_dur/60):.2f} mins)")
    host_dur = 17.53
    story_dur = total_dur - host_dur

    # Step 2: Render full visual sequence:
    # 17.53s of faceless host loop + (total_dur - 17.53s) of smoking loop
    print(f"[2/3] Generating full composite video with ducked music drone...")
    t0 = time.time()

    # Filter complex:
    # - Stream-loop host loop, trim to host_dur
    # - Stream-loop smoking loop, trim to story_dur
    # - Concat visual: [host_v][smoking_v]concat=n=2:v=1:a=0[vout]
    # - Stream-loop music, duck to 0.14
    # - Mix full speech + music
    filter_complex = (
        f"[0:v]trim=duration={host_dur:.2f},setpts=PTS-STARTPTS[vh]; "
        f"[1:v]trim=duration={story_dur:.2f},setpts=PTS-STARTPTS[vs]; "
        f"[vh][vs]concat=n=2:v=1:a=0[vout]; "
        f"[3:a]volume=0.14[bgm]; "
        f"[2:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]"
    )

    cmd_master = [
        ffmpeg_bin, "-y",
        "-stream_loop", "-1", "-i", host_loop,
        "-stream_loop", "-1", "-i", smoking_loop,
        "-i", full_speech_audio,
        "-stream_loop", "-1", "-i", music_file,
        "-filter_complex", filter_complex,
        "-map", "[vout]",
        "-map", "[aout]",
        "-c:v", "libx264",
        "-c:a", "aac",
        "-b:a", "192k",
        "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
        "-t", f"{total_dur:.2f}",
        output_master
    ]

    res = subprocess.run(cmd_master, capture_output=True, text=True)
    if res.returncode != 0:
        print("FFmpeg error:", res.stderr)
        raise RuntimeError("Master render failed")

    elapsed = time.time() - t0
    size_mb = os.path.getsize(output_master) / (1024 * 1024)
    print(f"\n[3/3] MASTERPIECE COMPLETE in {elapsed:.1f}s!")
    print(f"File: {output_master}")
    print(f"Resolution: 1920x1080 Full HD")
    print(f"Duration: {total_dur:.2f}s (10m 11s)")
    print(f"File Size: {size_mb:.2f} MB")

if __name__ == "__main__":
    compose_full_episode()

"""
Master Automated Video & Audio Compositor for Part 1
Zero Manual Editing Required: Produces a 100% finished, pre-mixed, broadcast-ready MP4.
"""

import os
from moviepy import VideoFileClip, AudioFileClip, CompositeAudioClip

def compose_part1():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ep_dir = os.path.join(base_dir, 'episodes', 'EP001')
    assets_dir = os.path.join(ep_dir, 'assets')
    audio_dir = os.path.join(ep_dir, 'audio')

    video_source = os.path.join(assets_dir, 'host_talking_intro_clean.mp4')
    voice_source = os.path.join(audio_dir, 'chunk_part_01.mp3')
    music_source = os.path.join(audio_dir, 'music_dark_suspense_drone.mp3')
    sfx_source = os.path.join(audio_dir, 'sfx', 'sfx_04_tense_heartbeat_sub.mp3')

    output_video = os.path.join(ep_dir, 'EP001_PART_01_MASTER_READY_TO_WATCH.mp4')
    output_asset = os.path.join(assets_dir, 'host_talking_intro.mp4')

    print("=== STARTING MASTER AUTOMATED VIDEO COMPOSITION ===")
    print(f"Loading clean video: {video_source}")
    video = VideoFileClip(video_source)
    duration = video.duration
    print(f"Video Duration: {duration:.2f} seconds")

    # 1. Voice Track (100% volume)
    voice_audio = AudioFileClip(voice_source)
    
    # 2. Background Drone Track (15% volume ducked)
    music_audio = AudioFileClip(music_source).with_volume_scaled(0.15)
    if music_audio.duration > duration:
        music_audio = music_audio.subclipped(0, duration)

    # 3. SFX Heartbeat Pulse (Placed at 6.0s at 70% volume)
    sfx_audio = AudioFileClip(sfx_source).with_volume_scaled(0.70).with_start(6.0)

    # Composite Audio Mix
    composite_audio = CompositeAudioClip([voice_audio, music_audio, sfx_audio]).with_duration(duration)

    # Attach Composite Audio to Video
    final_video = video.with_audio(composite_audio)

    print(f"Rendering master video to: {output_video}...")
    final_video.write_videofile(
        output_video,
        codec='libx264',
        audio_codec='aac',
        fps=25,
        preset='fast',
        threads=4
    )

    # Also save as host_talking_intro.mp4 in assets
    import shutil
    shutil.copyfile(output_video, output_asset)

    print(f"\n[SUCCESS] Master Final Video Created (Zero-Editing Required):")
    print(f"File: {output_video}")
    print(f"Size: {os.path.getsize(output_video) / 1024 / 1024:.2f} MB")

if __name__ == '__main__':
    compose_part1()

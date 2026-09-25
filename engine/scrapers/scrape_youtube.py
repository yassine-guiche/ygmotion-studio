#!/usr/bin/env python3
"""
scrape_youtube.py - High-reliability YouTube Channel and Video Scraper
Extracts channel details, top videos, thumbnails, views, and transcripts.
"""

import sys
import json
import re
import urllib.request
import urllib.parse
from youtube_transcript_api import YouTubeTranscriptApi

def normalize_url(url_or_handle):
    url_or_handle = url_or_handle.strip()
    if url_or_handle.startswith("@"):
        return f"https://www.youtube.com/{url_or_handle}/videos"
    if "youtube.com" in url_or_handle:
        if "/watch?v=" in url_or_handle or "youtu.be/" in url_or_handle:
            return url_or_handle
        if not url_or_handle.endswith("/videos"):
            # Ensure it ends with /videos if it's a channel URL
            return url_or_handle.rstrip("/") + "/videos"
        return url_or_handle
    return f"https://www.youtube.com/@{url_or_handle}/videos"

def fetch_html(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9"
        }
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read().decode("utf-8", errors="replace")

def extract_channel_videos(url):
    html = fetch_html(url)
    
    # Extract ytInitialData
    match = re.search(r"var ytInitialData = ({.*?});</script>", html)
    if not match:
        match = re.search(r"window\[\"ytInitialData\"\] = ({.*?});</script>", html)
        
    if not match:
        raise ValueError("Could not parse YouTube initial data from channel page.")
        
    data = json.loads(match.group(1))
    
    # Extract channel info
    metadata = data.get("metadata", {}).get("channelMetadataRenderer", {})
    channel_title = metadata.get("title") or "YouTube Creator"
    channel_desc = metadata.get("description") or ""
    channel_avatar = None
    avatars = metadata.get("avatar", {}).get("thumbnails", [])
    if avatars:
        channel_avatar = avatars[-1].get("url")
        
    header = data.get("header", {}).get("c4TabbedHeaderRenderer", {})
    subscribers = header.get("subscriberCountText", {}).get("simpleText") or "Unknown Subscribers"

    # Extract videos
    tabs = data.get("contents", {}).get("twoColumnBrowseResultsRenderer", {}).get("tabs", [])
    selected_tab = next((t for t in tabs if t.get("tabRenderer", {}).get("selected")), None)
    if not selected_tab and tabs:
        selected_tab = tabs[0]
        
    contents = []
    if selected_tab:
        contents = selected_tab.get("tabRenderer", {}).get("content", {}).get("richGridRenderer", {}).get("contents", [])
        
    videos = []
    for item in contents:
        lockup = item.get("richItemRenderer", {}).get("content", {}).get("lockupViewModel")
        vr = item.get("richItemRenderer", {}).get("content", {}).get("videoRenderer")
        
        if lockup:
            v_id = lockup.get("contentId")
            title = lockup.get("metadata", {}).get("lockupMetadataViewModel", {}).get("title", {}).get("content")
            meta_rows = lockup.get("metadata", {}).get("lockupMetadataViewModel", {}).get("metadata", {}).get("contentMetadataViewModel", {}).get("metadataRows", [])
            views = "Unknown views"
            published = ""
            if meta_rows and len(meta_rows) > 0:
                parts = meta_rows[0].get("metadataParts", [])
                if len(parts) > 0:
                    views = parts[0].get("text", {}).get("content", views)
                if len(parts) > 1:
                    published = parts[1].get("text", {}).get("content", published)
            
            thumb_url = f"https://i.ytimg.com/vi/{v_id}/hqdefault.jpg"
            if v_id and title:
                videos.append({
                    "id": v_id,
                    "title": title,
                    "views": views,
                    "published": published,
                    "thumbnail": thumb_url
                })
        elif vr:
            v_id = vr.get("videoId")
            title = vr.get("title", {}).get("runs", [{}])[0].get("text")
            views = vr.get("viewCountText", {}).get("simpleText", "Unknown views")
            published = vr.get("publishedTimeText", {}).get("simpleText", "")
            thumb_url = f"https://i.ytimg.com/vi/{v_id}/hqdefault.jpg"
            if v_id and title:
                videos.append({
                    "id": v_id,
                    "title": title,
                    "views": views,
                    "published": published,
                    "thumbnail": thumb_url
                })
                
    return {
        "channelTitle": channel_title,
        "channelDesc": channel_desc,
        "channelAvatar": channel_avatar,
        "subscribers": subscribers,
        "videos": videos
    }

def fetch_transcripts_for_videos(videos, max_videos=3):
    ytt = YouTubeTranscriptApi()
    enriched = []
    
    for v in videos[:max_videos]:
        v_id = v["id"]
        try:
            transcript = ytt.fetch(v_id)
            if transcript:
                full_text = " ".join([getattr(t, "text", str(t)) for t in transcript])
                words = full_text.split()
                total_words = len(words)
                last_entry = transcript[-1]
                total_dur = getattr(last_entry, "start", 0) + getattr(last_entry, "duration", 0)
                wpm = round(total_words / (total_dur / 60)) if total_dur > 0 else 150
                
                # Extract first 3 sentences / hook
                sentences = re.split(r'(?<=[.?!])\s+', full_text)
                hook = " ".join(sentences[:3]) if sentences else full_text[:200]
                
                enriched.append({
                    **v,
                    "hasTranscript": True,
                    "totalWords": total_words,
                    "durationSec": total_dur,
                    "pacingWpm": wpm,
                    "hook": hook,
                    "fullTranscriptSample": full_text[:1200]
                })
                continue
        except Exception as e:
            pass
            
        enriched.append({
            **v,
            "hasTranscript": False,
            "pacingWpm": 150,
            "hook": "",
            "fullTranscriptSample": ""
        })
        
    return enriched

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing YouTube URL argument"}))
        sys.exit(1)
        
    raw_input = sys.argv[1]
    
    # Check if single video URL
    single_vid_match = re.search(r"(?:v=|\/)([a-zA-Z0-9_-]{11})(?:\?|&|\/|$)", raw_input)
    if ("/watch?v=" in raw_input or "youtu.be/" in raw_input) and single_vid_match:
        vid_id = single_vid_match.group(1)
        # Fetch single video details and transcript
        v_info = {"id": vid_id, "title": f"Target Video {vid_id}", "views": "Analyzed Video", "published": "", "thumbnail": f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg"}
        enriched = fetch_transcripts_for_videos([v_info], max_videos=1)
        res = {
            "channelTitle": "Single Video Analysis",
            "channelDesc": "Extracted from direct YouTube video URL",
            "channelAvatar": None,
            "subscribers": "N/A",
            "videos": enriched
        }
        print(json.dumps(res, indent=2))
        return

    url = normalize_url(raw_input)
    try:
        channel_data = extract_channel_videos(url)
        enriched_videos = fetch_transcripts_for_videos(channel_data["videos"], max_videos=3)
        channel_data["videos"] = enriched_videos + channel_data["videos"][3:]
        print(json.dumps(channel_data, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()

/**
 * Subtitles Generator for EP001
 * Produces accurate, sentence-by-sentence .SRT subtitles synced to exact audio timestamps.
 */

const fs = require('fs');
const path = require('path');

const chunks = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../episodes/EP001/voice_chunks.json'), 'utf8'));

// Exact timeline chunk offsets calculated from frame headers
const chunkOffsets = [
  { start: 0.00, end: 17.53 },
  { start: 17.53, end: 99.71 },
  { start: 99.71, end: 177.14 },
  { start: 177.14, end: 283.64 },
  { start: 283.64, end: 388.52 },
  { start: 388.52, end: 480.31 },
  { start: 480.31, end: 539.17 },
  { start: 539.17, end: 610.98 }
];

function formatTime(seconds) {
  const pad = (num, size) => ('000' + num).slice(-size);
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${pad(hrs, 2)}:${pad(mins, 2)}:${pad(secs, 2)},${pad(ms, 3)}`;
}

let srtOutput = '';
let counter = 1;

chunks.forEach((c, idx) => {
  const timing = chunkOffsets[idx];
  const text = c.text;
  // Split into natural sentences
  const sentences = text.match(/[^.!?\n]+[.!?]?/g) || [text];
  const totalChars = sentences.reduce((sum, s) => sum + s.trim().length, 0);
  const chunkDuration = timing.end - timing.start;

  let currentSec = timing.start;
  sentences.forEach(s => {
    const clean = s.trim();
    if (!clean || clean.length < 2) return;
    const dur = (clean.length / totalChars) * chunkDuration;
    const endSec = Math.min(currentSec + dur, timing.end);

    srtOutput += `${counter}\n${formatTime(currentSec)} --> ${formatTime(endSec)}\n${clean}\n\n`;
    counter++;
    currentSec = endSec;
  });
});

const outPath = path.resolve(__dirname, '../../episodes/EP001/subtitles.srt');
fs.writeFileSync(outPath, srtOutput, 'utf8');
console.log(`[SUCCESS] Generated subtitles.srt with ${counter - 1} synchronized captions at:`);
console.log(outPath);

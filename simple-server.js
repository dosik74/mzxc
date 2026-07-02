const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

require('dotenv').config();

const app = express();
const PORT = 3008;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/hello', (req, res) => {
  console.log('Hello endpoint called!');
  res.json({ message: 'Hello from server!', time: new Date().toISOString() });
});

console.log('Initializing yt-dlp path...');
let ytDlpPath = 'yt-dlp';
const localYtDlpPath = path.join(__dirname, 'bin', 'yt-dlp.exe');
if (fs.existsSync(localYtDlpPath)) {
  ytDlpPath = localYtDlpPath;
  console.log('Using local yt-dlp at:', ytDlpPath);
}

const YoutubeMusicApi = require('youtube-music-api');
const youtubeMusicApi = new YoutubeMusicApi();
const youtubeMusicInit = youtubeMusicApi.initalize();

function getArtistName(artist) {
  if (!artist) return 'Unknown Artist';
  if (Array.isArray(artist)) {
    return artist.map(a => (a?.name || a)).filter(Boolean).join(', ') || 'Unknown Artist';
  }
  if (typeof artist === 'object') {
    return artist.name || 'Unknown Artist';
  }
  return String(artist);
}

const execFileAsync = promisify(execFile);

app.get('/api/search', async (req, res) => {
  console.log('Received search request for:', req.query.q);
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    await youtubeMusicInit;
    const result = await youtubeMusicApi.search(String(q), 'song');
    const items = Array.isArray(result.content) ? result.content : [];

    const tracks = items.map((item) => {
      if (!item || !item.videoId) return null;
      return {
        title: item.name || item.title || 'Unknown Title',
        artist: getArtistName(item.artist),
        thumbnail: Array.isArray(item.thumbnails) && item.thumbnails.length > 0 ? item.thumbnails[0]?.url : null,
        youtubeId: item.videoId,
      };
    }).filter(Boolean);

    console.log('Tracks count:', tracks.length);
    res.json(tracks);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search YouTube Music', details: error.message });
  }
});

app.get('/api/spotify/recommendations', async (req, res) => {
  res.status(410).json({ error: 'Spotify recommendations removed, use YouTube Music search instead.' });
});

app.get('/api/stream', async (req, res) => {
  console.log('Received stream request for:', req.query.url);
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    const { stdout } = await execFileAsync(ytDlpPath, [
      url,
      '--dump-json',
      '-f', 'bestaudio[ext=m4a]/bestaudio'
    ]);

    const metadata = JSON.parse(stdout);
    
    const audioFormat = metadata.formats.find(f => 
      (f.ext === 'm4a' || f.ext === 'webm') && f.acodec && f.vcodec === 'none'
    ) || metadata.formats.find(f => f.acodec) || metadata.url;

    if (!audioFormat) {
      return res.status(404).json({ error: 'No audio format found' });
    }

    res.json({
      audioUrl: audioFormat.url || audioFormat,
      title: metadata.title,
      artist: metadata.channel || metadata.uploader || 'Unknown Artist',
      duration: metadata.duration,
      thumbnail: metadata.thumbnails && metadata.thumbnails.length > 0 ? metadata.thumbnails[0].url : null
    });
  } catch (error) {
    console.error('Stream error:', error);
    res.status(500).json({ error: 'Failed to get stream URL', details: error.message, stack: error.stack });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

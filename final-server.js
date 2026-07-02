const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

require('dotenv').config();

const app = express();
const PORT = 3007;

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

const execFileAsync = promisify(execFile);

app.get('/api/search', async (req, res) => {
  console.log('Received search request for:', req.query.q);
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    console.log('Executing yt-dlp...');
    const { stdout } = await execFileAsync(ytDlpPath, [
      `ytsearch10:${q}`,
      '--dump-json',
      '--flat-playlist',
      '--no-playlist'
    ]);

    console.log('yt-dlp completed!');
    const results = stdout.trim().split('\n').filter(line => line);
    console.log('Search results lines:', results.length);

    const tracks = results.map(line => {
      try {
        const video = JSON.parse(line);
        return {
          id: video.id,
          title: video.title,
          artist: video.channel || video.uploader || 'Unknown Artist',
          thumbnail: video.thumbnails && video.thumbnails.length > 0 ? video.thumbnails[0].url : null,
          duration: video.duration,
          url: `https://www.youtube.com/watch?v=${video.id}`
        };
      } catch (e) {
        console.error('Error parsing line:', e);
        return null;
      }
    }).filter(track => track && track.id);

    console.log('Tracks count:', tracks.length);
    res.json(tracks);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search tracks', details: error.message, stack: error.stack });
  }
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

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3004;

app.use(cors());
app.use(express.json());

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

const runYtDlp = (args) => {
  return new Promise((resolve, reject) => {
    console.log('Running yt-dlp with args:', args);
    const child = spawn(ytDlpPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log('Got stdout chunk:', data.length, 'bytes');
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log('yt-dlp stderr:', data.toString());
    });

    child.on('close', (code) => {
      console.log('yt-dlp exited with code:', code);
      if (code !== 0) {
        reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });

    child.on('error', (err) => {
      console.error('yt-dlp error:', err);
      reject(err);
    });
  });
};

app.get('/api/search', async (req, res) => {
  console.log('Received search request for:', req.query.q);
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    console.log('Calling runYtDlp...');
    const stdout = await runYtDlp([
      `ytsearch5:${q}`,
      '--dump-json',
      '--flat-playlist',
      '--no-playlist'
    ]);
    console.log('runYtDlp completed, stdout length:', stdout.length);

    const results = stdout.trim().split('\n').filter(line => line);
    console.log('Results count:', results.length);

    const tracks = results.map(line => {
      try {
        const video = JSON.parse(line);
        return {
          id: video.id,
          title: video.title,
          artist: video.channel || video.uploader || 'Unknown Artist',
          thumbnail: video.thumbnail,
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Test it with: curl http://localhost:3004/api/search?q=test');
});

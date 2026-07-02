const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

require('dotenv').config();

const app = express();
const PORT = 3006;

app.use(cors());
app.use(express.json());

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || null;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || null;
let spotifyToken = null;
let spotifyTokenExpires = 0;

async function fetchSpotifyToken() {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error('Spotify credentials are not configured');
  }

  const now = Date.now();
  if (spotifyToken && spotifyTokenExpires > now + 5000) {
    return spotifyToken;
  }

  const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Spotify token request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  spotifyToken = data.access_token;
  spotifyTokenExpires = now + (data.expires_in || 3600) * 1000;
  return spotifyToken;
}

async function spotifyFetch(path, params = {}) {
  const token = await fetchSpotifyToken();
  const query = new URLSearchParams(params).toString();
  const url = `https://api.spotify.com/v1${path}${query ? `?${query}` : ''}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Spotify request failed: ${response.status} ${text}`);
  }
  return response.json();
}

async function spotifySearchTracks(query) {
  const data = await spotifyFetch('/search', { q: query, type: 'track', limit: 12 });
  return (data.tracks?.items || []).map((track) => ({
    id: track.id,
    title: track.name,
    artist: track.artists.map((a) => a.name).join(', '),
    thumbnail: track.album?.images?.[0]?.url || null,
    duration: track.duration_ms ? Math.round(track.duration_ms / 1000) : undefined,
    spotifyUrl: track.external_urls?.spotify,
    searchQuery: `${track.name} ${track.artists[0]?.name || ''}`.trim()
  }));
}

async function spotifyGetRecommendations(seedGenres = 'pop,edm') {
  const data = await spotifyFetch('/recommendations', { seed_genres: seedGenres, limit: 12 });
  return (data.tracks || []).map((track) => ({
    id: track.id,
    title: track.name,
    artist: track.artists.map((a) => a.name).join(', '),
    thumbnail: track.album?.images?.[0]?.url || null,
    duration: track.duration_ms ? Math.round(track.duration_ms / 1000) : undefined,
    spotifyUrl: track.external_urls?.spotify,
    searchQuery: `${track.name} ${track.artists[0]?.name || ''}`.trim()
  }));
}

// Optional MongoDB (Mongoose) integration for listening history
let mongoose;
let ListeningHistory;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || null;
if (MONGO_URI) {
  try {
    mongoose = require('mongoose');
    // define schema if not already defined in separate file
    const { Schema } = mongoose;
    const listeningSchema = new Schema({
      userId: { type: String, index: true, default: null },
      trackId: { type: String, index: true, required: true },
      trackUrl: { type: String, required: true },
      title: { type: String },
      artist: { type: String },
      thumbnail: { type: String },
      startTimestamp: { type: Date, default: Date.now },
      startOffsetSeconds: { type: Number, default: 0 },
      listenedDurationSeconds: { type: Number, default: 0 },
      totalDurationSeconds: { type: Number, default: 0 },
      status: { type: String, enum: ['playing','finished','skipped','cancelled'], default: 'playing' },
      sessionId: { type: String, index: true, default: null }
    }, { timestamps: true });

    ListeningHistory = mongoose.models.ListeningHistory || mongoose.model('ListeningHistory', listeningSchema);

    mongoose.connect(MONGO_URI).then(() => console.log('Connected to MongoDB'))
      .catch(err => console.error('MongoDB connection error:', err));
  } catch (e) {
    console.warn('Mongoose not available. Install mongoose to enable listening history.', e.message);
  }
}

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

    try {
      const spotifyResults = await spotifySearchTracks(q);
      if (spotifyResults.length) {
        return res.json(spotifyResults);
      }
    } catch (spotifyError) {
      console.warn('Spotify search failed, falling back to YouTube:', spotifyError.message);
    }

    const stdout = await runYtDlp([
      `ytsearch10:${q}`,
      '--dump-json',
      '--flat-playlist',
      '--no-playlist'
    ]);

    const results = stdout.trim().split('\n').filter(line => line);
    console.log('Search results lines:', results.length);

    const tracks = results.map(line => {
      try {
        const video = JSON.parse(line);
        return {
          id: video.id,
          title: video.title,
          artist: video.channel || video.uploader || 'Unknown Artist',
          thumbnail: video.thumbnail || (`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`),
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

app.get('/api/spotify/recommendations', async (req, res) => {
  try {
    const seedGenres = req.query.seed_genres || 'pop,edm';
    const recommendations = await spotifyGetRecommendations(String(seedGenres));
    res.json(recommendations);
  } catch (error) {
    console.error('Spotify recommendations error:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations', details: error.message });
  }
});

// Listening history endpoints (MongoDB required)
app.post('/api/listen/start', async (req, res) => {
  if (!ListeningHistory) return res.status(501).json({ error: 'Listening history not configured. Set MONGO_URI and install mongoose.' });
  try {
    const { userId = null, trackId, trackUrl, title = '', artist = '', thumbnail = '', startOffsetSeconds = 0, totalDurationSeconds = 0, sessionId = null } = req.body;
    if (!trackId || !trackUrl) return res.status(400).json({ error: 'trackId and trackUrl are required' });

    const doc = await ListeningHistory.create({ userId, trackId, trackUrl, title, artist, thumbnail, startOffsetSeconds, totalDurationSeconds, sessionId, status: 'playing' });
    res.json({ id: doc._id, createdAt: doc.createdAt });
  } catch (err) {
    console.error('listen/start error:', err);
    res.status(500).json({ error: 'Failed to create listening record', details: err.message });
  }
});

app.post('/api/listen/finish', async (req, res) => {
  if (!ListeningHistory) return res.status(501).json({ error: 'Listening history not configured. Set MONGO_URI and install mongoose.' });
  try {
    const { id, listenedDurationSeconds = 0, status = null } = req.body;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const doc = await ListeningHistory.findById(id);
    if (!doc) return res.status(404).json({ error: 'Record not found' });

    doc.listenedDurationSeconds = listenedDurationSeconds;
    // if explicit status provided use it, otherwise infer
    if (status) doc.status = status;
    else {
      if (doc.totalDurationSeconds > 0) {
        const ratio = listenedDurationSeconds / doc.totalDurationSeconds;
        doc.status = ratio >= 0.9 ? 'finished' : (ratio <= 0.2 ? 'skipped' : 'playing');
      } else {
        doc.status = listenedDurationSeconds > 0 ? 'finished' : 'skipped';
      }
    }

    await doc.save();
    res.json({ id: doc._id, status: doc.status, listenedDurationSeconds: doc.listenedDurationSeconds });
  } catch (err) {
    console.error('listen/finish error:', err);
    res.status(500).json({ error: 'Failed to update listening record', details: err.message });
  }
});

app.get('/api/listen/:id', async (req, res) => {
  if (!ListeningHistory) return res.status(501).json({ error: 'Listening history not configured. Set MONGO_URI and install mongoose.' });
  try {
    const doc = await ListeningHistory.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Record not found' });
    res.json(doc);
  } catch (err) {
    console.error('listen/get error:', err);
    res.status(500).json({ error: 'Failed to get listening record', details: err.message });
  }
});

app.get('/api/stream', async (req, res) => {
  const { url, query } = req.query;
  const source = String(url || query || '').trim();
  console.log('Received stream request for source:', source);

  if (!source) {
    return res.status(400).json({ error: 'URL or query parameter is required' });
  }

  try {
    const target = query ? `ytsearch1:${source}` : source;
    const stdout = await runYtDlp([
      target,
      '--dump-json',
      '-f', 'bestaudio[ext=m4a]/bestaudio'
    ]);

    const metadata = JSON.parse(stdout);
    const audioFormat = metadata.formats?.find(f => 
      (f.ext === 'm4a' || f.ext === 'webm') && f.acodec && f.vcodec === 'none'
    ) || metadata.formats?.find(f => f.acodec) || metadata.url;

    if (!audioFormat) {
      return res.status(404).json({ error: 'No audio format found' });
    }

    res.json({
      audioUrl: audioFormat.url || audioFormat,
      title: metadata.title,
      artist: metadata.channel || metadata.uploader || 'Unknown Artist',
      duration: metadata.duration,
      thumbnail: metadata.thumbnail
    });
  } catch (error) {
    console.error('Stream error:', error);
    res.status(500).json({ error: 'Failed to get stream URL', details: error.message, stack: error.stack });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

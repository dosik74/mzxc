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

const LASTFM_API_KEY = process.env.LASTFM_API_KEY || 'c2a61c098826bc02dd78181437242c8b';
const LASTFM_SHARED_SECRET = process.env.LASTFM_SHARED_SECRET || '4dc0ae6b48c44c7fbdce0addc5f7d6b3';
const LASTFM_API_ROOT = 'https://ws.audioscrobbler.com/2.0/';

function normalizeArtist(artist) {
  if (!artist) return 'Unknown Artist';
  if (typeof artist === 'string') return artist;
  return artist.name || artist['#text'] || 'Unknown Artist';
}

function getTrackImage(track) {
  if (!track?.image) return null;
  if (Array.isArray(track.image)) {
    const found = track.image.find((item) => ['mega', 'extralarge', 'large', 'medium'].includes(item.size));
    return found?.['#text'] || track.image[0]?.['#text'] || null;
  }
  return track.image['#text'] || null;
}

function sanitizeId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 60);
}

function buildTrackId(track) {
  const title = track.name || track.title || 'unknown';
  const artist = normalizeArtist(track.artist);
  return sanitizeId(`${title}-${artist}`);
}

async function lastFmRequest(method, params = {}) {
  const url = new URL(LASTFM_API_ROOT);
  url.searchParams.set('method', method);
  url.searchParams.set('api_key', LASTFM_API_KEY);
  url.searchParams.set('format', 'json');
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString());
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Last.fm request failed: ${response.status} ${body}`);
  }
  return response.json();
}

function normalizeLastFmTrack(track) {
  if (!track) return null;
  const title = track.name || track.title || 'Unknown Title';
  const artist = normalizeArtist(track.artist);
  const thumbnail = getTrackImage(track);
  const searchQuery = `${title} ${artist}`.trim();

  return {
    id: buildTrackId(track),
    title,
    artist,
    thumbnail,
    duration: undefined,
    url: `ytsearch1:${searchQuery}`,
    lastfmUrl: track.url || null,
    searchQuery
  };
}

async function searchLastFmTracks(query, limit = 12) {
  const data = await lastFmRequest('track.search', { track: query, limit });
  let tracks = data.results?.trackmatches?.track || [];
  if (!tracks) return [];
  if (!Array.isArray(tracks)) tracks = [tracks];
  return tracks.map(normalizeLastFmTrack).filter(Boolean);
}

async function getLastFmRecommendations(tag = 'pop', limit = 12) {
  const data = await lastFmRequest('chart.gettoptracks', { limit });
  let tracks = data.tracks?.track || [];
  if (!tracks) return [];
  if (!Array.isArray(tracks)) tracks = [tracks];
  return tracks.map(normalizeLastFmTrack).filter(Boolean);
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

    const tracks = await searchLastFmTracks(String(q), 12);
    console.log('Search results count:', tracks.length);
    res.json(tracks);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search tracks', details: error.message, stack: error.stack });
  }
});

app.get('/api/recommendations', async (req, res) => {
  console.log('Received recommendations request');
  try {
    const query = String(req.query.q || '').trim();
    const seedGenres = String(req.query.seed_genres || 'pop').split(',')[0].trim() || 'pop';
    const tracks = query ? await searchLastFmTracks(query, 12) : await getLastFmRecommendations(seedGenres, 12);
    console.log('Recommendations count:', tracks.length);
    res.json(tracks);
  } catch (error) {
    console.error('Recommendations error:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations', details: error.message });
  }
});

app.get('/api/spotify/recommendations', async (req, res) => {
  console.log('Received legacy spotify recommendations request');
  try {
    const query = String(req.query.q || '').trim();
    const seedGenres = String(req.query.seed_genres || 'pop').split(',')[0].trim() || 'pop';
    const tracks = query ? await searchLastFmTracks(query, 12) : await getLastFmRecommendations(seedGenres, 12);
    res.json(tracks);
  } catch (error) {
    console.error('Legacy recommendations error:', error);
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

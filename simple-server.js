const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT) || 3009;

const LASTFM_API_KEY = process.env.LASTFM_API_KEY || 'c2a61c098826bc02dd78181437242c8b';
const LASTFM_SHARED_SECRET = process.env.LASTFM_SHARED_SECRET || '4dc0ae6b48c44c7fbdce0addc5f7d6b3';
const LASTFM_API_ROOT = 'https://ws.audioscrobbler.com/2.0/';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client/dist')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
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

function normalizeArtist(artist) {
  if (!artist) return 'Unknown Artist';
  if (typeof artist === 'string') return artist;
  if (typeof artist === 'object') return artist.name || artist['#text'] || 'Unknown Artist';
  return String(artist);
}

function getTrackImage(track) {
  if (!track?.image) return null;
  if (Array.isArray(track.image)) {
    const found = track.image.find((item) => item.size === 'mega' || item.size === 'extralarge' || item.size === 'large' || item.size === 'medium');
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
  if (!track) return null;
  if (track.mbid) return track.mbid;
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

  console.log('Last.fm request:', url.toString());
  const response = await fetch(url.toString());
  console.log('Last.fm response status:', response.status);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Last.fm request failed: ${response.status} ${body}`);
  }
  return response.json();
}

async function normalizeLastFmTrackAsync(track) {
  if (!track) return null;
  const title = track.name || track.title || 'Unknown Title';
  const artist = normalizeArtist(track.artist);
  let thumbnail = getTrackImage(track);
  const searchQuery = `${title} ${artist}`.trim();

  // If thumbnail missing, try fetching detailed track info from Last.fm
  if (!thumbnail) {
    try {
      const info = await lastFmRequest('track.getInfo', { track: title, artist });
      if (info && info.track) {
        thumbnail = getTrackImage(info.track) || thumbnail;
      }
    } catch (err) {
      // ignore failures to avoid breaking search
      console.warn('Failed to fetch track.getInfo for', title, artist, err.message || err);
    }
  }

  return {
    id: buildTrackId(track),
    title,
    artist,
    thumbnail,
    duration: undefined,
    url: `ytsearch1:${searchQuery}`,
    searchQuery,
    lastfmUrl: track.url || track['url'] || null,
    source: 'lastfm'
  };
}

async function searchLastFmTracks(query, limit = 12) {
  const data = await lastFmRequest('track.search', { track: query, limit });
  let tracks = data.results?.trackmatches?.track || [];
  if (!tracks) return [];
  if (!Array.isArray(tracks)) {
    tracks = [tracks];
  }
  const normalized = await Promise.all(tracks.map(normalizeLastFmTrackAsync));
  return normalized.filter(Boolean);
}

function normalizeYoutubeTrack(item, query) {
  if (!item) return null;
  const title = item.title || item.fulltitle || 'Unknown Title';
  const artist = item.artist || item.uploader || item.channel || 'YouTube';
  const id = item.id || item.video_id || item.url || title;
  const thumbnail = item.thumbnail || (Array.isArray(item.thumbnails) ? item.thumbnails[item.thumbnails.length - 1]?.url : null) || null;
  const duration = Number(item.duration) || undefined;
  const url = item.webpage_url || item.url || (item.id ? `https://www.youtube.com/watch?v=${item.id}` : null);

  return {
    id: sanitizeId(id),
    title,
    artist,
    thumbnail,
    duration,
    url,
    searchQuery: query,
    source: 'youtube'
  };
}

async function searchYoutubeVideos(query, limit = 12) {
  const source = `ytsearch${limit}:${query}`;
  try {
    const stdout = await execFileAsync(ytDlpPath, [
      source,
      '--dump-json',
      '--no-warnings',
      '--skip-download',
      '--ignore-errors'
    ]);
    const lines = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const tracks = lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (err) {
          return null;
        }
      })
      .filter(Boolean)
      .map((item) => normalizeYoutubeTrack(item, query))
      .filter(Boolean);

    return tracks;
  } catch (error) {
    console.error('YouTube search error:', error);
    return [];
  }
}

async function getLastFmRecommendations(tag = 'pop', limit = 12) {
  const data = await lastFmRequest('chart.gettoptracks', { limit });
  let tracks = data.tracks?.track || [];
  if (!tracks) return [];
  if (!Array.isArray(tracks)) {
    tracks = [tracks];
  }
  const normalized = await Promise.all(tracks.map(normalizeLastFmTrackAsync));
  return normalized.filter(Boolean);
}

app.get('/api/search', async (req, res) => {
  console.log('Received search request for:', req.query.q, 'lastfm:', req.query.lastfm);
  try {
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }
    const useLastFm = String(req.query.lastfm || '').toLowerCase() === 'true';
    const tracks = useLastFm ? await searchLastFmTracks(q, 12) : await searchYoutubeVideos(q, 12);
    console.log('Search results count:', tracks.length);
    res.json(tracks);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search tracks', details: error.message, stack: error.stack });
  }
});

async function fetchRecommendations(req) {
  const query = String(req.query.q || '').trim();
  const seed = String(req.query.seed_genres || 'pop').split(',')[0].trim() || 'pop';
  return query ? await searchLastFmTracks(query, 12) : await getLastFmRecommendations(seed, 12);
}

app.get('/api/recommendations', async (req, res) => {
  console.log('Received recommendations request');
  try {
    const tracks = await fetchRecommendations(req);
    console.log('Recommendations count:', tracks.length);
    res.json(tracks);
  } catch (error) {
    console.error('Recommendations error:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations', details: error.message, stack: error.stack });
  }
});

app.get('/api/spotify/recommendations', async (req, res) => {
  console.log('Received legacy spotify recommendations request');
  try {
    const tracks = await fetchRecommendations(req);
    res.json(tracks);
  } catch (error) {
    console.error('Legacy recommendations error:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations', details: error.message, stack: error.stack });
  }
});

app.get('/api/stream', async (req, res) => {
  const sourceValue = String(req.query.url || req.query.query || '').trim();
  console.log('Received stream request for source:', sourceValue);

  if (!sourceValue) {
    return res.status(400).json({ error: 'URL or query parameter is required' });
  }

  const source = sourceValue.startsWith('http') || sourceValue.startsWith('ytsearch')
    ? sourceValue
    : `ytsearch1:${sourceValue}`;

  try {
    console.log('Executing yt-dlp with:', [source, '--dump-json', '-f', 'bestaudio[ext=m4a]/bestaudio']);
    const { stdout, stderr } = await execFileAsync(ytDlpPath, [
      source,
      '--dump-json',
      '-f', 'bestaudio[ext=m4a]/bestaudio'
    ]);
    if (stderr) console.log('yt-dlp stderr:', stderr);

    const metadata = JSON.parse(stdout);
    const audioFormat = (metadata.formats || []).find(f =>
      (f.ext === 'm4a' || f.ext === 'webm') && f.acodec && f.vcodec === 'none'
    ) || (metadata.formats || []).find(f => f.acodec) || metadata.url;

    if (!audioFormat) {
      return res.status(404).json({ error: 'No audio format found' });
    }

    res.json({
      audioUrl: audioFormat.url || audioFormat,
      title: metadata.title,
      artist: metadata.channel || metadata.uploader || 'Unknown Artist',
      duration: metadata.duration,
      thumbnail: metadata.thumbnail || (Array.isArray(metadata.thumbnails) && metadata.thumbnails[0]?.url) || null
    });
  } catch (error) {
    console.error('Stream error:', error);
    res.status(500).json({ error: 'Failed to get stream URL', details: error.message, stack: error.stack });
  }
});

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
});

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

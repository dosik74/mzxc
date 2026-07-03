const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT) || 3009;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/spot';

// ===== DATABASE SETUP =====
mongoose.connect(MONGO_URI).catch(err => console.error('MongoDB connection error:', err));

// Схема для истории прослушиваний
const ListeningHistorySchema = new mongoose.Schema({
  trackId: { type: String, required: true },
  title: String,
  artist: String,
  videoUrl: String,
  startTime: { type: Date, default: Date.now },
  startSecond: { type: Number, default: 0 },
  duration: Number,
  playedSeconds: Number,
  status: { type: String, enum: ['playing', 'paused', 'completed', 'skipped'], default: 'playing' },
  percentage: { type: Number, default: 0 },
});

const ListeningHistory = mongoose.model('ListeningHistory', ListeningHistorySchema);

// ===== CONFIG =====
const LASTFM_API_KEY = process.env.LASTFM_API_KEY || 'c2a61c098826bc02dd78181437242c8b';
const LASTFM_SHARED_SECRET = process.env.LASTFM_SHARED_SECRET || '4dc0ae6b48c44c7fbdce0addc5f7d6b3';
const LASTFM_API_ROOT = 'https://ws.audioscrobbler.com/2.0/';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client/dist')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
});

// ===== YT-DLP SETUP =====
let ytDlpPath = 'yt-dlp';
const localYtDlpPath = path.join(__dirname, 'bin', 'yt-dlp.exe');
if (fs.existsSync(localYtDlpPath)) {
  ytDlpPath = localYtDlpPath;
  console.log('Using local yt-dlp at:', ytDlpPath);
}

const execFileAsync = promisify(execFile);

// ===== UTILITY FUNCTIONS =====
function normalizeArtist(artist) {
  if (!artist) return 'Unknown Artist';
  if (typeof artist === 'string') return artist;
  if (typeof artist === 'object') return artist.name || artist['#text'] || 'Unknown Artist';
  return String(artist);
}

function sanitizeId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 60);
}

// ===== LAST.FM =====
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

  try {
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Last.fm error: ${response.status}`);
    return response.json();
  } catch (err) {
    console.error('Last.fm request failed:', err.message);
    return null;
  }
}

function getTrackImage(track) {
  if (!track?.image) return null;
  if (Array.isArray(track.image)) {
    const found = track.image.find((item) => item.size === 'mega' || item.size === 'extralarge' || item.size === 'large' || item.size === 'medium');
    return found?.['#text'] || track.image[0]?.['#text'] || null;
  }
  return track.image['#text'] || null;
}

// ===== YOUTUBE STREAMING =====
/**
 * Получить прямую ссылку для стриминга аудио из YouTube видео
 */
async function getYoutubeStreamUrl(videoUrl) {
  try {
    const { stdout } = await execFileAsync(ytDlpPath, [
      videoUrl,
      '-f', 'bestaudio/best',
      '--no-warnings',
      '-j',
      '--skip-download',
    ]);
    
    const info = JSON.parse(stdout);
    
    if (info.url) {
      return {
        url: info.url,
        ext: info.ext || 'mp4',
        duration: info.duration || null,
        thumbnail: info.thumbnail || null,
      };
    }
    
    if (info.formats && info.formats.length > 0) {
      const audioFormat = info.formats.find(f => f.vcodec === 'none' && f.acodec !== 'none') || info.formats[info.formats.length - 1];
      if (audioFormat && audioFormat.url) {
        return {
          url: audioFormat.url,
          ext: audioFormat.ext || 'mp4',
          duration: info.duration || null,
          thumbnail: info.thumbnail || null,
        };
      }
    }
    
    console.warn('No suitable audio stream found for:', videoUrl);
    return null;
  } catch (error) {
    console.error('Failed to get stream URL:', error.message);
    return null;
  }
}

/**
 * Поиск YouTube видео по запросу
 */
async function searchYoutubeVideos(query, limit = 12) {
  const source = `ytsearch${limit}:${query}`;
  try {
    console.log(`Searching YouTube: "${query}"`);
    const { stdout } = await execFileAsync(ytDlpPath, [
      source,
      '--dump-json',
      '--no-warnings',
      '--skip-download',
      '--ignore-errors',
      '-f', 'bestaudio/best',
    ], { maxBuffer: 10 * 1024 * 1024 });  // 10MB buffer

    const lines = stdout.split('\n').filter(line => line.trim());
    const tracks = [];

    for (const line of lines) {
      try {
        const item = JSON.parse(line);
        if (!item || !item.id) continue;

        const track = {
          id: sanitizeId(item.id),
          title: item.title || item.fulltitle || 'Unknown Title',
          artist: item.uploader || item.channel || 'YouTube',
          thumbnail: item.thumbnail || (item.thumbnails?.[item.thumbnails.length - 1]?.url) || null,
          duration: item.duration || null,
          url: item.webpage_url || item.url || `https://www.youtube.com/watch?v=${item.id}`,
          videoId: item.id,
          searchQuery: query,
          source: 'youtube',
        };
        tracks.push(track);
      } catch (err) {
        console.warn('Parse error on line:', line.substring(0, 100));
      }
    }

    console.log(`Found ${tracks.length} YouTube results for "${query}"`);
    return tracks;
  } catch (error) {
    console.error('YouTube search error:', error.message);
    return [];
  }
}

// ===== API ENDPOINTS =====

/**
 * Поиск треков по YouTube
 */
app.get('/api/search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  
  if (!query) {
    return res.status(400).json({ error: 'Query required' });
  }

  try {
    const tracks = await searchYoutubeVideos(query, 12);
    res.json(tracks);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed', details: error.message });
  }
});

/**
 * Получить прямую ссылку для стриминга видео
 */
app.get('/api/stream/:videoId', async (req, res) => {
  const { videoId } = req.params;

  if (!videoId) {
    return res.status(400).json({ error: 'Video ID required' });
  }

  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const streamInfo = await getYoutubeStreamUrl(videoUrl);

    if (!streamInfo) {
      return res.status(404).json({ error: 'Could not get stream URL' });
    }

    res.json(streamInfo);
  } catch (error) {
    console.error('Stream URL error:', error);
    res.status(500).json({ error: 'Failed to get stream', details: error.message });
  }
});

/**
 * Сохранить событие прослушивания
 */
app.post('/api/listening-history', async (req, res) => {
  const { trackId, title, artist, videoUrl, startSecond = 0, duration, playedSeconds, status } = req.body;

  if (!trackId) {
    return res.status(400).json({ error: 'Track ID required' });
  }

  try {
    const percentage = duration && playedSeconds ? (playedSeconds / duration) * 100 : 0;

    const history = new ListeningHistory({
      trackId,
      title,
      artist,
      videoUrl,
      startSecond,
      duration,
      playedSeconds,
      status,
      percentage,
    });

    await history.save();

    res.json({ success: true, id: history._id });
  } catch (error) {
    console.error('Save listening history error:', error);
    res.status(500).json({ error: 'Failed to save history', details: error.message });
  }
});

/**
 * Получить историю прослушиваний
 */
app.get('/api/listening-history', async (req, res) => {
  const { limit = 50, skip = 0 } = req.query;

  try {
    const history = await ListeningHistory.find()
      .sort({ startTime: -1 })
      .limit(Number(limit))
      .skip(Number(skip))
      .exec();

    const total = await ListeningHistory.countDocuments();

    res.json({ history, total });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

/**
 * Получить статистику по трекам
 */
app.get('/api/listening-stats', async (req, res) => {
  try {
    const stats = await ListeningHistory.aggregate([
      {
        $group: {
          _id: '$trackId',
          title: { $first: '$title' },
          artist: { $first: '$artist' },
          plays: { $sum: 1 },
          totalTime: { $sum: '$playedSeconds' },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          skipped: { $sum: { $cond: [{ $eq: ['$status', 'skipped'] }, 1, 0] } },
        },
      },
      { $sort: { plays: -1 } },
      { $limit: 50 },
    ]);

    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

/**
 * Тестовый endpoint
 */
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Server running!', time: new Date().toISOString() });
});

// ===== SERVER START =====
app.listen(PORT, () => {
  console.log(`\n✅ Server running on http://localhost:${PORT}`);
  console.log(`📊 Search: GET /api/search?q=query`);
  console.log(`🎵 Stream: GET /api/stream/:videoId`);
  console.log(`📝 History: POST /api/listening-history`);
  console.log(`📈 Stats: GET /api/listening-stats\n`);
});

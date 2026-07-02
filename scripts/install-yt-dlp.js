const https = require('https');
const fs = require('fs');
const path = require('path');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const YT_DLP_PATH = path.join(BIN_DIR, 'yt-dlp.exe');

if (!fs.existsSync(BIN_DIR)) {
  fs.mkdirSync(BIN_DIR, { recursive: true });
}

console.log('Downloading yt-dlp...');

const downloadUrl = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    const request = https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        return downloadUrl(response.headers.location, dest).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to download yt-dlp: ${response.statusCode}`));
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close(() => resolve());
      });
    });
    
    request.on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
};

downloadUrl('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', YT_DLP_PATH)
  .then(() => {
    console.log('yt-dlp downloaded successfully to', YT_DLP_PATH);
    console.log('File size:', fs.statSync(YT_DLP_PATH).size, 'bytes');
  })
  .catch((err) => {
    console.error('Error downloading yt-dlp:', err);
  });

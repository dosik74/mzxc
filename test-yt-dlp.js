const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

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

console.log('Testing yt-dlp search...');
runYtDlp(['ytsearch5:test', '--dump-json', '--flat-playlist', '--no-playlist'])
  .then(stdout => {
    console.log('Success! Output length:', stdout.length);
    const results = stdout.trim().split('\n').filter(line => line);
    console.log('Results count:', results.length);
    results.forEach((line, i) => {
      const video = JSON.parse(line);
      console.log(`${i+1}. ${video.title} (${video.id})`);
    });
  })
  .catch(err => {
    console.error('Error:', err);
  });

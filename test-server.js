const express = require('express');
const app = express();
const PORT = 3002;

app.get('/', (req, res) => {
  console.log('Request received at:', new Date().toISOString());
  res.send('Hello World!');
});

app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log('Waiting for requests...');
});

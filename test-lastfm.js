const fetch = require('node-fetch');
const LASTFM_API_KEY = 'c2a61c098826bc02dd78181437242c8b';
const LASTFM_API_ROOT = 'https://ws.audioscrobbler.com/2.0/';

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

    console.log('Requesting:', url.toString());
    const response = await fetch(url.toString());
    console.log('Response status:', response.status);
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Last.fm request failed: ${response.status} ${body}`);
    }
    return response.json();
}

async function test() {
    try {
        console.log('Testing chart.gettoptracks...');
        const chartData = await lastFmRequest('chart.gettoptracks', { limit: 5 });
        console.log('Chart data received:', chartData);

        console.log('\nTesting track.search...');
        const searchData = await lastFmRequest('track.search', { track: 'tame', limit: 5 });
        console.log('Search data received:', searchData);
    } catch (err) {
        console.error('Error:', err);
    }
}

test();

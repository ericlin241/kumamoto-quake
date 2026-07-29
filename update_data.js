const fs = require('fs');
const path = require('path');
const https = require('https');

const cacheFile = path.join(__dirname, 'quake_cache.json');
const staticJsFile = path.join(__dirname, 'quake_data.js');

let cachedData = [];
try {
    if (fs.existsSync(cacheFile)) {
        cachedData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    }
} catch (err) {
    console.error('Error reading cache:', err.message);
}

const options = {
    hostname: 'www.jma.go.jp',
    path: '/bosai/quake/data/list.json',
    method: 'GET',
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
};

const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        try {
            const fetchedList = JSON.parse(body);
            const eventMap = new Map();
            
            cachedData.forEach(item => {
                if (item.eid) eventMap.set(item.eid, item);
            });
            
            fetchedList.forEach(item => {
                if (item.eid) eventMap.set(item.eid, item);
            });
            
            const mergedList = Array.from(eventMap.values()).sort((a, b) => new Date(b.at) - new Date(a.at));
            const limitedList = mergedList.slice(0, 5000);
            
            fs.writeFileSync(cacheFile, JSON.stringify(limitedList));
            fs.writeFileSync(staticJsFile, 'window.KUMAMOTO_QUAKE_DATA = ' + JSON.stringify(limitedList) + ';');
            
            console.log(`Successfully updated earthquake data. Total events: ${limitedList.length}`);
        } catch (e) {
            console.error('Failed to parse JMA JSON:', e.message);
            process.exit(1);
        }
    });
});

req.on('error', (e) => {
    console.error('Error fetching from JMA:', e.message);
    process.exit(1);
});

req.end();

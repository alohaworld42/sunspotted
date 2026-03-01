const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const SITE_ID = 'f74c5722-62db-4f63-8b37-30971fd5e46c';
const TOKEN = 'nfp_xULnVZiCu9Q2BAwiWQK1FjseyDnKfPu20829';
const distDir = path.resolve(__dirname, '..', 'apps/web/dist');

function walkDir(dir, prefix) {
  const files = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relPath = (prefix || '') + '/' + entry.name;
    if (entry.isDirectory()) {
      Object.assign(files, walkDir(fullPath, relPath));
    } else {
      const content = fs.readFileSync(fullPath);
      files[relPath] = crypto.createHash('sha1').update(content).digest('hex');
    }
  }
  return files;
}

function apiRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.netlify.com',
      path: urlPath,
      method,
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { resolve(d); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function uploadFile(deployId, filePath, content) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.netlify.com',
      path: '/api/v1/deploys/' + deployId + '/files' + filePath,
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'Content-Type': 'application/octet-stream',
        'Content-Length': content.length,
      },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.write(content);
    req.end();
  });
}

async function deploy() {
  const fileHashes = walkDir(distDir);
  const fileCount = Object.keys(fileHashes).length;
  console.log('Creating deploy with ' + fileCount + ' files...');

  const result = await apiRequest('POST', '/api/v1/sites/' + SITE_ID + '/deploys', {
    files: fileHashes,
  });

  console.log('Deploy ID:', result.id);
  console.log('State:', result.state);

  const required = result.required || [];
  console.log('Files to upload:', required.length);

  if (required.length === 0) {
    console.log('All files already cached. Deploy ready.');
    console.log('URL: https://sunspotted.netlify.app');
    return;
  }

  const hashToPath = {};
  for (const [p, h] of Object.entries(fileHashes)) {
    hashToPath[h] = p;
  }

  for (const hash of required) {
    const fp = hashToPath[hash];
    if (fp === undefined) continue;
    const content = fs.readFileSync(path.join(distDir, fp));
    console.log('  Uploading: ' + fp + ' (' + content.length + ' bytes)');
    await uploadFile(result.id, fp, content);
  }

  console.log('Deploy complete!');
  console.log('URL: https://sunspotted.netlify.app');
}

deploy().catch(e => console.error('Deploy failed:', e));

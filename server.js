const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();

// Versión que cambia en cada arranque/deploy — rompe el caché de CSS/JS
const VERSION = Date.now().toString(36);
const INDEX_HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')
  .replace('./styles.css', `./styles.css?v=${VERSION}`)
  .replace('./app.js', `./app.js?v=${VERSION}`);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const r2 = process.env.CF_ACCOUNT_ID ? new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
}) : null;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const DATA_KEY = 'data.json';

function signToken() {
  const exp = Date.now() + 8 * 60 * 60 * 1000;
  const sig = crypto.createHmac('sha256', ADMIN_PASSWORD).update(String(exp)).digest('hex');
  return `${exp}.${sig}`;
}

function verifyToken(token) {
  if (!token || !ADMIN_PASSWORD) return !ADMIN_PASSWORD;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (Date.now() > parseInt(exp)) return false;
  const expected = crypto.createHmac('sha256', ADMIN_PASSWORD).update(exp).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex')); } catch { return false; }
}

async function readData() {
  if (!r2) return null;
  try {
    const res = await r2.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: DATA_KEY }));
    return JSON.parse(await res.Body.transformToString());
  } catch { return null; }
}

async function writeData(data) {
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: DATA_KEY,
    Body: JSON.stringify(data),
    ContentType: 'application/json',
  }));
}

// El HTML siempre fresco; apunta a assets versionados
app.get(['/', '/index.html'], (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(INDEX_HTML);
});

app.use(express.static(__dirname, {
  setHeaders: (res, filePath) => {
    if (/\.(css|js)$/.test(filePath)) {
      // seguros de cachear fuerte porque la URL lleva ?v=VERSION
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));
app.use(express.json());

app.get('/config.js', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('application/javascript');
  res.send(`window.__ENV__=${JSON.stringify({
    formspreeEndpoint: process.env.FORMSPREE_ENDPOINT || '',
    uploadEnabled: !!r2,
    authRequired: !!ADMIN_PASSWORD,
  })};`);
});

app.get('/api/data', async (req, res) => {
  res.json(await readData());
});

app.post('/api/data', async (req, res) => {
  if (!verifyToken(req.headers['x-admin-token'])) return res.status(401).json({ error: 'Unauthorized' });
  if (!r2) return res.status(503).json({ error: 'Storage not configured' });
  try { await writeData(req.body); res.json({ ok: true }); }
  catch { res.status(500).json({ error: 'Save failed' }); }
});

app.post('/api/auth', (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Auth not configured' });
  if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Incorrect password' });
  res.json({ token: signToken() });
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!verifyToken(req.headers['x-admin-token'])) return res.status(401).json({ error: 'Unauthorized' });
  if (!r2) return res.status(503).json({ error: 'Upload not configured' });
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
  const key = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  try {
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));
    res.json({ url: `${process.env.R2_PUBLIC_URL}/${key}` });
  } catch { res.status(500).json({ error: 'Upload failed' }); }
});

app.listen(process.env.PORT || 3000);

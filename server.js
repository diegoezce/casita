const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const crypto = require('crypto');

const app = express();
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

function signToken() {
  const exp = Date.now() + 8 * 60 * 60 * 1000;
  const sig = crypto.createHmac('sha256', ADMIN_PASSWORD).update(String(exp)).digest('hex');
  return `${exp}.${sig}`;
}

function verifyToken(token) {
  if (!token || !ADMIN_PASSWORD) return !ADMIN_PASSWORD; // if no password set, allow all
  const dot = token.lastIndexOf('.');
  if (dot < 0) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (Date.now() > parseInt(exp)) return false;
  const expected = crypto.createHmac('sha256', ADMIN_PASSWORD).update(exp).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex')); } catch { return false; }
}

app.use(express.static(__dirname));
app.use(express.json());

app.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.__ENV__=${JSON.stringify({
    formspreeEndpoint: process.env.FORMSPREE_ENDPOINT || '',
    uploadEnabled: !!r2,
    authRequired: !!ADMIN_PASSWORD,
  })};`);
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
  } catch {
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.listen(process.env.PORT || 3000);

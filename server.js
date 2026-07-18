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

app.use(express.static(__dirname));

app.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.__ENV__=${JSON.stringify({
    formspreeEndpoint: process.env.FORMSPREE_ENDPOINT || '',
    uploadEnabled: !!r2,
  })};`);
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
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

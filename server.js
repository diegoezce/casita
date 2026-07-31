const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();

// Versión que cambia en cada arranque/deploy — rompe el caché de CSS/JS
const VERSION = Date.now().toString(36);
function loadHtml(file) {
  return fs.readFileSync(path.join(__dirname, file), 'utf8')
    .replace('./styles.css', `./styles.css?v=${VERSION}`)
    .replace(`./${file.replace('.html', '.js')}`, `./${file.replace('.html', '.js')}?v=${VERSION}`);
}
const INDEX_HTML = loadHtml('index.html');
const ADMIN_HTML = loadHtml('admin.html');
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
const ROOT_SLUG = process.env.ROOT_SLUG || '';
const DATA_KEY = 'data.json';
const RESERVED_SLUGS = new Set(['api', 'admin', 'admin.html', 'app.js', 'admin.js', 'styles.css', 'favicon.svg', 'favicon.ico', 'config.js', 'index.html', 'robots.txt']);
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// --- Contraseñas de perfil: scrypt (sin dependencias nuevas, ya tenemos crypto) ---
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [, salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  try { return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(hash, 'hex')); } catch { return false; }
}

// --- Token maestro (súper-admin): abre solo /api/admin/* ---
function signMasterToken() {
  const exp = Date.now() + 8 * 60 * 60 * 1000;
  const sig = crypto.createHmac('sha256', ADMIN_PASSWORD).update(String(exp)).digest('hex');
  return `${exp}.${sig}`;
}
function verifyMasterToken(token) {
  if (!token || !ADMIN_PASSWORD) return !ADMIN_PASSWORD;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (Date.now() > parseInt(exp)) return false;
  const expected = crypto.createHmac('sha256', ADMIN_PASSWORD).update(exp).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex')); } catch { return false; }
}

// --- Token de perfil: formato distinto ("p.<slug>.<exp>.<sig>") para que nunca se confunda con el maestro ---
function signProfileToken(slug, tokenSecret) {
  const exp = Date.now() + 8 * 60 * 60 * 1000;
  const sig = crypto.createHmac('sha256', tokenSecret).update(`${slug}.${exp}`).digest('hex');
  return `p.${slug}.${exp}.${sig}`;
}
function verifyProfileToken(token, slug, tokenSecret) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'p' || parts[1] !== slug) return false;
  const exp = parts[2], sig = parts[3];
  if (Date.now() > parseInt(exp)) return false;
  const expected = crypto.createHmac('sha256', tokenSecret).update(`${slug}.${exp}`).digest('hex');
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
  const Bucket = process.env.R2_BUCKET_NAME;
  // Backup del estado anterior antes de sobrescribir (red de seguridad)
  try {
    const prev = await r2.send(new GetObjectCommand({ Bucket, Key: DATA_KEY }));
    const body = await prev.Body.transformToString();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await r2.send(new PutObjectCommand({ Bucket, Key: `backups/data-${stamp}.json`, Body: body, ContentType: 'application/json' }));
  } catch { /* primera escritura o sin anterior: seguir */ }
  await r2.send(new PutObjectCommand({
    Bucket,
    Key: DATA_KEY,
    Body: JSON.stringify(data),
    ContentType: 'application/json',
  }));
}

function getProfile(data, slug) { return (data && data.profiles && data.profiles[slug]) || null; }

// Serializa las escrituras (read-modify-write) para evitar carreras
let writeChain = Promise.resolve();
function withData(mutator) {
  const result = writeChain.then(async () => {
    const data = (await readData()) || { version: 2, profiles: {} };
    if (!data.profiles) data.profiles = {};
    const result = await mutator(data);
    await writeData(data);
    return result;
  });
  // La cadena sigue viva pase lo que pase (si un mutator falla, ej. slug duplicado,
  // no debe tumbar todas las escrituras futuras); el error real se propaga en `result`.
  writeChain = result.catch(() => {});
  return result;
}

// El HTML siempre fresco; apunta a assets versionados
app.get(['/', '/index.html'], (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(INDEX_HTML);
});
app.get('/admin.html', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(ADMIN_HTML);
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
    rootSlug: ROOT_SLUG,
  })};`);
});

// --- API pública por perfil ---
app.get('/api/p/:slug/data', async (req, res) => {
  const data = await readData();
  const profile = getProfile(data, req.params.slug);
  if (!profile) return res.status(404).json({ error: 'Not found' });
  res.json({ products: profile.products || [], settings: profile.settings || {}, phone: profile.phone || '' });
});

app.post('/api/p/:slug/auth', async (req, res) => {
  const data = await readData();
  const profile = getProfile(data, req.params.slug);
  if (!profile) return res.status(404).json({ error: 'Not found' });
  if (!verifyPassword(req.body.password, profile.passwordHash)) return res.status(401).json({ error: 'Incorrect password' });
  res.json({ token: signProfileToken(req.params.slug, profile.tokenSecret) });
});

// Auth + storage para operaciones de escritura de UN perfil
async function requireProfileAuth(req, res, next) {
  if (!r2) return res.status(503).json({ error: 'Storage not configured' });
  const data = await readData();
  const profile = getProfile(data, req.params.slug);
  if (!profile) return res.status(404).json({ error: 'Not found' });
  if (!verifyProfileToken(req.headers['x-admin-token'], req.params.slug, profile.tokenSecret)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Agregar o actualizar UN artículo (nunca reemplaza la lista entera)
app.post('/api/p/:slug/product', requireProfileAuth, async (req, res) => {
  try {
    const saved = await withData((data) => {
      const profile = getProfile(data, req.params.slug);
      if (!Array.isArray(profile.products)) profile.products = [];
      const p = req.body;
      p.id = p.id || Date.now().toString(36);
      const i = profile.products.findIndex((x) => x.id === p.id);
      if (i >= 0) profile.products[i] = p; else profile.products.unshift(p);
      return p;
    });
    res.json({ ok: true, product: saved });
  } catch { res.status(500).json({ error: 'Save failed' }); }
});

// Borrar UN artículo
app.delete('/api/p/:slug/product/:id', requireProfileAuth, async (req, res) => {
  try {
    await withData((data) => {
      const profile = getProfile(data, req.params.slug);
      profile.products = (profile.products || []).filter((x) => x.id !== req.params.id);
    });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Delete failed' }); }
});

// Guardar solo la configuración del perfil
app.put('/api/p/:slug/settings', requireProfileAuth, async (req, res) => {
  try {
    await withData((data) => {
      const profile = getProfile(data, req.params.slug);
      profile.settings = { ...profile.settings, ...req.body };
    });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Save failed' }); }
});

app.post('/api/p/:slug/upload', requireProfileAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
  const key = `${req.params.slug}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
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

// --- Auth maestra (súper-admin) ---
app.post('/api/auth', (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Auth not configured' });
  if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Incorrect password' });
  res.json({ token: signMasterToken() });
});

function requireMasterAuth(req, res, next) {
  if (!verifyMasterToken(req.headers['x-admin-token'])) return res.status(401).json({ error: 'Unauthorized' });
  if (!r2) return res.status(503).json({ error: 'Storage not configured' });
  next();
}

// --- API de súper-admin: alta y listado de perfiles ---
app.get('/api/admin/profiles', requireMasterAuth, async (req, res) => {
  const data = await readData();
  const profiles = Object.values((data && data.profiles) || {}).map((p) => ({
    slug: p.slug, name: p.name, email: p.email, phone: p.phone, createdAt: p.createdAt, productCount: (p.products || []).length,
  }));
  res.json({ profiles });
});

app.post('/api/admin/profiles', requireMasterAuth, async (req, res) => {
  const slug = String(req.body.slug || '').trim().toLowerCase();
  const { name, email, phone } = req.body;
  if (!SLUG_RE.test(slug) || slug.length < 2 || slug.length > 60) return res.status(400).json({ error: 'Slug inválido' });
  if (RESERVED_SLUGS.has(slug)) return res.status(400).json({ error: 'Slug reservado' });
  if (!name || !email || !phone) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const password = crypto.randomBytes(9).toString('base64url');
    await withData((data) => {
      if (getProfile(data, slug)) throw new Error('exists');
      data.profiles[slug] = {
        slug, name, email, phone,
        passwordHash: hashPassword(password),
        tokenSecret: crypto.randomBytes(32).toString('hex'),
        createdAt: Date.now(),
        products: [],
        settings: {},
      };
    });
    res.json({ ok: true, slug, password });
  } catch (e) {
    if (e.message === 'exists') return res.status(409).json({ error: 'Ese slug ya existe' });
    res.status(500).json({ error: 'Save failed' });
  }
});

app.post('/api/admin/profiles/:slug/reset-password', requireMasterAuth, async (req, res) => {
  try {
    const password = crypto.randomBytes(9).toString('base64url');
    const found = await withData((data) => {
      const profile = getProfile(data, req.params.slug);
      if (!profile) return false;
      profile.passwordHash = hashPassword(password);
      profile.tokenSecret = crypto.randomBytes(32).toString('hex');
      return true;
    });
    if (!found) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, password });
  } catch { res.status(500).json({ error: 'Save failed' }); }
});

// Página de cada perfil: mismo shell que "/", el cliente resuelve el slug por la URL
app.get('/:slug', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(INDEX_HTML);
});

app.listen(process.env.PORT || 3000);

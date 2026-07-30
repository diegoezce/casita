const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const Bucket = process.env.R2_BUCKET_NAME;
const DATA_KEY = 'data.json';
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set(['api', 'admin', 'admin.html', 'app.js', 'admin.js', 'styles.css', 'favicon.svg', 'favicon.ico', 'config.js', 'index.html', 'robots.txt']);

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

// Envs requeridos: CF_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME,
// MIGRATE_SLUG, MIGRATE_NAME, MIGRATE_EMAIL, MIGRATE_PHONE (recomendado: el 5491138835844 actual),
// MIGRATE_PASSWORD (opcional; recomendado: la ADMIN_PASSWORD actual para no perder la contraseña de siempre).
(async () => {
  const slug = String(process.env.MIGRATE_SLUG || '').trim().toLowerCase();
  if (!SLUG_RE.test(slug) || slug.length < 2 || slug.length > 60) throw new Error('MIGRATE_SLUG inválido');
  if (RESERVED_SLUGS.has(slug)) throw new Error('MIGRATE_SLUG reservado');
  if (!process.env.MIGRATE_NAME || !process.env.MIGRATE_EMAIL || !process.env.MIGRATE_PHONE) {
    throw new Error('Faltan MIGRATE_NAME / MIGRATE_EMAIL / MIGRATE_PHONE');
  }

  const res = await r2.send(new GetObjectCommand({ Bucket, Key: DATA_KEY }));
  const raw = await res.Body.transformToString();
  const data = JSON.parse(raw);

  if (data.profiles) {
    console.log('Ya migrado (data.json ya tiene .profiles). Nada que hacer.');
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await r2.send(new PutObjectCommand({ Bucket, Key: `backups/data-${stamp}-premigration.json`, Body: raw, ContentType: 'application/json' }));

  const password = process.env.MIGRATE_PASSWORD || crypto.randomBytes(9).toString('base64url');
  const migrated = {
    version: 2,
    profiles: {
      [slug]: {
        slug,
        name: process.env.MIGRATE_NAME,
        email: process.env.MIGRATE_EMAIL,
        phone: process.env.MIGRATE_PHONE,
        passwordHash: hashPassword(password),
        tokenSecret: crypto.randomBytes(32).toString('hex'),
        createdAt: Date.now(),
        products: data.products || [],
        settings: data.settings || {},
      },
    },
  };

  await r2.send(new PutObjectCommand({ Bucket, Key: DATA_KEY, Body: JSON.stringify(migrated), ContentType: 'application/json' }));

  console.log('OK. Perfil creado:', slug, 'con', migrated.profiles[slug].products.length, 'artículos.');
  if (!process.env.MIGRATE_PASSWORD) console.log('Contraseña generada (guardala, no se vuelve a mostrar):', password);
  console.log('Recordá setear ROOT_SLUG=' + slug + ' en el deploy para que "/" siga mostrando este perfil.');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });

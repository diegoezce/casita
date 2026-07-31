// Migra data.json al formato root store (app.js v3+).
// Detecta el formato actual y mueve los artículos a data.root sin pérdida.
// Es idempotente: si data.root ya existe con artículos, no hace nada.
//
// Uso:
//   CF_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
//   R2_BUCKET_NAME=... node scripts/migrate-root.js
//
// Opcional: ROOT_SLUG=<tu-slug> para migrar desde un perfil existente en lugar
// de desde el formato global viejo.

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const Bucket = process.env.R2_BUCKET_NAME;
const DATA_KEY = 'data.json';

(async () => {
  const res = await r2.send(new GetObjectCommand({ Bucket, Key: DATA_KEY }));
  const raw = await res.Body.transformToString();
  const data = JSON.parse(raw);

  // Ya migrado
  if (data.root && Array.isArray(data.root.products) && data.root.products.length > 0) {
    console.log('Ya migrado: data.root tiene', data.root.products.length, 'artículos. Nada que hacer.');
    return;
  }

  let products = [];
  let settings = {};
  let phone = '';
  let source = '';

  const rootSlug = process.env.ROOT_SLUG || '';

  if (rootSlug && data.profiles && data.profiles[rootSlug]) {
    // Viene de migrate-multitenant.js — ya estaba en perfil
    const profile = data.profiles[rootSlug];
    products = profile.products || [];
    settings = profile.settings || {};
    phone = profile.phone || '';
    source = `perfil "${rootSlug}"`;
    // Borrar ese perfil ya que ahora vive en root
    delete data.profiles[rootSlug];
  } else if (!data.profiles && Array.isArray(data.products)) {
    // Formato global viejo (pre-multi-tenant)
    products = data.products || [];
    settings = data.settings || {};
    phone = data.phone || '';
    source = 'formato global viejo';
    delete data.products;
    delete data.settings;
    delete data.phone;
  } else {
    console.log('No se detectó nada para migrar. Estado actual:', JSON.stringify(Object.keys(data)));
    return;
  }

  // Backup primero
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await r2.send(new PutObjectCommand({
    Bucket,
    Key: `backups/data-${stamp}-pre-root-migration.json`,
    Body: raw,
    ContentType: 'application/json',
  }));

  data.root = { products, settings, phone };
  if (!data.version) data.version = 2;
  if (!data.profiles) data.profiles = {};

  await r2.send(new PutObjectCommand({
    Bucket,
    Key: DATA_KEY,
    Body: JSON.stringify(data),
    ContentType: 'application/json',
  }));

  console.log(`OK. ${products.length} artículos migrados desde ${source} → data.root.`);
  console.log('Backup guardado en backups/data-' + stamp + '-pre-root-migration.json');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });

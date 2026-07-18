const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const Bucket = process.env.R2_BUCKET_NAME;
const BASE = 'https://pub-5e1ee65028f34a70accacbbd9a2c1b34.r2.dev/';
const id = () => Math.random().toString(36).slice(2, 10);

// Artículos a recuperar (leídos de RESTORE_JSON env, con keys de imágenes)
const toRestore = JSON.parse(process.env.RESTORE_JSON);

(async () => {
  const res = await r2.send(new GetObjectCommand({ Bucket, Key: 'data.json' }));
  const raw = await res.Body.transformToString();
  const data = JSON.parse(raw);

  // backup previo
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await r2.send(new PutObjectCommand({ Bucket, Key: `backups/data-${stamp}-prerestore.json`, Body: raw, ContentType: 'application/json' }));

  for (const item of toRestore) {
    if (data.products.some(p => p.name === item.name)) { console.log('ya existe, salteo:', item.name); continue; }
    const images = item.imageKeys.map(k => BASE + k);
    const prod = { id: id(), name: item.name, price: item.price, condition: item.condition, status: item.status || 'disponible', images, image: images[0], description: item.description };
    data.products.unshift(prod);
    console.log('agregado:', item.name, '(' + images.length + ' fotos)');
  }

  await r2.send(new PutObjectCommand({ Bucket, Key: 'data.json', Body: JSON.stringify(data), ContentType: 'application/json' }));
  console.log('OK. total productos ahora:', data.products.length);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });

const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const Bucket = process.env.R2_BUCKET_NAME;

(async () => {
  // 1. todos los objetos del bucket
  let objects = [], token;
  do {
    const r = await r2.send(new ListObjectsV2Command({ Bucket, ContinuationToken: token }));
    (r.Contents || []).forEach(o => objects.push({ key: o.Key, size: o.Size, mod: o.LastModified }));
    token = r.IsTruncated ? r.NextContinuationToken : null;
  } while (token);

  // 2. data.json actual (multi-tenant: iterar todos los perfiles)
  const res = await r2.send(new GetObjectCommand({ Bucket, Key: 'data.json' }));
  const data = JSON.parse(await res.Body.transformToString());
  const profiles = Object.values(data.profiles || {});
  const referenced = new Set();
  let totalProducts = 0;
  profiles.forEach(profile => {
    const products = profile.products || [];
    totalProducts += products.length;
    console.log(`  perfil ${profile.slug}: ${products.length} productos`);
    products.forEach(p => {
      (p.images || []).forEach(u => referenced.add(u.split('/').pop()));
      if (p.image) referenced.add(p.image.split('/').pop());
    });
  });

  const imageObjs = objects.filter(o => /\.(jpe?g|png|webp|gif|heic)$/i.test(o.key));
  const orphans = imageObjs.filter(o => !referenced.has(o.key));

  console.log('=== data.json: perfiles =', profiles.length, '| productos totales =', totalProducts);
  console.log('=== imágenes en bucket =', imageObjs.length, '| referenciadas =', referenced.size);
  console.log('\n=== HUÉRFANAS (subidas pero NO en ningún artículo actual):', orphans.length);
  orphans.sort((a, b) => a.mod - b.mod).forEach(o => {
    console.log(`  ${o.mod.toISOString()}  ${o.key}  (${(o.size/1024).toFixed(0)}kb)`);
  });

  // 3. ¿hay copias de data.json? (backups)
  const jsons = objects.filter(o => o.key.endsWith('.json'));
  console.log('\n=== archivos .json en bucket:');
  jsons.forEach(o => console.log(`  ${o.mod.toISOString()}  ${o.key}`));
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });

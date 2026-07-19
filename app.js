const defaultProducts = [
  { id: 'chair', name: 'Silla Cesca', price: '120.000', condition: 'Muy buen estado', status: 'disponible', images: ['https://images.unsplash.com/photo-1551298370-9d3d53740c72?auto=format&fit=crop&w=1000&q=85'], description: 'Silla con estructura cromada y asiento de esterilla. Cómoda, firme y con apenas algunas marcas de uso normales.' },
  { id: 'lamp', name: 'Lámpara de mesa', price: '48.000', condition: 'Como nueva', status: 'disponible', images: ['https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1000&q=85'], description: 'Lámpara de metal esmaltado color crema. Funciona perfecto e incluye pantalla y cable original.' },
  { id: 'camera', name: 'Cámara analógica', price: '75.000', condition: 'Buen estado', status: 'reservado', images: ['https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1000&q=85'], description: 'Cámara de 35 mm con lente incluido. No fue probada recientemente, por eso se entrega tal cual está.' },
  { id: 'rug', name: 'Alfombra tejida', price: '60.000', condition: 'Muy buen estado', status: 'disponible', images: ['https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&w=1000&q=85'], description: 'Alfombra de lana tejida a mano, en tonos arena y negro. Medidas aproximadas: 1,60 × 2,30 m.' },
  { id: 'table', name: 'Mesa auxiliar', price: '55.000', condition: 'Con detalles', status: 'vendido', images: ['https://images.unsplash.com/photo-1533090368676-1fd25485db88?auto=format&fit=crop&w=1000&q=85'], description: 'Mesa baja de madera maciza. Tiene pequeñas marcas en la tapa que se ven en las fotos.' },
  { id: 'speaker', name: 'Parlante portátil', price: '32.000', condition: 'Muy buen estado', status: 'disponible', images: ['https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=1000&q=85'], description: 'Parlante Bluetooth compacto. Batería de larga duración, cargador incluido y buen sonido.' }
];
const defaults = { storeName: 'casita.', storeIntro: 'Una selección personal de artículos que ya no uso, pero que todavía tienen mucho para dar.', mpAlias: '', mpCVU: '', mpNombre: '' };
const serverEnv = window.__ENV__ || {};
let products = defaultProducts;
let settings = { ...defaults };
let activeFilter = 'todos';
let editImages = [];
const $ = (selector) => document.querySelector(selector);
const grid = $('#productGrid');
const token = () => sessionStorage.getItem('casita-token') || '';
const getImages = (p) => p.images?.length ? p.images : (p.image ? [p.image] : []);

async function apiWrite(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) { alert('No se pudo guardar. Revisá tu conexión e intentá de nuevo.'); throw new Error('save failed'); }
  return r.json();
}
const apiSaveProduct = (p) => apiWrite('POST', '/api/product', p);
const apiDeleteProduct = (id) => apiWrite('DELETE', '/api/product/' + id);
const apiSaveSettings = (s) => apiWrite('PUT', '/api/settings', s);
// Precio: se guarda como número entero (pesos). parsePrice tolera datos viejos
// (strings tipo "150.000") y valores no numéricos (ej. "Consultar" -> null).
function parsePrice(v) { if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null; const d = String(v ?? '').replace(/\D/g, ''); return d ? parseInt(d, 10) : null; }
function formatMiles(n) { return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function formatPrice(price) { const n = parsePrice(price); return n == null ? 'Consultar' : '$ ' + formatMiles(n); }
function statusLabel(status) { return status === 'disponible' ? 'Disponible' : status === 'reservado' ? 'Reservado' : 'Vendido'; }
function renderProducts() {
  const visible = activeFilter === 'todos' ? products : products.filter(p => p.status === activeFilter);
  grid.innerHTML = visible.map(p => { const img = getImages(p)[0] || ''; return `<button class="product-card" type="button" data-id="${p.id}"><span class="badge ${p.status}">${statusLabel(p.status)}</span><img class="product-image" src="${img}" alt="${p.name}" loading="lazy" decoding="async"/><span class="product-meta"><span><span class="product-name">${p.name}</span> <span class="product-condition">${p.condition}</span></span><span class="product-price">${formatPrice(p.price)}</span></span></button>`; }).join('');
  $('#emptyState').classList.toggle('hidden', visible.length > 0); $('#totalCount').textContent = products.length;
}
function renderAdmin() { renderMetrics(); $('#adminList').innerHTML = products.map(p => { const img = getImages(p)[0] || ''; return `<div class="admin-row"><img src="${img}" alt=""><div class="row-info"><p>${p.name}</p><small>${statusLabel(p.status)} · ${formatPrice(p.price)}</small></div><div class="row-actions"><button class="icon-button edit-item" data-id="${p.id}" type="button">Editar</button><button class="icon-button delete-item" data-id="${p.id}" type="button">Eliminar</button></div></div>`; }).join(''); }
function renderMetrics() { const box = $('#adminMetrics'); if (!box) return; const g = { disponible: { n: 0, s: 0 }, reservado: { n: 0, s: 0 }, vendido: { n: 0, s: 0 } }; products.forEach(p => { const x = g[p.status]; if (!x) return; x.n++; const v = parsePrice(p.price); if (v) x.s += v; }); const total = { n: products.length, s: g.disponible.s + g.reservado.s + g.vendido.s }; const chip = (label, o, cls) => `<div class="metric ${cls}"><span class="metric-label">${label}</span><span class="metric-val">$ ${formatMiles(o.s)}</span><span class="metric-count">${o.n} ${o.n === 1 ? 'artículo' : 'artículos'}</span></div>`; box.innerHTML = chip('Disponible', g.disponible, 'm-disp') + chip('Reservado', g.reservado, 'm-res') + chip('Vendido', g.vendido, 'm-vend') + chip('Total', total, 'm-total'); }
function renderImageList() { $('#imageList').innerHTML = editImages.map((url, i) => `<div class="img-entry"><img src="${url}" class="img-thumb" /><button class="remove-img" type="button" data-i="${i}">×</button></div>`).join(''); }
function applySettings() { $('.brand').innerHTML = settings.storeName.replace('.', '<span class="brand-dot">.</span>'); document.title = `${settings.storeName.replace('.', '')} — artículos con historia`; $('.intro').textContent = settings.storeIntro; $('#storeName').value = settings.storeName; $('#storeIntro').value = settings.storeIntro; $('#mpAlias').value = settings.mpAlias || ''; $('#mpCVU').value = settings.mpCVU || ''; $('#mpNombre').value = settings.mpNombre || ''; if (!serverEnv.uploadEnabled) $('#uploadBtn').style.display = 'none'; }
async function compressImage(file, maxDim = 1600, quality = 0.8) {
  if (!file.type.startsWith('image/')) return file;
  try {
    // imageOrientation:'from-image' respeta la rotación EXIF del celular
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    let { width, height } = bitmap;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    width = Math.round(width * scale); height = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file; // si no achicó, usar original
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return file; } // fallback: subir sin comprimir
}
async function uploadImage(file) { const fd = new FormData(); fd.append('file', file); const r = await fetch('/api/upload', { method: 'POST', body: fd, headers: { 'x-admin-token': token() } }); if (!r.ok) throw new Error('Upload failed'); return (await r.json()).url; }
document.addEventListener('change', async e => {
  if (e.target.id !== 'itemImageFile') return;
  const files = Array.from(e.target.files);
  if (!files.length) return;
  const status = $('#uploadStatus');
  status.textContent = 'Optimizando y subiendo…';
  try {
    for (const file of files) { editImages.push(await uploadImage(await compressImage(file))); }
    renderImageList(); status.textContent = '✓'; e.target.value = '';
  } catch { status.textContent = 'Error al subir'; }
});
function mpCard() { const { mpAlias, mpCVU, mpNombre } = settings; if (!mpAlias && !mpCVU) return ''; return `<div class="mp-card"><p class="mp-label">Mercado Pago</p>${mpAlias ? `<div class="mp-row"><span>Alias</span><button class="mp-copy" type="button" data-copy="${mpAlias}">${mpAlias} <span class="mp-copy-hint">copiar</span></button></div>` : ''}${mpCVU ? `<div class="mp-row"><span>CVU</span><button class="mp-copy" type="button" data-copy="${mpCVU}">${mpCVU} <span class="mp-copy-hint">copiar</span></button></div>` : ''}${mpNombre ? `<div class="mp-row"><span>A nombre de</span><span>${mpNombre}</span></div>` : ''}</div>`; }
function waLink(productName, price) { const text = encodeURIComponent(`Hola! Me interesa "${productName}" (${formatPrice(price)}) que vi en casita.`); return `https://wa.me/5491138835844?text=${text}`; }
function makeCarousel(images, alt) {
  const hint = `<span class="zoom-hint">Tocá para ampliar</span>`;
  if (images.length <= 1) return `<div class="carousel-wrap"><img class="detail-img" src="${images[0]||''}" alt="${alt}">${hint}</div>`;
  const slides = images.map((img,i) => `<img class="carousel-slide" src="${img}" alt="${alt}" data-idx="${i}">`).join('');
  const dots = images.map((_,i) => `<button class="cdot${i===0?' active':''}" type="button" data-dot="${i}" aria-label="Foto ${i+1}"></button>`).join('');
  return `<div class="carousel-wrap"><div class="carousel" id="detailCarousel">${slides}</div>${hint}<div class="carousel-nav"><button class="carousel-prev" type="button" aria-label="Anterior">&#8249;</button><div class="cdots">${dots}</div><button class="carousel-next" type="button" aria-label="Siguiente">&#8250;</button></div></div>`;
}
function openLightbox(src) {
  // dialog + showModal para quedar en el top-layer, por encima del detalle
  const box = document.createElement('dialog');
  box.className = 'lightbox';
  box.innerHTML = `<img src="${src}" alt=""><button class="lightbox-close" type="button" aria-label="Cerrar">×</button>`;
  document.body.appendChild(box);
  box.showModal();
  box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('.lightbox-close')) box.close(); });
  box.addEventListener('close', () => box.remove());
}
function showProduct(id) {
  const p = products.find(item => item.id === id); if (!p) return;
  const available = p.status === 'disponible';
  const images = getImages(p);
  const imgHtml = makeCarousel(images, p.name);
  const form = `<form class="purchase-form" id="purchaseForm"><input type="hidden" name="articulo" value="${p.name}"><input type="hidden" name="precio" value="${formatPrice(p.price)}"><input type="hidden" name="estado" value="${statusLabel(p.status)}"><label>Tu nombre<input name="nombre" required autocomplete="name" placeholder="¿Cómo te llamás?" /></label><label>Tu email<input name="email" required type="email" autocomplete="email" placeholder="tu@email.com" /></label><label>Mensaje (opcional)<textarea name="mensaje" rows="2" placeholder="Ej. ¿Se puede retirar el sábado?"></textarea></label><button class="buy-button" type="submit">Enviar consulta ↗</button><p class="form-feedback" id="formFeedback"></p></form>`;
  const waBtn = available ? `<a class="wa-button" href="${waLink(p.name, p.price)}" target="_blank" rel="noopener noreferrer">Consultar por WhatsApp ↗</a>` : '';
  $('#productDetail').innerHTML = `<div class="detail-layout">${imgHtml}<div class="detail-copy"><p class="status-line ${p.status}">${statusLabel(p.status)}</p><h2>${p.name}</h2><p class="detail-price">${formatPrice(p.price)}</p><p class="product-condition">${p.condition}</p><p class="detail-description">${p.description}</p>${waBtn}${available ? form : `<span class="buy-button" aria-disabled="true">${statusLabel(p.status)}</span>`}${available ? mpCard() : ''}</div></div>`;
  const car = document.getElementById('detailCarousel');
  if (car) car.addEventListener('scroll', () => {
    const idx = Math.round(car.scrollLeft / car.clientWidth);
    document.querySelectorAll('.cdot').forEach((d,i) => d.classList.toggle('active', i===idx));
  }, { passive: true });
  $('#productDialog').showModal();
}
function resetForm() { $('#itemForm').reset(); $('#editId').value = ''; $('#formHeading').textContent = 'Agregar artículo'; $('#cancelEdit').classList.add('hidden'); editImages = []; renderImageList(); }
function editProduct(id) { const p = products.find(item => item.id === id); if (!p) return; $('#editId').value=p.id; $('#itemName').value=p.name; $('#itemPrice').value=(parsePrice(p.price)!=null?formatMiles(parsePrice(p.price)):''); $('#itemCondition').value=p.condition; $('#itemStatus').value=p.status; $('#itemDescription').value=p.description; editImages=[...getImages(p)]; renderImageList(); $('#formHeading').textContent='Editar artículo'; $('#cancelEdit').classList.remove('hidden'); $('#itemName').focus(); }

document.addEventListener('click', (e) => {
  const copy=e.target.closest('.mp-copy'); if(copy){ navigator.clipboard.writeText(copy.dataset.copy); const hint=copy.querySelector('.mp-copy-hint'); if(hint){const orig=hint.textContent; hint.textContent='✓'; setTimeout(()=>hint.textContent=orig,1500);} return; }
  const removeImg=e.target.closest('.remove-img'); if(removeImg){ editImages.splice(parseInt(removeImg.dataset.i),1); renderImageList(); return; }
  const zoomImg=e.target.closest('#productDetail .detail-img, #productDetail .carousel-slide'); if(zoomImg){ openLightbox(zoomImg.src); return; }
  const prev=e.target.closest('.carousel-prev'); if(prev){const c=document.getElementById('detailCarousel');if(c)c.scrollBy({left:-c.clientWidth,behavior:'smooth'});return;}
  const next=e.target.closest('.carousel-next'); if(next){const c=document.getElementById('detailCarousel');if(c)c.scrollBy({left:c.clientWidth,behavior:'smooth'});return;}
  const dot=e.target.closest('.cdot'); if(dot){const c=document.getElementById('detailCarousel');if(c)c.scrollTo({left:parseInt(dot.dataset.dot)*c.clientWidth,behavior:'smooth'});return;}
  const card=e.target.closest('.product-card'); if(card) showProduct(card.dataset.id);
  const filter=e.target.closest('.filter'); if(filter){activeFilter=filter.dataset.filter; document.querySelectorAll('.filter').forEach(b=>b.classList.toggle('active',b===filter)); renderProducts();}
  const edit=e.target.closest('.edit-item'); if(edit) editProduct(edit.dataset.id);
  const del=e.target.closest('.delete-item'); if(del && confirm('¿Eliminar este artículo del listado?')) { apiDeleteProduct(del.dataset.id).then(()=>{ products=products.filter(p=>p.id!==del.dataset.id); renderProducts(); renderAdmin(); }).catch(()=>{}); }
});
$('#itemPrice').addEventListener('input', (e) => { const d = e.target.value.replace(/\D/g, ''); e.target.value = d ? formatMiles(parseInt(d, 10)) : ''; });
$('#addImageUrl').onclick = () => { const v=$('#itemImage').value.trim(); if(!v) return; editImages.push(v); renderImageList(); $('#itemImage').value=''; };
$('#itemImage').onkeydown = (e) => { if(e.key==='Enter'){e.preventDefault();$('#addImageUrl').click();} };
document.addEventListener('submit', async (e) => { if (e.target.id !== 'purchaseForm') return; e.preventDefault(); const form = e.target, feedback = $('#formFeedback'), button = form.querySelector('button'); if (!settings.formspreeEndpoint) { feedback.textContent = 'Todavía falta configurar el endpoint de Formspree.'; feedback.className = 'form-feedback error'; return; } button.disabled = true; button.textContent = 'Enviando…'; try { const response = await fetch(settings.formspreeEndpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } }); if (!response.ok) throw new Error('No se pudo enviar'); form.reset(); feedback.textContent = '¡Listo! Recibí tu consulta y te respondo pronto.'; feedback.className = 'form-feedback success'; button.remove(); } catch { feedback.textContent = 'No se pudo enviar la consulta. Probá de nuevo en unos minutos.'; feedback.className = 'form-feedback error'; button.disabled = false; button.textContent = 'Enviar consulta ↗'; } });
function openAdmin() { renderAdmin(); $('#adminDialog').showModal(); }
$('#adminTrigger').onclick = () => { if (!serverEnv.authRequired || token()) { openAdmin(); } else { $('#authFeedback').textContent=''; $('#authForm').reset(); $('#authDialog').showModal(); $('#adminPassword').focus(); } };
$('#authForm').onsubmit = async (e) => { e.preventDefault(); const fb=$('#authFeedback'), btn=e.target.querySelector('button'); btn.disabled=true; try { const r=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('#adminPassword').value})}); if(!r.ok) throw new Error(); sessionStorage.setItem('casita-token',(await r.json()).token); $('#authDialog').close(); openAdmin(); } catch { fb.textContent='Contraseña incorrecta.'; fb.className='form-feedback error'; btn.disabled=false; } };
$('#closeAdmin').onclick=()=>$('#adminDialog').close(); $('#closeProduct').onclick=()=>$('#productDialog').close(); $('#closeAuth').onclick=()=>$('#authDialog').close();
['adminDialog','productDialog','authDialog'].forEach(id=>{const d=$('#'+id);d.addEventListener('click',e=>{if(e.target===d)d.close();});});
document.querySelectorAll('.admin-tab').forEach(tab=>tab.onclick=()=>{document.querySelectorAll('.admin-tab').forEach(t=>t.classList.toggle('active',t===tab)); $('#itemsTab').classList.toggle('hidden',tab.dataset.tab!=='items'); $('#settingsTab').classList.toggle('hidden',tab.dataset.tab!=='settings');});
$('#cancelEdit').onclick=resetForm;
$('#itemForm').onsubmit=async (e)=>{e.preventDefault(); if(!editImages.length){alert('Agregá al menos una foto.');return;} const priceNum=parsePrice($('#itemPrice').value); if(priceNum==null){alert('El precio tiene que ser un número. Ej: 200000');$('#itemPrice').focus();return;} const id=$('#editId').value; const entry={id:id||Date.now().toString(36),name:$('#itemName').value.trim(),price:priceNum,condition:$('#itemCondition').value.trim(),status:$('#itemStatus').value,images:[...editImages],image:editImages[0],description:$('#itemDescription').value.trim()}; try{ await apiSaveProduct(entry); if(id) products=products.map(p=>p.id===id?entry:p); else products.unshift(entry); renderProducts();renderAdmin();resetForm(); }catch{} };
$('#settingsForm').onsubmit=async (e)=>{e.preventDefault(); const s={storeName:$('#storeName').value.trim(),storeIntro:$('#storeIntro').value.trim(),mpAlias:$('#mpAlias').value.trim(),mpCVU:$('#mpCVU').value.trim(),mpNombre:$('#mpNombre').value.trim()}; try{ await apiSaveSettings(s); settings={...settings,...s}; applySettings(); }catch{} };
$('#year').textContent = new Date().getFullYear();
async function init() {
  const res = await fetch('/api/data');
  const data = res.ok ? await res.json() : null;
  if (data) { products = data.products || defaultProducts; settings = { ...defaults, ...data.settings }; }
  if (serverEnv.formspreeEndpoint) settings.formspreeEndpoint = serverEnv.formspreeEndpoint;
  applySettings(); renderProducts();
}
init();

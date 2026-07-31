const $ = (selector) => document.querySelector(selector);
const token = () => sessionStorage.getItem('casita-master-token') || '';

async function api(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'request failed');
  return r.json();
}

function fmtDate(ts) { return ts ? new Date(ts).toLocaleDateString('es-AR') : ''; }

function renderProfiles(profiles) {
  $('#profileList').innerHTML = profiles.map((p) => `
    <div class="admin-row" style="grid-template-columns:1fr auto;">
      <div class="row-info">
        <p>${p.name} <small>(/${p.slug})</small></p>
        <small>${p.email} · ${p.phone} · ${p.productCount} artículos · alta ${fmtDate(p.createdAt)}</small>
      </div>
      <div class="row-actions">
        <button class="icon-button reset-password" data-slug="${p.slug}" type="button">Regenerar contraseña</button>
      </div>
    </div>`).join('') || '<p class="form-feedback">Todavía no hay perfiles creados.</p>';
}

async function loadProfiles() {
  const { profiles } = await api('GET', '/api/admin/profiles');
  renderProfiles(profiles);
}

function showNewPassword(slug, password) {
  $('#newPasswordSlug').textContent = '/' + slug;
  $('#newPasswordText').textContent = password;
  $('#copyNewPassword').dataset.copy = password;
  $('#newPasswordBox').classList.remove('hidden');
}

async function enterPanel() {
  $('#loginView').classList.add('hidden');
  $('#panelView').classList.remove('hidden');
  try { await loadProfiles(); } catch { /* token vencido u otro error, se ve en el próximo intento */ }
}

$('#loginForm').onsubmit = async (e) => {
  e.preventDefault();
  const fb = $('#loginFeedback'), btn = e.target.querySelector('button');
  btn.disabled = true;
  try {
    const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#masterPassword').value }) });
    if (!r.ok) throw new Error();
    sessionStorage.setItem('casita-master-token', (await r.json()).token);
    enterPanel();
  } catch {
    fb.textContent = 'Contraseña incorrecta.';
    fb.className = 'form-feedback error';
    btn.disabled = false;
  }
};

$('#createForm').onsubmit = async (e) => {
  e.preventDefault();
  const fb = $('#createFeedback');
  fb.textContent = ''; fb.className = 'form-feedback';
  const body = {
    name: $('#pName').value.trim(),
    email: $('#pEmail').value.trim(),
    phone: $('#pPhone').value.trim(),
    slug: $('#pSlug').value.trim().toLowerCase(),
  };
  try {
    const res = await api('POST', '/api/admin/profiles', body);
    showNewPassword(res.slug, res.password);
    e.target.reset();
    await loadProfiles();
  } catch (err) {
    fb.textContent = err.message || 'No se pudo crear el perfil.';
    fb.className = 'form-feedback error';
  }
};

document.addEventListener('click', async (e) => {
  const copy = e.target.closest('#copyNewPassword');
  if (copy) { navigator.clipboard.writeText(copy.dataset.copy); const hint = copy.querySelector('.mp-copy-hint'); if (hint) { const orig = hint.textContent; hint.textContent = '✓'; setTimeout(() => hint.textContent = orig, 1500); } return; }
  const reset = e.target.closest('.reset-password');
  if (reset) {
    if (!confirm('¿Regenerar la contraseña de /' + reset.dataset.slug + '? La anterior deja de funcionar.')) return;
    try {
      const res = await api('POST', `/api/admin/profiles/${reset.dataset.slug}/reset-password`);
      showNewPassword(reset.dataset.slug, res.password);
    } catch { alert('No se pudo regenerar la contraseña.'); }
  }
});

if (token()) enterPanel();

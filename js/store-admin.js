// Store Admin - GitHub API CRUD for products
const STORE_PATH = 'data/store.json';
let cfg = {};
let products = [];
let editingId = null;

// Load config from localStorage
function loadCfg() {
  try { cfg = JSON.parse(localStorage.getItem('ac_store_cfg') || '{}'); } catch { cfg = {}; }
  if (cfg.owner && cfg.repo && cfg.token) {
    document.getElementById('configView').classList.add('hidden');
    document.getElementById('appView').classList.remove('hidden');
    document.getElementById('owner').value = cfg.owner || '';
    document.getElementById('repo').value = cfg.repo || '';
    document.getElementById('branch').value = cfg.branch || 'main';
    document.getElementById('token').value = cfg.token || '';
    loadProducts();
  }
}

// Save config
document.getElementById('saveCfg')?.addEventListener('click', () => {
  cfg.owner = document.getElementById('owner').value.trim();
  cfg.repo = document.getElementById('repo').value.trim();
  cfg.branch = document.getElementById('branch').value.trim() || 'main';
  cfg.token = document.getElementById('token').value.trim();
  if (!cfg.owner || !cfg.repo || !cfg.token) {
    showMsg('cfgMsg', '请填写所有字段', 'red'); return;
  }
  localStorage.setItem('ac_store_cfg', JSON.stringify(cfg));
  document.getElementById('configView').classList.add('hidden');
  document.getElementById('appView').classList.remove('hidden');
  loadProducts();
});

document.getElementById('clearCfgBtn')?.addEventListener('click', () => {
  localStorage.removeItem('ac_store_cfg');
  location.reload();
});

// GitHub API helpers
function apiUrl(path) {
  return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;
}

function authHeaders() {
  return {
    'Authorization': `token ${cfg.token}`,
    'Accept': 'application/vnd.github.v3+json',
  };
}

async function loadProducts() {
  const list = document.getElementById('productList');
  list.innerHTML = '<p class="s">加载中…</p>';
  try {
    const resp = await fetch(apiUrl(STORE_PATH) + '?ref=' + cfg.branch, { headers: authHeaders() });
    if (!resp.ok) {
      if (resp.status === 404) { products = []; list.innerHTML = '<p class="s">暂无商品</p>'; return; }
      throw new Error('加载失败: ' + resp.status);
    }
    const data = await resp.json();
    const content = atob(data.content.replace(/\s/g, ''));
    const parsed = JSON.parse(content);
    products = parsed.products || [];
    renderProductList();
  } catch (e) {
    list.innerHTML = `<p class="s">加载失败: ${e.message}</p>`;
  }
}

function renderProductList() {
  const list = document.getElementById('productList');
  if (!products.length) { list.innerHTML = '<p class="s">暂无商品</p>'; return; }
  list.innerHTML = products.map((p, i) => `
    <div class="product-item" style="padding:.5rem 0;border-bottom:1px solid var(--border);cursor:pointer">
      <strong>${esc(p.name)}</strong>
      <span style="float:right;color:#4ade80">¥${p.price.toFixed(2)}</span>
      <br><small>${esc(p.category||'')}</small>
      <button class="btn-sm" data-edit="${i}" style="margin-right:.3rem">✏️</button>
      <button class="btn-sm" data-del="${i}" style="color:#f87171">🗑</button>
    </div>
  `).join('');

  list.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => editProduct(parseInt(b.dataset.edit))));
  list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => deleteProduct(parseInt(b.dataset.del))));
}

function editProduct(i) {
  const p = products[i];
  editingId = i;
  document.getElementById('prodId').value = i;
  document.getElementById('prodName').value = p.name || '';
  document.getElementById('prodPrice').value = p.price || 0;
  document.getElementById('prodCat').value = p.category || '';
  document.getElementById('prodDesc').value = p.description || '';
  document.getElementById('prodImg').value = p.image_url || '';
  document.getElementById('prodQR').value = p.pay_qr || '';
  document.getElementById('prodActive').checked = p.active !== false;
  document.getElementById('saveBtn').textContent = '💾 更新商品';
  if (p.image_url) { document.getElementById('prodImgPreview').src = p.image_url; document.getElementById('prodImgPreview').classList.remove('hidden'); }
}

document.getElementById('resetBtn')?.addEventListener('click', () => {
  editingId = null;
  document.getElementById('productForm').reset();
  document.getElementById('saveBtn').textContent = '➕ 添加商品';
  document.getElementById('prodImgPreview').classList.add('hidden');
});

document.getElementById('productForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const product = {
    id: editingId !== null ? products[editingId].id : Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: document.getElementById('prodName').value.trim(),
    price: parseFloat(document.getElementById('prodPrice').value) || 0,
    category: document.getElementById('prodCat').value.trim(),
    description: document.getElementById('prodDesc').value.trim(),
    image_url: document.getElementById('prodImg').value.trim(),
    pay_qr: document.getElementById('prodQR').value.trim(),
    active: document.getElementById('prodActive').checked,
    created_at: editingId !== null ? products[editingId].created_at : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (!product.name) { showMsg('prodHint', '请输入商品名称', 'red'); return; }

  if (editingId !== null) products[editingId] = product;
  else products.push(product);

  await saveProducts();
  renderProductList();
  document.getElementById('productForm').reset();
  document.getElementById('saveBtn').textContent = '➕ 添加商品';
  editingId = null;
  showMsg('prodHint', '✅ 已保存！刷新商店页面即可看到', 'green');
});

async function deleteProduct(i) {
  if (!confirm(`确定删除「${products[i].name}」？`)) return;
  products.splice(i, 1);
  await saveProducts();
  renderProductList();
  showMsg('prodHint', '已删除', 'green');
}

async function saveProducts() {
  const json = JSON.stringify({ products }, null, 2);
  const content = btoa(unescape(encodeURIComponent(json)));

  // Get current file SHA if exists
  let sha = '';
  try {
    const resp = await fetch(apiUrl(STORE_PATH) + '?ref=' + cfg.branch, { headers: authHeaders() });
    if (resp.ok) { const d = await resp.json(); sha = d.sha; }
  } catch {}

  const body = JSON.stringify({
    message: `Update store: ${products.length} products`,
    content, sha, branch: cfg.branch,
  });

  const resp = await fetch(apiUrl(STORE_PATH), {
    method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body,
  });

  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.message || 'Save failed');
  }
}

function showMsg(id, msg, color) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'banner';
  el.style.background = color === 'red' ? 'rgba(239,68,68,.1)' : 'rgba(34,197,94,.1)';
  el.style.color = color === 'red' ? '#f87171' : '#4ade80';
  el.classList.remove('hidden');
}

function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

loadCfg();

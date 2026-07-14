// Store - Load products from GitHub repo JSON
const STORE_URL = 'https://raw.githubusercontent.com/AlwaysCryingMC/alwayscrying/main/data/store.json';
const PAY_QR = 'https://raw.githubusercontent.com/AlwaysCryingMC/alwayscrying/main/assets/pay-qr.jpg';

let products = [];
let categories = new Set();

async function loadStore() {
  try {
    const resp = await fetch(STORE_URL + '?t=' + Date.now());
    if (!resp.ok) throw new Error('Store data not found');
    const data = await resp.json();
    products = data.products || [];
    products = products.filter(p => p.active !== false);
    products.forEach(p => { if (p.category) categories.add(p.category); });
    renderTabs();
    renderProducts('all');
  } catch (e) {
    document.getElementById('storeGrid').innerHTML =
      '<p class="s">商店暂无商品，敬请期待 🚀</p>';
  }
}

function renderTabs() {
  const tabs = document.getElementById('storeTabs');
  let html = '<button class="btn btn-primary tab active" data-cat="all">全部</button>';
  for (const cat of categories) {
    html += `<button class="btn btn-outline tab" data-cat="${cat}">${cat}</button>`;
  }
  tabs.innerHTML = html;
  tabs.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.querySelectorAll('.tab').forEach(b => b.className = 'btn btn-outline tab');
      btn.className = 'btn btn-primary tab active';
      renderProducts(btn.dataset.cat);
    });
  });
}

function renderProducts(cat) {
  const grid = document.getElementById('storeGrid');
  const filtered = cat === 'all' ? products : products.filter(p => p.category === cat);
  if (!filtered.length) {
    grid.innerHTML = '<p class="s">该分类暂无商品</p>';
    return;
  }
  grid.innerHTML = filtered.map(p => `
    <div class="store-card">
      ${p.image_url ? `<img class="product-img" src="${p.image_url}" alt="${p.name}" loading="lazy" />` : '<div class="product-img" style="display:flex;align-items:center;justify-content:center;font-size:3rem">📦</div>'}
      <h3>${esc(p.name)}</h3>
      <p class="desc">${esc(p.description || '')}</p>
      ${p.price > 0 ? `<p class="price">¥${p.price.toFixed(2)}</p>` : '<p class="price" style="color:#60a5fa">免费</p>'}
      <button class="btn btn-primary buy-btn" data-name="${esc(p.name)}" data-price="${p.price}" data-qr="${p.pay_qr || PAY_QR}">
        ${p.price > 0 ? '💳 购买' : '📥 免费获取'}
      </button>
    </div>
  `).join('');

  // Buy button handlers
  grid.querySelectorAll('.buy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.name;
      const price = parseFloat(btn.dataset.price);
      const qr = btn.dataset.qr;
      document.getElementById('payProductName').textContent = name;
      document.getElementById('payPrice').textContent = price > 0 ? `¥${price.toFixed(2)}` : '免费';
      document.getElementById('payQR').src = qr;
      document.getElementById('payModal').classList.remove('hidden');
    });
  });
}

// Modal close
document.addEventListener('DOMContentLoaded', () => {
  loadStore();
  document.getElementById('payClose')?.addEventListener('click', () => {
    document.getElementById('payModal').classList.add('hidden');
  });
  document.getElementById('payModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) document.getElementById('payModal').classList.add('hidden');
  });
});

function esc(s) {
  const div = document.createElement('div');
  div.textContent = s || '';
  return div.innerHTML;
}

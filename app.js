const state = {
  token: localStorage.getItem('guard_token') || '',
  activePage: 'dashboard',
  summaryType: 'playerName',
  editingOrderId: null,
  orders: [],
  players: [],
  playTypes: []
};

function apiUrl(path = '/') {
  const config = window.__APP_CONFIG__ || {};
  const base = (config.apiUrl || config.apiURL || '').replace(/\/+$/, '');

  if (!base) {
    return path.startsWith('/') ? path : `/${path}`;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindEvents();
  if (state.token) {
    try {
      await loadAllData();
      showApp();
    } catch (error) {
      if (state.token) showApp();
      else showLogin();
      alert(error.message || '加载数据失败，请稍后重试。');
    }
  } else {
    showLogin();
  }
}

function bindEvents() {
  document.getElementById('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    try {
      const response = await fetch(apiUrl('/api/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '登录失败');
      }

      state.token = data.token;
      localStorage.setItem('guard_token', state.token);
      try {
        await loadAllData();
        showApp();
      } catch (error) {
        if (state.token) showApp();
        else showLogin();
        alert(error.message || '登录成功，但加载数据失败，请稍后重试。');
      }
    } catch (error) {
      showLogin();
      alert(error.message || '登录失败');
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    clearSession();
    showLogin();
  });

  document.querySelectorAll('.nav-btn[data-page]').forEach((button) => {
    button.addEventListener('click', () => {
      const page = button.dataset.page;
      state.activePage = page;
      switchPage(page);
    });
  });

  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.addEventListener('click', () => {
      state.summaryType = button.dataset.type;
      renderDashboard();
      document.querySelectorAll('.tab-btn').forEach((item) => item.classList.toggle('active', item === button));
    });
  });

  document.getElementById('orderForm').addEventListener('submit', handleOrderSubmit);
  document.getElementById('clearFilter').addEventListener('click', clearFilters);
  document.getElementById('cancelEditBtn').addEventListener('click', resetForm);
  document.getElementById('filter-player').addEventListener('change', renderOrderList);
  document.getElementById('filter-customer').addEventListener('change', renderOrderList);
  document.getElementById('filter-playType').addEventListener('change', renderOrderList);

  document.body.addEventListener('click', async (event) => {
    const editButton = event.target.closest('.edit-btn');
    const deleteButton = event.target.closest('.delete-btn');

    if (editButton) {
      const id = editButton.dataset.id;
      editOrder(Number(id));
      return;
    }

    if (deleteButton) {
      const id = deleteButton.dataset.id;
      await deleteOrder(Number(id));
    }
  });
}

function showLogin() {
  document.getElementById('loginView').classList.remove('hidden');
  document.getElementById('appView').classList.add('hidden');
}

function showApp() {
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('appView').classList.remove('hidden');
  switchPage(state.activePage);
}

function switchPage(pageName) {
  document.querySelectorAll('.page').forEach((section) => {
    section.classList.toggle('hidden', section.id !== pageName);
  });
  document.querySelectorAll('.nav-btn[data-page]').forEach((button) => {
    button.classList.toggle('active', button.dataset.page === pageName);
  });
}

async function loadAllData() {
  const [orders, stats, config] = await Promise.all([
    fetchJson('/api/orders'),
    fetchJson('/api/stats'),
    fetchJson('/api/config')
  ]);

  state.orders = orders || [];
  state.players = config.players || [];
  state.playTypes = config.playTypes || [];

  renderDashboard(stats);
  renderFormOptions();
  renderFilters();
  renderOrderList();
}

function fetchJson(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    ...(state.token ? { Authorization: `Bearer ${state.token}` } : {})
  };

  const requestUrl = url.startsWith('http') ? url : apiUrl(url);

  return fetch(requestUrl, { ...options, headers }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && state.token) {
        clearSession();
        showLogin();
      }
      throw new Error(data.error || '请求失败');
    }
    return data;
  });
}

function renderDashboard(stats = null) {
  const summary = stats || {
    totalOrders: 0,
    totalAmount: 0,
    byPlayer: [],
    byCustomer: [],
    byPlayType: []
  };

  document.getElementById('total-orders').textContent = String(summary.totalOrders || 0);
  document.getElementById('total-amount').textContent = formatMoney(summary.totalAmount || 0);

  let rows = [];
  if (state.summaryType === 'playerName') rows = summary.byPlayer || [];
  if (state.summaryType === 'customerName') rows = summary.byCustomer || [];
  if (state.summaryType === 'playType') rows = summary.byPlayType || [];

  const tbody = document.getElementById('summaryTableBody');
  tbody.innerHTML = '';

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">暂无数据</td></tr>';
    return;
  }

  rows.forEach((item) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(item.name || '未知')}</td>
      <td>${item.count || 0}</td>
      <td>${formatMoney(item.total || 0)}</td>
    `;
    tbody.appendChild(row);
  });
}

function renderFormOptions() {
  document.getElementById('playerOptions').innerHTML = (state.players || [])
    .map((item) => `<option value="${escapeHtml(item)}"></option>`)
    .join('');

  document.getElementById('playTypeOptions').innerHTML = (state.playTypes || [])
    .map((item) => `<option value="${escapeHtml(item)}"></option>`)
    .join('');
}

function renderFilters() {
  setSelectOptions('filter-player', state.players || [], '全部打手');
  setSelectOptions('filter-customer', [...new Set((state.orders || []).map((order) => order.customer_name || '').filter(Boolean))], '全部客户');
  setSelectOptions('filter-playType', state.playTypes || [], '全部玩法');
}

function setSelectOptions(elementId, values, defaultLabel) {
  const select = document.getElementById(elementId);
  const currentValue = select.value;
  const uniqueValues = [...new Set((values || []).filter(Boolean))];

  select.innerHTML = `<option value="">${defaultLabel}</option>` + uniqueValues
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join('');

  if (uniqueValues.includes(currentValue)) {
    select.value = currentValue;
  }
}

function renderOrderList() {
  const filtered = getFilteredOrders();
  const tbody = document.getElementById('orderTableBody');
  tbody.innerHTML = '';

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无订单数据</td></tr>';
    return;
  }

  filtered
    .slice()
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .forEach((order) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${escapeHtml(order.player_name || '')}</td>
        <td>${escapeHtml(order.customer_name || '')}</td>
        <td>${formatMoney(order.amount || 0)}</td>
        <td>${escapeHtml(order.play_type || '')}</td>
        <td>${escapeHtml(order.created_at || '')}</td>
        <td>${escapeHtml(order.remark || '')}</td>
        <td>
          <button class="edit-btn" data-id="${order.id}" type="button">编辑</button>
          <button class="delete-btn" data-id="${order.id}" type="button">删除</button>
        </td>
      `;
      tbody.appendChild(row);
    });
}

async function handleOrderSubmit(event) {
  event.preventDefault();
  const amountInput = document.getElementById('amount').value.trim();

  const payload = {
    playerName: document.getElementById('playerName').value.trim(),
    customerName: document.getElementById('customerName').value.trim(),
    amount: amountInput === '' ? NaN : Number(amountInput),
    playType: document.getElementById('playType').value.trim(),
    remark: document.getElementById('remark').value.trim()
  };

  if (!payload.playerName || !payload.customerName ||
      !Number.isFinite(payload.amount) || payload.amount < 0 || !payload.playType) {
    alert('请填写打手名、客户名、金额和玩法。');
    return;
  }

  try {
    const url = state.editingOrderId ? `/api/orders/${state.editingOrderId}` : '/api/orders';
    const method = state.editingOrderId ? 'PUT' : 'POST';

    await fetchJson(url, {
      method,
      body: JSON.stringify(payload)
    });

    await loadAllData();
    resetForm();
    switchPage('order-list');
  } catch (error) {
    alert(error.message || '保存失败');
  }
}

function editOrder(id) {
  const target = state.orders.find((order) => Number(order.id) === Number(id));
  if (!target) return;

  state.editingOrderId = Number(id);
  document.getElementById('playerName').value = target.player_name || '';
  document.getElementById('customerName').value = target.customer_name || '';
  document.getElementById('amount').value = target.amount || '';
  document.getElementById('playType').value = target.play_type || '';
  document.getElementById('remark').value = target.remark || '';
  document.getElementById('formTitle').textContent = '编辑订单';
  document.getElementById('submitBtn').textContent = '保存修改';
  switchPage('add-order');
}

async function deleteOrder(id) {
  const ok = window.confirm('确认删除这条订单吗？');
  if (!ok) return;

  try {
    await fetchJson(`/api/orders/${id}`, { method: 'DELETE' });
    await loadAllData();
  } catch (error) {
    alert(error.message || '删除失败');
  }
}

function resetForm() {
  document.getElementById('orderForm').reset();
  state.editingOrderId = null;
  document.getElementById('formTitle').textContent = '新增订单';
  document.getElementById('submitBtn').textContent = '保存订单';
}

function clearFilters() {
  document.getElementById('filter-player').value = '';
  document.getElementById('filter-customer').value = '';
  document.getElementById('filter-playType').value = '';
  renderOrderList();
}

function getFilteredOrders() {
  const player = document.getElementById('filter-player').value;
  const customer = document.getElementById('filter-customer').value;
  const playType = document.getElementById('filter-playType').value;

  return (state.orders || []).filter((order) => {
    const matchPlayer = !player || order.player_name === player;
    const matchCustomer = !customer || order.customer_name === customer;
    const matchPlayType = !playType || order.play_type === playType;
    return matchPlayer && matchCustomer && matchPlayType;
  });
}

function clearSession() {
  localStorage.removeItem('guard_token');
  state.token = '';
}

function formatMoney(value) {
  const number = Number(value || 0);
  return `¥${number.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const state = {
  hosts: [],
  offlineAfterMinutes: 15,
  filter: 'all',
  search: '',
  refreshTimer: null,
};

const elements = {
  loginView: document.querySelector('#login-view'),
  dashboardView: document.querySelector('#dashboard-view'),
  loginForm: document.querySelector('#login-form'),
  loginError: document.querySelector('#login-error'),
  togglePassword: document.querySelector('#toggle-password'),
  password: document.querySelector('#password'),
  operatorName: document.querySelector('#operator-name'),
  logoutButton: document.querySelector('#logout-button'),
  lastUpdated: document.querySelector('#last-updated'),
  refreshButton: document.querySelector('#refresh-button'),
  searchInput: document.querySelector('#search-input'),
  filterButtons: [...document.querySelectorAll('.filter-button')],
  hostGrid: document.querySelector('#host-grid'),
  emptyState: document.querySelector('#empty-state'),
  emptyTitle: document.querySelector('#empty-title'),
  emptyCopy: document.querySelector('#empty-copy'),
  hostCount: document.querySelector('#host-count'),
  onlineCount: document.querySelector('#online-count'),
  offlineCount: document.querySelector('#offline-count'),
  onlinePercent: document.querySelector('#online-percent'),
  averageLoad: document.querySelector('#average-load'),
  dialog: document.querySelector('#host-dialog'),
  dialogContent: document.querySelector('#dialog-content'),
  dialogClose: document.querySelector('#dialog-close'),
  toast: document.querySelector('#toast'),
};

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(body?.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function escapeHtml(value) {
  const element = document.createElement('div');
  element.textContent = value ?? '';
  return element.innerHTML;
}

function isOnline(host) {
  return Date.now() - new Date(host.received_at).getTime() < state.offlineAfterMinutes * 60_000;
}

function relativeTime(date) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

function formatUptime(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index > 2 ? 1 : 0)} ${units[index]}`;
}

function percentage(used, total) {
  if (used === null || total === null || !total) return null;
  return Math.round((used / total) * 100);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => elements.toast.classList.remove('visible'), 2600);
}

function hostCard(host) {
  const online = isOnline(host);
  const load = host.load_1;
  const loadPercent = load === null ? 0 : Math.min(100, (load / Math.max(host.cpu_count || 1, 1)) * 100);
  const osLabel = [host.os, host.kernel].filter(Boolean).join(' · ') || 'System details unknown';

  return `
    <article class="host-card ${online ? '' : 'offline'}" data-hostname="${escapeHtml(host.hostname)}">
      <div class="host-top">
        <div class="host-name">
          <p>${escapeHtml(osLabel)}</p>
          <h3 title="${escapeHtml(host.hostname)}">${escapeHtml(host.hostname)}</h3>
        </div>
        <span class="status-badge">${online ? 'Online' : 'Quiet'}</span>
      </div>
      <div class="address-list">
        <div class="address-row">
          <span>IPv4</span><code class="address-value">${escapeHtml(host.ipv4 || 'Not reported')}</code>
          ${host.ipv4 ? `<button class="copy-button" type="button" data-copy="${escapeHtml(host.ipv4)}" aria-label="Copy IPv4">▣</button>` : '<span></span>'}
        </div>
        <div class="address-row">
          <span>IPv6</span><code class="address-value" title="${escapeHtml(host.ipv6 || '')}">${escapeHtml(host.ipv6 || 'Not reported')}</code>
          ${host.ipv6 ? `<button class="copy-button" type="button" data-copy="${escapeHtml(host.ipv6)}" aria-label="Copy IPv6">▣</button>` : '<span></span>'}
        </div>
      </div>
      <div class="vitals">
        <div class="vital"><span>LOAD 1M</span><strong>${load === null ? '—' : load.toFixed(2)}</strong></div>
        <div class="vital"><span>UPTIME</span><strong>${formatUptime(host.uptime_seconds)}</strong></div>
        <div class="vital"><span>MEMORY</span><strong>${percentage(host.memory_used_bytes, host.memory_total_bytes) ?? '—'}${percentage(host.memory_used_bytes, host.memory_total_bytes) === null ? '' : '%'}</strong></div>
        <progress class="load-meter ${loadPercent > 80 ? 'high' : ''}" max="100" value="${loadPercent}" aria-label="Load per CPU capacity"></progress>
      </div>
      <div class="host-footer">
        <span>LAST SEEN ${relativeTime(host.received_at).toUpperCase()}</span>
        <button class="details-button" type="button" data-details="${escapeHtml(host.hostname)}">VIEW DETAILS ↗</button>
      </div>
    </article>`;
}

function render() {
  const online = state.hosts.filter(isOnline);
  const loads = state.hosts.map((host) => host.load_1).filter((load) => load !== null);
  elements.hostCount.textContent = state.hosts.length;
  elements.onlineCount.textContent = online.length;
  elements.offlineCount.textContent = state.hosts.length - online.length;
  elements.onlinePercent.textContent = `${state.hosts.length ? Math.round((online.length / state.hosts.length) * 100) : 0}% reporting`;
  elements.averageLoad.textContent = loads.length ? (loads.reduce((sum, load) => sum + load, 0) / loads.length).toFixed(2) : '—';

  const query = state.search.toLowerCase();
  const visibleHosts = state.hosts.filter((host) => {
    const matchesFilter = state.filter === 'all' || (state.filter === 'online') === isOnline(host);
    const matchesSearch = !query || [host.hostname, host.ipv4, host.ipv6, host.os].some((value) => value?.toLowerCase().includes(query));
    return matchesFilter && matchesSearch;
  });

  elements.hostGrid.innerHTML = visibleHosts.map(hostCard).join('');
  elements.emptyState.hidden = visibleHosts.length > 0;
  if (state.hosts.length === 0) {
    elements.emptyTitle.textContent = 'No signals yet';
    elements.emptyCopy.textContent = 'Send your first webhook and a host will pop up right here.';
  } else {
    elements.emptyTitle.textContent = 'No matching machines';
    elements.emptyCopy.textContent = 'Try a different search or filter.';
  }
}

async function loadHosts({ quiet = false } = {}) {
  if (!quiet) elements.refreshButton.classList.add('loading');
  try {
    const data = await api('/api/hosts');
    state.hosts = data.hosts;
    state.offlineAfterMinutes = data.offlineAfterMinutes;
    elements.lastUpdated.textContent = `SYNCED ${relativeTime(data.serverTime).toUpperCase()}`;
    render();
  } catch (error) {
    if (error.status === 401) return showLogin();
    showToast(`Couldn't refresh: ${error.message}`);
  } finally {
    elements.refreshButton.classList.remove('loading');
  }
}

function showDashboard(username) {
  elements.loginView.hidden = true;
  elements.dashboardView.hidden = false;
  elements.operatorName.textContent = username;
  document.title = 'Dashboard · Homelab Beacon';
  loadHosts();
  window.clearInterval(state.refreshTimer);
  state.refreshTimer = window.setInterval(() => loadHosts({ quiet: true }), 30_000);
}

function showLogin() {
  elements.dashboardView.hidden = true;
  elements.loginView.hidden = false;
  document.title = 'Sign in · Homelab Beacon';
  window.clearInterval(state.refreshTimer);
}

function detailItem(label, value) {
  return `<div class="detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? '—')}</strong></div>`;
}

function openHostDialog(hostname) {
  const host = state.hosts.find((item) => item.hostname === hostname);
  if (!host) return;
  const online = isOnline(host);
  const metadata = Object.entries(host.metadata || {});
  const memory = host.memory_total_bytes === null ? '—' : `${formatBytes(host.memory_used_bytes)} / ${formatBytes(host.memory_total_bytes)}`;
  const disk = host.disk_total_bytes === null ? '—' : `${formatBytes(host.disk_used_bytes)} / ${formatBytes(host.disk_total_bytes)}`;
  const load = [host.load_1, host.load_5, host.load_15].map((value) => value === null ? '—' : value.toFixed(2)).join(' / ');

  elements.dialogContent.innerHTML = `
    <div class="dialog-header ${online ? '' : 'offline'}">
      <span class="status-badge">${online ? 'Online' : 'Quiet'}</span>
      <h2>${escapeHtml(host.hostname)}</h2>
    </div>
    <div class="dialog-body">
      <div class="detail-grid">
        ${detailItem('IPv4 address', host.ipv4)}
        ${detailItem('IPv6 address', host.ipv6)}
        ${detailItem('Load 1 / 5 / 15', load)}
        ${detailItem('Uptime', formatUptime(host.uptime_seconds))}
        ${detailItem('Operating system', host.os)}
        ${detailItem('Kernel', host.kernel)}
        ${detailItem('CPU cores', host.cpu_count)}
        ${detailItem('Memory used', memory)}
        ${detailItem('Disk used', disk)}
        ${detailItem('Temperature', host.temperature_c === null ? '—' : `${host.temperature_c}°C`)}
        ${detailItem('Reported at', host.reported_at ? new Date(host.reported_at).toLocaleString() : 'Not provided')}
        ${detailItem('Received at', new Date(host.received_at).toLocaleString())}
        ${metadata.map(([key, value]) => detailItem(key.replaceAll('_', ' '), typeof value === 'object' ? JSON.stringify(value) : value)).join('')}
      </div>
      <div class="dialog-actions">
        <button class="danger-button" type="button" data-delete="${escapeHtml(host.hostname)}">REMOVE HOST</button>
      </div>
    </div>`;
  elements.dialog.showModal();
}

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = elements.loginForm.querySelector('[type="submit"]');
  elements.loginError.hidden = true;
  submitButton.disabled = true;
  submitButton.querySelector('span').textContent = 'Opening radar…';

  try {
    const formData = new FormData(elements.loginForm);
    const session = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(formData)),
    });
    elements.loginForm.reset();
    showDashboard(session.username);
  } catch (error) {
    elements.loginError.textContent = error.message;
    elements.loginError.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector('span').textContent = 'Open dashboard';
  }
});

elements.togglePassword.addEventListener('click', () => {
  const showing = elements.password.type === 'text';
  elements.password.type = showing ? 'password' : 'text';
  elements.togglePassword.textContent = showing ? 'eye' : 'hide';
  elements.togglePassword.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
});

elements.logoutButton.addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } finally { showLogin(); }
});

elements.refreshButton.addEventListener('click', () => loadHosts());
elements.searchInput.addEventListener('input', (event) => { state.search = event.target.value; render(); });
elements.filterButtons.forEach((button) => button.addEventListener('click', () => {
  state.filter = button.dataset.filter;
  elements.filterButtons.forEach((item) => item.classList.toggle('active', item === button));
  render();
}));

elements.hostGrid.addEventListener('click', async (event) => {
  const copyButton = event.target.closest('[data-copy]');
  if (copyButton) {
    try {
      await navigator.clipboard.writeText(copyButton.dataset.copy);
      showToast('Address copied to clipboard');
    } catch {
      showToast('Clipboard access was blocked by the browser');
    }
    return;
  }
  const detailsButton = event.target.closest('[data-details]');
  if (detailsButton) openHostDialog(detailsButton.dataset.details);
});

elements.dialogClose.addEventListener('click', () => elements.dialog.close());
elements.dialog.addEventListener('click', (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});
elements.dialog.addEventListener('click', async (event) => {
  const deleteButton = event.target.closest('[data-delete]');
  if (!deleteButton) return;
  const hostname = deleteButton.dataset.delete;
  if (!window.confirm(`Remove ${hostname} from the dashboard? It will return after its next webhook.`)) return;
  try {
    await api(`/api/hosts/${encodeURIComponent(hostname)}`, { method: 'DELETE' });
    elements.dialog.close();
    showToast(`${hostname} removed`);
    await loadHosts({ quiet: true });
  } catch (error) {
    showToast(`Couldn't remove host: ${error.message}`);
  }
});

async function boot() {
  try {
    const session = await api('/api/session');
    if (session.authenticated) showDashboard(session.username);
    else showLogin();
  } catch {
    showLogin();
  }
}

boot();

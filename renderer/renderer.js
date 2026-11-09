const grid = document.getElementById('grid');
const search = document.getElementById('search');
const settings = document.getElementById('settings');
let apps = [];
const msgs = {};
const platformInfo = {};
window.norwin.onInstallProgress(({ id, text }) => {
  if (msgs[id]) msgs[id].textContent = text;
});

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of children) node.append(c);
  return node;
}

function render() {
  const q = search.value.trim().toLowerCase();
  grid.replaceChildren();
  for (const a of apps) {
    if (q && !`${a.name} ${a.description}`.toLowerCase().includes(q)) continue;

    const status = el('span', { className: 'status' }, a.installed ? 'Ready' : 'Not linked');
    const version = el('span', { className: 'version' }, '');
    const msg = el('p', { className: 'msg' });

    const launch = el('button', { className: 'primary', disabled: !a.installed }, 'Launch');
    launch.onclick = async () => {
      const r = await window.norwin.launch(a.id);
      msg.textContent = r.ok ? 'Launched.' : r.error;
    };

    const link = el('button', {}, a.installed ? 'Change exe' : 'Link exe');
    link.onclick = async () => {
      const p = await window.norwin.setPath(a.id);
      if (p) {
        apps = await window.norwin.listApps();
        render();
      }
    };

    const repo = el('button', {}, 'Repo');
    repo.onclick = () => window.norwin.openRepo(a.repo);

    const check = el('button', {}, 'Check release');
    check.onclick = async () => {
      version.textContent = '…';
      const r = await window.norwin.latestRelease(a.repo);
      if (!r.ok) version.textContent = '';
      msg.textContent = r.ok ? '' : r.error;
      if (r.ok) version.textContent = r.tag ? `Latest: ${r.tag}` : 'No releases';
    };

    let actions = el('div', { className: 'actions' }, launch, link, repo, check);
    if (a.webUrl !== undefined) {
      // Web-only app (e.g. NorwinInventory): no install, just open its login page.
      const login = el('button', { className: 'primary', disabled: !a.webUrl }, a.webUrl ? 'Open login page' : 'Login URL not set');
      login.onclick = () => window.norwin.openWeb(a.id);
      actions = el('div', { className: 'actions' }, login, repo);
      status.textContent = 'Web app';
    } else if (!a.installed) {
      const install = el('button', { className: 'primary' }, 'Install');
      install.onclick = async () => {
        install.disabled = true;
        msg.textContent = 'Starting…';
        const r = await window.norwin.install(a.id);
        msg.textContent = r.ok ? r.message : r.error;
        install.disabled = false;
        if (r.ok) {
          apps = await window.norwin.listApps();
          render();
        }
      };
      actions = el('div', { className: 'actions' }, install, link, repo, check);
    }
    msgs[a.id] = msg;
    const badges = el('div', { className: 'platforms' });
    if (a.webUrl !== undefined) {
      badges.append(el('span', { className: 'plat' }, 'Web'), el('span', { className: 'plat' }, 'Any device'));
    } else {
      const info = platformInfo[a.id];
      if (!info) {
        badges.append(el('span', { className: 'plat dim' }, 'Checking platforms…'));
      } else if (!info.ok) {
        badges.append(el('span', { className: 'plat dim' }, 'Platforms unknown'));
      } else if (!info.platforms.length) {
        badges.append(el('span', { className: 'plat dim' }, info.noRelease ? 'No release yet' : 'No installers'));
      } else {
        for (const p of info.platforms) {
          const archs = p.archs.length ? ` · ${p.archs.join(' / ')}` : '';
          const isMine = p.os === info.current;
          badges.append(el('span', { className: `plat${isMine ? ' mine' : ''}`, title: isMine ? 'Works on this device' : '' }, `${p.label}${archs}`));
        }
        if (!info.platforms.some((p) => p.os === info.current)) {
          badges.append(el('span', { className: 'plat warn' }, 'Not available for this OS'));
          const inst = actions.querySelector('button.primary');
          if (inst && inst.textContent === 'Install') inst.disabled = true;
        }
      }
    }

    grid.append(
      el('section', { className: 'card' },
        el('div', { className: 'card-head' },
          el('h2', {}, a.name),
          a.private ? el('span', { className: 'badge' }, 'private') : ''),
        el('p', { className: 'desc' }, a.description),
        badges,
        el('div', { className: 'meta' }, status, version),
        actions,
        msg)
    );
  }
}

search.addEventListener('input', render);
document.getElementById('settings-btn').onclick = () => settings.showModal();
const updateBtn = document.getElementById('update-btn');
const autoUpdate = document.getElementById('auto-update');
let updateState = { status: 'idle' };

function showUpdate(s) {
  updateState = s;
  const labels = {
    checking: 'Checking…',
    current: 'Up to date',
    available: `Update ${s.version} available`,
    downloading: `Downloading ${s.percent || 0}%`,
    ready: `Restart to install ${s.version}`,
    error: 'Update check failed',
  };
  updateBtn.textContent = s.status === 'available' ? `${labels.available} – ${s.manual ? 'open' : 'download'}` : labels[s.status] || 'Check for updates';
  updateBtn.title = s.error || '';
  updateBtn.disabled = s.status === 'checking' || s.status === 'downloading';
}

updateBtn.onclick = async () => {
  if (updateState.status === 'ready') return window.norwin.installUpdate();
  if (updateState.status === 'available') return window.norwin.downloadUpdate();
  showUpdate({ status: 'checking' });
  showUpdate(await window.norwin.checkUpdate());
};
window.norwin.onUpdateState(showUpdate);
autoUpdate.onchange = () => window.norwin.setAutoUpdate(autoUpdate.checked);
window.norwin.updaterInfo().then((i) => {
  document.getElementById('app-version').textContent = `v${i.version}`;
  autoUpdate.checked = i.autoUpdate;
});

settings.addEventListener('close', () => {
  if (settings.returnValue === 'save') {
    window.norwin.setToken(document.getElementById('token').value);
  }
  document.getElementById('token').value = '';
});

window.norwin.listApps().then((list) => {
  apps = list;
  render();
  for (const a of apps) {
    if (a.webUrl !== undefined) continue;
    window.norwin.platforms(a.id).then((info) => {
      platformInfo[a.id] = info;
      render();
    });
  }
});

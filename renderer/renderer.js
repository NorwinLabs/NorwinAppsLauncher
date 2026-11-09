const grid = document.getElementById('grid');
const search = document.getElementById('search');
const settings = document.getElementById('settings');

let apps = [];
const platformInfo = {}; // id -> result of norwin.platforms()
const msgText = {};      // id -> last status message (survives re-render)
const busy = {};         // id -> true while installing / uninstalling

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of children) node.append(c);
  return node;
}

const plat = (text, cls = '', title = '') => el('span', { className: `pill ${cls}`.trim(), title }, text);
const pct = {}; // id -> download percentage

function hue(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

async function reload() {
  apps = await window.norwin.listApps();
  render();
}

function platformBadges(a, info) {
  const row = el('div', { className: 'avail' });
  if (a.webUrl !== undefined) {
    row.append(plat('Web'), plat('Any device'));
  } else if (!info) {
    row.append(plat('Checking platforms…', 'dim'));
  } else if (!info.ok) {
    row.append(plat('Platforms unknown', 'dim'));
  } else if (!info.platforms.length) {
    row.append(plat(info.noRelease ? 'No release yet' : 'No installers', 'dim'));
  } else {
    for (const p of info.platforms) {
      const mine = p.os === info.current;
      row.append(plat(p.archs.length ? `${p.label} · ${p.archs.join(' / ')}` : p.label, mine ? 'mine' : '', mine ? 'Works on this device' : ''));
    }
    if (!info.platforms.some((p) => p.os === info.current)) row.append(plat('Not available for this OS', 'warn'));
  }
  return row;
}

function render() {
  const q = search.value.trim().toLowerCase();
  grid.replaceChildren();
  for (const a of apps) {
    if (q && !`${a.name} ${a.description}`.toLowerCase().includes(q)) continue;

    const info = platformInfo[a.id];
    const web = a.webUrl !== undefined;
    const noInstaller = !web && info && info.ok && !info.platforms.some((p) => p.os === info.current);
    const update = a.installed && a.installedVersion && info && info.updateAvailable;
    const msg = el('p', { className: 'msg' }, msgText[a.id] || '');
    msg.dataset.id = a.id;

    const run = (fn) => async () => {
      busy[a.id] = true;
      msgText[a.id] = 'Starting…';
      render();
      const r = await fn();
      busy[a.id] = false;
      pct[a.id] = 0;
      msgText[a.id] = r.ok ? r.message : r.error;
      if (r.ok) delete platformInfo[a.id];
      await reload();
      if (r.ok) window.norwin.platforms(a.id).then((i) => { platformInfo[a.id] = i; render(); });
    };

    const btn = (label, onclick, cls = '', disabled = false) =>
      el('button', { className: `btn ${cls === 'primary' ? 'solid' : cls}`.trim(), onclick, disabled: disabled || !!busy[a.id] }, label);

    let actions;
    let status = a.installed ? 'Ready' : 'Not linked';
    let version = '';

    if (web) {
      status = 'Web app';
      actions = [
        btn(a.webUrl ? 'Open login page' : 'Login URL not set', () => window.norwin.openWeb(a.id), 'primary', !a.webUrl),
      ];
    } else if (a.installed) {
      if (a.installedVersion) status = 'Installed';
      if (info && info.ok && info.tag) version = update ? `Update: ${info.tag}` : a.installedVersion ? 'Up to date' : `Latest: ${info.tag}`;
      actions = [
        btn('Launch', async () => {
          const r = await window.norwin.launch(a.id);
          msgText[a.id] = r.ok ? 'Launched.' : r.error;
          render();
        }, update ? '' : 'primary'),
      ];
      if (update) actions.push(btn(`Update to ${info.tag}`, run(() => window.norwin.install(a.id)), 'primary'));
      actions.push(btn('Change exe', async () => {
        if (await window.norwin.setPath(a.id)) reload();
      }));
      if (a.managed) {
        actions.push(btn('Uninstall', () => {
          if (confirm(`Uninstall ${a.name}?`)) run(() => window.norwin.uninstall(a.id))();
        }, 'warn'));
      }
    } else {
      actions = [
        btn('Install', run(() => window.norwin.install(a.id)), 'primary', noInstaller),
        btn('Link exe', async () => {
          if (await window.norwin.setPath(a.id)) reload();
        }),
        btn('Check release', async () => {
          msgText[a.id] = '…';
          render();
          const r = await window.norwin.latestRelease(a.repo);
          msgText[a.id] = !r.ok ? r.error : r.tag ? `Latest: ${r.tag}` : 'No releases';
          render();
        }),
      ];
    }

    const fact = (k, v, cls = '') => el('div', { className: `fact ${cls}`.trim() }, el('div', { className: 'k' }, k), el('div', { className: 'v' }, v));
    const bar = el('div', { className: `bar${busy[a.id] ? '' : ' hide'}${pct[a.id] ? '' : ' ind'}` }, el('i'));
    if (pct[a.id]) bar.firstChild.style.width = `${pct[a.id]}%`;
    bar.dataset.id = a.id;
    const srcBtn = el('button', { className: 'src mono', title: 'Open on GitHub', onclick: () => window.norwin.openRepo(a.repo) }, 'GitHub ↗');
    const h = hue(a.name);
    const icon = el('div', { className: 'icon' }, a.name.replace(/^Norwin/, '').charAt(0) || 'N');
    icon.style.background = `linear-gradient(135deg,hsl(${h} 70% 48%),hsl(${(h + 40) % 360} 70% 36%))`;

    grid.append(
      el('section', { className: 'card' },
        el('div', { className: 'top' }, el('span', { className: `ver mono${update ? ' upd' : ''}` }, version || (web ? 'Web' : '')), srcBtn),
        el('div', { className: 'body' },
          el('div', { className: 'head' },
            icon,
            el('div', { className: 'titles' },
              el('div', { className: 'title' }, a.name, a.private ? el('span', { className: 'by' }, 'private') : ''),
              el('div', { className: 'tag' }, a.description))),
          platformBadges(a, info),
          el('div', { className: 'facts' },
            fact('Status', status, a.installed ? 'good' : ''),
            fact('Version', a.installedVersion || (info && info.tag) || '—', update ? 'bad' : '')),
          el('div', { className: 'actions' }, ...actions),
          bar,
          msg))
    );
  }
}

// Live progress ("Downloading 42%") updates the message in place without a full re-render.
window.norwin.onInstallProgress(({ id, text }) => {
  msgText[id] = text;
  const m = /(\d+)%/.exec(text);
  pct[id] = m ? Number(m[1]) : 0;
  const b = grid.querySelector(`.bar[data-id="${id}"]`);
  if (b) {
    b.classList.remove('hide');
    b.classList.toggle('ind', !m);
    if (m) b.firstChild.style.width = `${m[1]}%`;
  }
  const node = grid.querySelector(`.msg[data-id="${id}"]`);
  if (node) node.textContent = text;
});

// ---- Launcher self-update button ----
const updateBtn = document.getElementById('update-btn');
let updateState = { status: 'idle' };

function showUpdate(s) {
  updateState = s;
  const labels = {
    checking: 'Checking…',
    current: 'Up to date',
    available: `Update ${s.version} available – ${s.manual ? 'open' : 'download'}`,
    downloading: `Downloading ${s.percent || 0}%`,
    ready: `Restart to install ${s.version}`,
    error: 'Update check failed',
  };
  updateBtn.textContent = labels[s.status] || 'Check for updates';
  updateBtn.title = s.error || '';
  updateBtn.disabled = s.status === 'checking' || s.status === 'downloading';
}

async function checkSelfUpdate() {
  showUpdate({ status: 'checking' });
  showUpdate(await window.norwin.checkUpdate());
}

updateBtn.onclick = () => {
  if (updateState.status === 'ready') return window.norwin.installUpdate();
  if (updateState.status === 'available') return window.norwin.downloadUpdate();
  return checkSelfUpdate();
};
window.norwin.onUpdateState(showUpdate);
window.norwin.onUpdateTrigger(checkSelfUpdate);

// ---- Settings ----
for (const key of ['autoUpdate', 'launchAfterInstall', 'closeToTray']) {
  document.getElementById(key).onchange = (e) => window.norwin.setFlag(key, e.target.checked);
}

window.norwin.getConfig().then((c) => {
  for (const key of ['autoUpdate', 'launchAfterInstall', 'closeToTray']) document.getElementById(key).checked = c[key];
  document.getElementById('closeToTray').disabled = !c.hasTray;
});
window.norwin.updaterInfo().then((i) => {
  document.getElementById('app-version').textContent = `v${i.version}`;
});

search.addEventListener('input', render);
document.getElementById('settings-btn').onclick = () => settings.showModal();
settings.addEventListener('close', () => {
  const token = document.getElementById('token');
  if (settings.returnValue === 'save' && token.value) {
    window.norwin.setToken(token.value).then(() => {
      for (const k of Object.keys(platformInfo)) delete platformInfo[k];
      loadPlatforms();
    });
  }
  token.value = '';
});

function loadPlatforms() {
  for (const a of apps) {
    if (a.webUrl !== undefined) continue;
    window.norwin.platforms(a.id).then((info) => {
      platformInfo[a.id] = info;
      render();
    });
  }
}

window.norwin.listApps().then((list) => {
  apps = list;
  render();
  loadPlatforms();
});

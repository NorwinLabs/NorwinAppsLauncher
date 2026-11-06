const grid = document.getElementById('grid');
const search = document.getElementById('search');
const settings = document.getElementById('settings');
let apps = [];

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

    grid.append(
      el('section', { className: 'card' },
        el('div', { className: 'card-head' },
          el('h2', {}, a.name),
          a.private ? el('span', { className: 'badge' }, 'private') : ''),
        el('p', { className: 'desc' }, a.description),
        el('div', { className: 'meta' }, status, version),
        el('div', { className: 'actions' }, launch, link, repo, check),
        msg)
    );
  }
}

search.addEventListener('input', render);
document.getElementById('settings-btn').onclick = () => settings.showModal();
settings.addEventListener('close', () => {
  if (settings.returnValue === 'save') {
    window.norwin.setToken(document.getElementById('token').value);
  }
  document.getElementById('token').value = '';
});

window.norwin.listApps().then((list) => {
  apps = list;
  render();
});

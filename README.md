# NorwinApps Launcher

Desktop hub / launcher for all NorwinLabs apps (NorwinVibe, NorwinPrep, NorwinLabsTools, NorwinInventory, …).

## Features
- One card per app, driven by [`apps.json`](apps.json)
- Install apps straight from their latest GitHub Release (Windows installer/portable, Linux AppImage, macOS dmg), then launch them
- Web-only apps (NorwinInventory) just open their login page - set `webUrl` in `apps.json`
- Link each app's executable once, then launch it from the hub
- Check each app's latest GitHub release
- Optional GitHub token (Settings) for private repos like NorwinInventory

## Run
```bash
npm install
npm start
```

## Build installers
```bash
npm run dist
```

## Releases & self-update
- **Auto release:** `.github/workflows/release.yml` runs on every push to `main`. If the `version` in `package.json` has no matching `vX.Y.Z` tag yet, it builds Windows (NSIS), macOS (dmg/zip) and Linux (AppImage) installers and publishes them as a GitHub Release. To ship: bump `version`, push to `main`.
- **Self-update:** installed builds read this repo's GitHub Releases (via `electron-updater`) on startup and from the **Check for updates** button, download the new version (toggle in Settings) and install on restart. Unpackaged dev runs only report whether a newer release exists.
- Note: macOS auto-update requires a code-signed app; unsigned mac builds must be updated manually. Private repos need the GitHub token in Settings.

## Code signing (optional)
Add these repository secrets and the release workflow signs installers automatically; without them builds are unsigned.
- `CSC_LINK` (base64 `.p12`/`.pfx` certificate) and `CSC_KEY_PASSWORD` - signs Windows and macOS builds
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` - notarizes macOS builds (needed for macOS auto-update)

## Installing apps
- Installers are checked against the SHA-512 in the release's `latest*.yml` before running; a mismatch discards the download.
- The launcher remembers which version it installed, shows **Update** when a newer release exists, and can **Uninstall** apps it installed.
- Settings: launch after install, and keep running in the system tray when the window is closed.

## Tests
```bash
npm test
```

## Adding an app
Add an entry to `apps.json`:

```json
{ "id": "myapp", "name": "MyApp", "description": "What it does.", "repo": "NorwinLabs/MyApp", "private": false }
```

User settings (linked exe paths, token) are stored in the Electron `userData` folder, not in the repo.

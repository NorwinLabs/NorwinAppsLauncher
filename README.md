# NorwinAppsLauncher

Desktop hub / launcher for all NorwinLabs apps (NorwinVibe, NorwinPrep, NorwinLabsTools, NorwinInventory, …).

## Features
- One card per app, driven by [`apps.json`](apps.json)
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

## Adding an app
Add an entry to `apps.json`:

```json
{ "id": "myapp", "name": "MyApp", "description": "What it does.", "repo": "NorwinLabs/MyApp", "private": false }
```

User settings (linked exe paths, token) are stored in the Electron `userData` folder, not in the repo.

# nextUp Calendar

A self-hosted, consolidated calendar app that merges your **Google Calendar** and **Microsoft Office 365** calendars into a single minimal, modern interface. Designed to run as a Docker container alongside Homebridge on your home server.

![Dark mode continuous view](docs/preview-dark.png)

---

## Features

- **Unified view** — Google and Microsoft events side-by-side, colour-coded by source
- **Four views** — Continuous (default), Day, Week, Month
- **Fuzzy search** — press any key to open an instant event search overlay (powered by Fuse.js)
- **Dark / Light / Auto theme** — follows your OS preference or set manually
- **Secure token storage** — OAuth tokens are AES-256-GCM encrypted on disk; the app never logs out
- **2FA compatible** — multi-factor auth is handled natively by Google / Microsoft login pages
- **Zero build step** — vanilla JS + CSS, no bundler required
- **Docker-first** — single container, persistent volume for credentials

---

## Quick Start (Docker on Homebridge)

### Prerequisites

- Docker and Docker Compose running on your Homebridge host (`homebridge.local`)
- A Google Cloud Console project with OAuth 2.0 credentials ([setup guide](#google-calendar-setup))
- An Azure AD app registration for Microsoft/Office 365 ([setup guide](#microsoft-calendar-setup))

### Deploy

```bash
# On your Homebridge host (or use the PowerShell script — see below)
git clone https://github.com/merlinmb/nextUp-calendar.git
cd nextUp-calendar

cp .env.example .env
# Edit .env if needed — the only required value is APP_URL

docker compose up -d
```

Then open **http://homebridge.local:3050** in your browser, click the ⚙ Settings icon, and connect your accounts.

### Windows / PowerShell deployment

A deployment script is included for deploying from a Windows machine over SSH:

```powershell
.\deploy.ps1
```

See [Deployment Script](#deployment-script) for configuration options.

---

## Configuration

All runtime configuration lives in two places:

| Location | Purpose |
|---|---|
| `.env` | Server-level config (port, app URL, optional session secret override) |
| Settings UI ⚙ | OAuth credentials, view preferences, theme — stored encrypted in `./data/settings.json` |

### `.env` reference

```bash
# Port the app listens on
PORT=3050

# Public URL — used to build OAuth callback URIs shown in Settings
APP_URL=http://homebridge.local:3050

NODE_ENV=production

# Optional: override the auto-generated session secret
# SESSION_SECRET=a-long-random-string
```

---

## Google Calendar Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**
2. Create an **OAuth 2.0 Client ID** (Application type: **Web application**)
3. Under **Authorised redirect URIs** add:
   ```
   http://homebridge.local:3050/auth/google/callback
   ```
4. Copy the **Client ID** and **Client Secret**
5. Enable the **Google Calendar API** under **APIs & Services** → **Enabled APIs**
6. In the nextUp Settings panel, paste the credentials and click **Connect Google**

> The OAuth consent screen scope required is `https://www.googleapis.com/auth/calendar.readonly`

---

## Microsoft Calendar Setup

1. Go to [Azure Portal](https://portal.azure.com/) → **Azure Active Directory** → **App registrations** → **New registration**
2. Set **Supported account types** to match your org (single tenant, or "Accounts in any org directory" for personal/work)
3. Under **Redirect URIs** add a **Web** redirect:
   ```
   http://homebridge.local:3050/auth/microsoft/callback
   ```
4. Go to **Certificates & secrets** → **New client secret** — copy the **Value**
5. Go to **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated**:
   - `Calendars.Read`
   - `User.Read`
   - `offline_access`
6. In the nextUp Settings panel, paste the **Application (client) ID**, **Directory (tenant) ID**, and **Client Secret**, then click **Connect Microsoft**

> Multi-factor authentication is handled transparently by the Microsoft login page.

---

## Deployment Script

`deploy.ps1` automates deployment to your Homebridge host over SSH from a Windows machine.

### Usage

```powershell
# Basic — uses defaults (homebridge.local, port 3050)
.\deploy.ps1

# Custom host
.\deploy.ps1 -Host myserver.local

# Custom SSH user and key
.\deploy.ps1 -Host homebridge.local -User pi -SshKey ~/.ssh/id_rsa

# Specify a remote directory
.\deploy.ps1 -RemoteDir /opt/nextup-calendar

# Force a clean rebuild of the Docker image
.\deploy.ps1 -Rebuild
```

### Parameters

| Parameter | Default | Description |
|---|---|---|
| `-Host` | `homebridge.local` | Hostname or IP of the Homebridge server |
| `-User` | `pi` | SSH username |
| `-SshKey` | *(system default)* | Path to SSH private key |
| `-RemoteDir` | `/opt/nextup-calendar` | Deployment directory on the remote host |
| `-AppUrl` | `http://<Host>:3050` | Public URL for OAuth callbacks |
| `-Port` | `3050` | Port to expose |
| `-Rebuild` | `false` | Force Docker image rebuild (`--no-cache`) |
| `-Branch` | `main` | Git branch to deploy |

---

## Architecture

```
nextUp-calendar/
├── server.js               # Express entry point
├── routes/
│   ├── auth.js             # OAuth2 flows (Google + Microsoft)
│   ├── calendar.js         # /api/calendar/events endpoint
│   └── settings.js         # /api/settings CRUD
├── services/
│   ├── store.js            # AES-256-GCM encrypted JSON storage
│   ├── google.js           # Google Calendar API (auto token refresh)
│   └── microsoft.js        # Microsoft Graph API (manual token refresh)
└── public/
    ├── index.html
    ├── css/app.css         # CSS custom properties, dark/light themes
    └── js/
        ├── app.js          # Main controller, navigation, routing
        ├── calendar.js     # View renderers (continuous/day/week/month)
        ├── search.js       # Fuzzy search overlay
        └── settings.js     # Settings drawer
```

### Token security

- On first boot a random 256-bit encryption key is written to `data/.enc_key` (mode 0600)
- All tokens and credential values are encrypted with **AES-256-GCM** before being written to `data/tokens.json` and `data/settings.json`
- The `./data` directory should be a Docker volume — it is excluded from git via `.gitignore`
- The server never exposes client secrets through any API response

---

## Views

| View | Keyboard shortcut | Description |
|---|---|---|
| Continuous | `∞` tab | Vertical timeline grouped by day, auto-scrolls to today |
| Day | `D` tab | Hourly grid for a single day with current-time indicator |
| Week | `W` tab | 7-column hourly grid; overlapping events shown side-by-side |
| Month | `M` tab | 6-week grid with event pills |

**Navigation:** `←` / `→` arrow keys, or the chevron buttons in the header. Press `T` to jump to today.

**Search:** Press any key (when not in an input field) or `/` to open the fuzzy search overlay. Use `↑` / `↓` to navigate results, `Enter` to select, `Esc` to close.

---

## Data persistence

The `./data` directory contains all runtime state:

| File | Contents |
|---|---|
| `data/.enc_key` | Auto-generated encryption key (never commit) |
| `data/.session_secret` | Auto-generated session secret (never commit) |
| `data/tokens.json` | Encrypted OAuth tokens |
| `data/settings.json` | App settings including encrypted credentials |

When updating the container, mount `./data` as a volume to preserve authentication state:

```yaml
volumes:
  - ./data:/app/data
```

---

## Updating

```bash
git pull
docker compose up -d --build
```

Or with the PowerShell script:

```powershell
.\deploy.ps1 -Rebuild
```

---

## License

MIT — see [LICENSE](LICENSE)

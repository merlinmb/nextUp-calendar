# nextUp Calendar

nextUp Calendar is a self-hosted calendar dashboard that combines Google Calendar and Microsoft 365 calendars into one lightweight web UI. It also exposes a token-protected JSON feed for companion clients and supports pushing external events into the cache through a simple HTTP API.

![Dark mode continuous view](docs/preview-dark.png)

## Features

- Unified Google Calendar and Microsoft 365 calendar view
- Four web views: Continuous, Day, Week, Month
- Configurable continuous look-ahead window and month view event density
- Per-calendar visibility controls for connected Google and Microsoft accounts
- Fast keyboard-driven search overlay
- Dark, light, and auto theme modes
- Background event sync with cached responses for fast page loads
- Session-protected web UI via a shared passphrase
- Token-protected APIs for read access and external event writes
- Electron desktop widget powered by the JSON feed
- OpenAPI schema published at `/openapi.yaml`
- Docker-first deployment with persistent encrypted credential storage

## Architecture At A Glance

The app has three access surfaces:

- Web UI: passphrase-protected session login at `/login`
- Read API: `GET /jsonCalendar` with `Authorization: Bearer <API_READ_TOKEN>`
- Write API: `POST /events` with `Authorization: Bearer <API_WRITE_TOKEN>`

OAuth credentials and user preferences are stored in `data/settings.json`. Provider tokens are encrypted at rest in `data/tokens.json`. The encryption key and session secret are generated automatically on first run and persisted in `data/.enc_key` and `data/.session_secret`.

## Quick Start

### Prerequisites

- Node.js 18+ if running directly
- Docker and Docker Compose if running in a container
- Google OAuth credentials if you want Google Calendar access
- Microsoft app registration if you want Microsoft 365 calendar access

### 1. Configure environment

Copy the example file and set the required values:

```bash
cp .env.example .env
```

Minimum recommended settings:

```bash
PORT=3050
APP_URL=http://homebridge.local:3050
UI_PASSPHRASE=choose-a-strong-passphrase
API_READ_TOKEN=choose-a-long-random-read-token
API_WRITE_TOKEN=choose-a-long-random-write-token
```

### 2. Start with Docker

```bash
docker compose up -d
```

Then open the app at your configured `APP_URL`, enter the UI passphrase on the login screen, and connect your calendar accounts from Settings.

### 3. Or run locally with Node.js

```bash
npm install
npm start
```

## Configuration

### Environment variables

The server reads configuration from `.env`.

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | No | HTTP port. Defaults to `3050`. |
| `APP_URL` | Yes | Public base URL used to build OAuth callback URIs. |
| `NODE_ENV` | No | Usually `production` or `development`. |
| `SESSION_SECRET` | No | Overrides the generated session secret. |
| `HTTPS` | No | Set to `true` only when serving behind TLS. |
| `UI_PASSPHRASE` | Yes | Shared passphrase required to access the web UI. |
| `API_READ_TOKEN` | Yes | Bearer token for `GET /jsonCalendar`. |
| `API_WRITE_TOKEN` | Yes | Bearer token for `POST /events`. |

### Persistent data

Mount `./data` as a persistent volume when running in Docker.

| File | Purpose |
|---|---|
| `data/.enc_key` | Generated encryption seed used for at-rest token encryption |
| `data/.session_secret` | Generated Express session secret |
| `data/settings.json` | Saved UI settings and provider credentials |
| `data/tokens.json` | Encrypted OAuth tokens |

## Web UI

The browser UI is protected by `UI_PASSPHRASE`. After login, the Settings panel lets you manage:

- Default calendar view
- Theme mode
- Week start day
- Continuous view look-ahead window
- Month view max visible events per day
- Google and Microsoft OAuth credentials
- Per-calendar visibility toggles for each connected provider
- Effective app URL used to display OAuth callback URIs

## Google Calendar Setup

1. Open Google Cloud Console.
2. Create an OAuth 2.0 client for a web application.
3. Add this redirect URI:

   ```text
   http://your-host:3050/auth/google/callback
   ```

4. Enable Google Calendar API.
5. Paste the client ID and client secret into the Settings panel.
6. Click Connect Google.

Required scope:

```text
https://www.googleapis.com/auth/calendar.readonly
```

## Microsoft 365 Setup

1. Open Azure Portal.
2. Create an App Registration.
3. Add this web redirect URI:

   ```text
   http://your-host:3050/auth/microsoft/callback
   ```

4. Create a client secret and copy its value.
5. Add delegated Microsoft Graph permissions:
   - `Calendars.Read`
   - `User.Read`
   - `offline_access`
6. Paste the client ID, tenant ID, and client secret into the Settings panel.
7. Click Connect Microsoft.

## API Surface

### Read calendar feed

`GET /jsonCalendar?timeframe=<value>`

This endpoint returns cached events from the in-memory store. It requires a bearer token:

```http
Authorization: Bearer <API_READ_TOKEN>
```

Supported `timeframe` formats:

| Example | Meaning |
|---|---|
| `24h` | Next 24 hours |
| `7d` | Next 7 days |
| `3m` | Next 3 months |

The server caps month-based requests at 12 months.

Example:

```bash
curl -H "Authorization: Bearer $API_READ_TOKEN" \
  "http://homebridge.local:3050/jsonCalendar?timeframe=7d"
```

### Push external events

`POST /events`

This endpoint lets automation tools push an external event set into the cache. Each request replaces the previously pushed external events.

Authentication:

```http
Authorization: Bearer <API_WRITE_TOKEN>
```

Example:

```bash
curl -X POST "http://homebridge.local:3050/events" \
  -H "Authorization: Bearer $API_WRITE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "id": "automation-standup",
        "title": "Standup",
        "start": "2026-04-22T09:00:00",
        "end": "2026-04-22T09:15:00",
        "calendarName": "Automation"
      }
    ]
  }'
```

Recurring external events are supported through the `recurrence` object described in [openapi.yaml](openapi.yaml).

### Health and schema

- `GET /health` returns a simple health response
- `GET /openapi.yaml` serves the OpenAPI document for the write and read APIs

## Views And Shortcuts

| View | Description |
|---|---|
| Continuous | Rolling timeline of upcoming days and events |
| Day | Single-day hourly layout |
| Week | Seven-column week grid |
| Month | Month grid with configurable event count per day |

Keyboard shortcuts:

- `Left` / `Right` to navigate
- `T` to jump to today
- `/` or most printable keys to open search
- `Esc` to close overlays

## Docker Deployment Notes

The included [docker-compose.yml](docker-compose.yml) mounts `./data:/app/data`, which preserves settings, tokens, and generated secrets across restarts.

To update an existing deployment:

```bash
git pull
docker compose up -d --build
```

## Windows Deployment Script

The included PowerShell deploy script copies or updates the repo on a remote Docker host over SSH and starts the container there.

Basic usage:

```powershell
.\deploy.ps1
```

Examples:

```powershell
.\deploy.ps1 -TargetHost homebridge.local
.\deploy.ps1 -TargetHost 192.168.1.50 -User pi -Rebuild
.\deploy.ps1 -SshKey ~/.ssh/id_rsa -RemoteDir /opt/nextup-calendar
```

Parameters:

| Parameter | Default |
|---|---|
| `-TargetHost` | `homebridge.local` |
| `-User` | `pi` |
| `-SshKey` | system default |
| `-RemoteDir` | `/home/pi/portainer_data/nextup-calendar` |
| `-AppUrl` | `http://<TargetHost>:3050` |
| `-Port` | `3050` |
| `-Rebuild` | off |
| `-Branch` | `main` |

## Electron Desktop Widget

The Electron widget is a separate desktop companion that reads from `GET /jsonCalendar` using `API_READ_TOKEN`.

### Build

```bash
cd electron
npm install
npm run build
```

The build output is written to `electron/dist/nextup-calendar.exe`.

### Configure

The widget reads build-time values from `electron/.env`:

```bash
SERVER_URL=http://homebridge.local:3050
READ_TOKEN=your-api-read-token
```

Rebuild the executable after changing those values.

### Development

From the repository root:

```bash
npm run widget
```

Or inside `electron/`:

```bash
npm start
```

## Project Structure

```text
nextUp-calendar/
├── server.js
├── routes/
├── services/
├── middleware/
├── public/
├── electron/
├── data/
├── docker-compose.yml
└── openapi.yaml
```

## License

MIT. See [LICENSE](LICENSE).

# ORDIS (Django + Gemini + PWA)

A simple class-helper chat app. Students type a question, the Django backend
calls the Google Gemini API, and the answer shows in the chat. It can be
installed as an app and shows a message when the internet is lost.

## Run it

```bash
python -m venv venv
venv\Scripts\activate          # Windows  (Mac/Linux: source venv/bin/activate)
pip install -r requirements.txt

copy .env.example .env         # Mac/Linux: cp .env.example .env
# open .env and paste your key from https://aistudio.google.com/apikey

python manage.py runserver
```

Open http://localhost:8000

## How it fits the activity

| Requirement | Where |
|---|---|
| Django backend, no database, no auth | `config/settings.py` (`DATABASES = {}`) |
| Gemini API call through the backend | `assistant/views.py` -> `chat()` |
| API key kept off the frontend and out of Git | `.env` (listed in `.gitignore`) |
| Chat UI + animated holographic core (HTML, CSS, Bootstrap, JS, SVG) | `assistant/templates/assistant/index.html`, `static/assistant/` |
| Web app manifest (name, icons, install) | `views.manifest` -> `/manifest.json` |
| Service worker (caches the app shell) | `templates/assistant/service-worker.js` -> `/service-worker.js` |
| Offline message | `static/assistant/js/app.js` -> `updateOnlineStatus()` |

## Test the PWA

1. Open the app in Chrome at `localhost` (HTTPS is only needed when deployed).
2. DevTools -> Application -> Manifest / Service Workers: both should show up.
3. An "Install app" button appears in the header (or use the browser's install icon).
4. DevTools -> Network -> set **Offline**, then reload. The app still opens and
   shows the offline banner. Send is disabled until you reconnect.

## Change the model

Edit `GEMINI_MODEL` in `.env` (default `gemini-2.5-flash`).

## Notes

- After editing static files, bump `PWA_CACHE_VERSION` in `settings.py` so
  browsers refresh the offline cache.
- Before deploying: set `DJANGO_DEBUG=False`, set a real `DJANGO_SECRET_KEY`,
  and serve over HTTPS (needed for service workers on a real domain).

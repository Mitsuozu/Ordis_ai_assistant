import json
import logging

import requests
from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.templatetags.static import static
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

logger = logging.getLogger(__name__)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

SYSTEM_PROMPT = (
    "You are ORDIS, a calm, friendly AI assistant with a touch of dry wit. "
    "Explain things in simple, "
    "clear language. Keep answers short (under about 150 words) unless the "
    "student asks for more. Use short numbered steps or bullet points when it "
    "helps. Use **bold** for key terms. If a question is unsafe or not "
    "appropriate for students, politely decline and suggest a safer topic."
)

MAX_PROMPT_CHARS = 2000
MAX_HISTORY_TURNS = 10


@ensure_csrf_cookie
@require_GET
def index(request):
    return render(request, "assistant/index.html")


@require_GET
def offline(request):
    return render(request, "assistant/offline.html")


@require_POST
def chat(request):
    """Receive a prompt, call Gemini from the server, return the reply as JSON."""
    try:
        body = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid request."}, status=400)

    prompt = str(body.get("prompt", "")).strip()
    if not prompt:
        return JsonResponse({"error": "Please type a question first."}, status=400)
    if len(prompt) > MAX_PROMPT_CHARS:
        return JsonResponse(
            {"error": f"Please keep your question under {MAX_PROMPT_CHARS} characters."},
            status=400,
        )

    if not settings.GEMINI_API_KEY:
        return JsonResponse(
            {"error": "The server has no Gemini API key yet. Add it to the .env file."},
            status=500,
        )

    # Build the conversation: recent history (kept in the browser) + new prompt.
    contents = []
    history = body.get("history", [])
    if isinstance(history, list):
        for item in history[-MAX_HISTORY_TURNS * 2:]:
            if not isinstance(item, dict):
                continue
            role = "model" if item.get("role") == "assistant" else "user"
            text = str(item.get("text", ""))[:MAX_PROMPT_CHARS]
            if text:
                contents.append({"role": role, "parts": [{"text": text}]})
    contents.append({"role": "user", "parts": [{"text": prompt}]})

    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": contents,
    }

    try:
        resp = requests.post(
            GEMINI_URL.format(model=settings.GEMINI_MODEL),
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": settings.GEMINI_API_KEY,
            },
            json=payload,
            timeout=30,
        )
    except requests.Timeout:
        return JsonResponse({"error": "The AI took too long to answer. Try again."}, status=504)
    except requests.RequestException:
        return JsonResponse({"error": "Could not reach the AI service. Check your internet."}, status=502)

    if resp.status_code != 200:
        logger.error("Gemini error %s: %s", resp.status_code, resp.text[:500])

    if resp.status_code == 429:
        return JsonResponse(
            {"error": "Too many requests right now (free-tier limit). Wait a minute and try again."},
            status=429,
        )
    if resp.status_code in (400, 401, 403):
        return JsonResponse(
            {"error": "The AI service rejected the request. Check your API key and model name."},
            status=502,
        )
    if resp.status_code == 404:
        return JsonResponse(
            {"error": "That Gemini model was not found. Check GEMINI_MODEL in .env."},
            status=502,
        )
    if resp.status_code != 200:
        return JsonResponse({"error": "The AI service had a problem. Try again."}, status=502)

    try:
        data = resp.json()
        parts = data["candidates"][0]["content"]["parts"]
        reply = "".join(p.get("text", "") for p in parts).strip()
    except (KeyError, IndexError, ValueError):
        reply = ""

    if not reply:
        reply = "I couldn't come up with an answer for that. Try rewording your question."

    return JsonResponse({"reply": reply})


@require_GET
def manifest(request):
    data = {
        "name": "ORDIS",
        "short_name": "ORDIS",
        "description": "ORDIS, a personal AI assistant powered by Google Gemini.",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "orientation": "portrait",
        "background_color": "#080B12",
        "theme_color": "#080B12",
        "icons": [
            {"src": static("assistant/icons/icon-192.png"), "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": static("assistant/icons/icon-512.png"), "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": static("assistant/icons/icon-maskable-512.png"), "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }
    return JsonResponse(data, content_type="application/manifest+json")


@require_GET
def service_worker(request):
    """Serve the service worker from the site root so it can control the whole app."""
    response = render(
        request,
        "assistant/service-worker.js",
        {"cache_version": settings.PWA_CACHE_VERSION},
        content_type="application/javascript",
    )
    response["Service-Worker-Allowed"] = "/"
    response["Cache-Control"] = "no-cache"
    return response

import os
from typing import Optional
from aiohttp import web

from database import get_search_history, get_score_history

BASE_DIR = os.path.dirname(__file__)
STATIC_DIR = os.path.join(BASE_DIR, "static")
INDEX_PATH = os.path.join(BASE_DIR, "index.html")

WEB_HOST = os.getenv("WEB_HOST", "0.0.0.0")
WEB_PORT = int(os.getenv("WEB_PORT", "8000"))


def _json_error(message: str, status: int = 400) -> web.Response:
    return web.json_response({"error": message}, status=status)


async def index(_request: web.Request) -> web.FileResponse:
    return web.FileResponse(INDEX_PATH)


def _parse_tg_id(request: web.Request) -> Optional[int]:
    tg_id = request.query.get("tg_id")
    if not tg_id:
        return None
    try:
        return int(tg_id)
    except ValueError:
        return None


async def api_profile(request: web.Request) -> web.Response:
    # MVP: отдаём только то, что нужно фронту (history). Если захочешь — расширим.
    tg_id = _parse_tg_id(request)
    if tg_id is None:
        return _json_error("Parameter `tg_id` is required and must be an integer.")

    score_history = get_score_history(tg_id)
    search_history = get_search_history(tg_id)
    return web.json_response(
        {
            "score_history": score_history,
            "search_history": search_history,
        }
    )


async def api_score_history(request: web.Request) -> web.Response:
    tg_id = _parse_tg_id(request)
    if tg_id is None:
        return _json_error("Parameter `tg_id` is required and must be an integer.")

    items = get_score_history(tg_id)
    return web.json_response({"items": items})


async def api_search_history(request: web.Request) -> web.Response:
    tg_id = _parse_tg_id(request)
    if tg_id is None:
        return _json_error("Parameter `tg_id` is required and must be an integer.")

    items = get_search_history(tg_id)
    return web.json_response({"items": items})


def create_web_app() -> web.Application:
    app = web.Application()

    app.router.add_get("/", index)
    app.router.add_static("/static", STATIC_DIR, show_index=False)

    app.router.add_get("/api/profile", api_profile)
    app.router.add_get("/api/score_history", api_score_history)
    app.router.add_get("/api/search_history", api_search_history)

    return app


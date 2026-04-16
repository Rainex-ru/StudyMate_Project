import os
from typing import Optional
from aiohttp import web

from database import get_search_history, get_score_history
from services.gigachat_service import get_ai_response

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


def _normalize_exam_type(exam_type: str) -> str:
    return (exam_type or "").strip().upper()


def build_recommend_prompt_from_score(latest: dict) -> str:
    exam_type = _normalize_exam_type(latest.get("exam_type", ""))
    subjects = latest.get("subjects") or []
    scores = latest.get("scores") or {}
    cities = latest.get("cities") or []

    subjects_text = ", ".join(subjects) if isinstance(subjects, list) else str(subjects)
    scores_text = ", ".join([f"{k}:{v}" for k, v in (scores or {}).items()]) if isinstance(scores, dict) else str(scores)
    cities_text = ", ".join(cities) if isinstance(cities, list) else str(cities)

    if exam_type == "ОГЭ":
        return (
            "Пользователь выбирает траекторию после 9 класса. "
            f"Города: {cities_text}. "
            f"Экзамен: ОГЭ. "
            f"Предметы и баллы: {scores_text}. "
            f"Направление (по предметам): {subjects_text}. "
            "Дополнительно: не указано. "
            "Верни 4-8 РЕАЛИСТИЧНЫХ вариантов только для поступления после ОГЭ: колледжи, техникумы, "
            "программы СПО при вузах. "
            "КРИТИЧЕСКОЕ ПРАВИЛО: не предлагай классические программы бакалавриата вузов, "
            "куда требуется ЕГЭ (например СамГУ, МГУ, ВШЭ, СПбГУ и т.п.). "
            "Не используй markdown и не вставляй ссылки."
        )

    # ЕГЭ по умолчанию
    return (
        "Пользователь выбирает варианты обучения после 11 класса. "
        f"Города: {cities_text}. "
        f"Экзамен: ЕГЭ. "
        f"Предметы и баллы: {scores_text}. "
        f"Направление (по предметам): {subjects_text}. "
        "Дополнительно: не указано. "
        "Верни 4-8 РЕАЛИСТИЧНЫХ вариантов вузов и специальностей, "
        "укажи направление/профиль и коротко объясни, почему подходит. "
        "Не используй markdown и не вставляй ссылки."
    )


def build_recommend_prompt_from_search(latest: dict) -> str:
    exam_type = _normalize_exam_type(latest.get("exam_type", ""))
    city = latest.get("city", "") or "город"
    subject = latest.get("subject", "") or "не указано"

    if exam_type == "ОГЭ":
        return (
            "Пользователь выбирает траекторию после 9 класса. "
            f"Город: {city}. Направление: {subject}. Экзамен: ОГЭ. "
            "Баллы в этом сценарии НЕ предоставлены. "
            "Верни 4-6 РЕАЛИСТИЧНЫХ вариантов только для поступления после ОГЭ: колледжи, техникумы, "
            "программы СПО при вузах, куда можно поступать по аттестату/ОГЭ. "
            "КРИТИЧЕСКОЕ ПРАВИЛО: не предлагай классические программы бакалавриата вузов, "
            "куда требуется ЕГЭ (например СамГУ, МГУ, ВШЭ, СПбГУ и т.п.). "
            "Не пиши \"уровень баллов низкий/средний/высокий\" и не делай выводов о баллах. "
            "Формат ответа: название учреждения, подходящая специальность, 1 короткая причина. "
            "Пиши простым языком для школьника, без markdown и без ссылок."
        )

    return (
        "Подбери абитуриенту варианты учебных заведений в городе "
        f"{city}. Направление интереса: {subject}. Экзамен: ЕГЭ. "
        "Баллы в этом сценарии НЕ предоставлены. "
        "Сделай ответ понятным для школьника: 4-6 вариантов, "
        "укажи направление/специальность и коротко объясни, почему подходит. "
        "Предлагай реалистичные вузы под поступление по ЕГЭ, без слишком случайных вариантов. "
        "Не пиши \"уровень баллов низкий/средний/высокий\" и не делай выводов о баллах. "
        "Не используй markdown-разметку и не придумывай ссылки."
    )


async def api_recommend_from_score(request: web.Request) -> web.Response:
    tg_id = _parse_tg_id(request)
    if tg_id is None:
        return _json_error("Parameter `tg_id` is required and must be an integer.")

    items = get_score_history(tg_id)
    if not items:
        return _json_error("No score history for this tg_id.", status=404)

    latest = items[0]
    prompt = build_recommend_prompt_from_score(latest)
    response = await get_ai_response(prompt)
    return web.json_response({"response": response})


async def api_recommend_from_search(request: web.Request) -> web.Response:
    tg_id = _parse_tg_id(request)
    if tg_id is None:
        return _json_error("Parameter `tg_id` is required and must be an integer.")

    items = get_search_history(tg_id)
    if not items:
        return _json_error("No search history for this tg_id.", status=404)

    latest = items[0]
    prompt = build_recommend_prompt_from_search(latest)
    response = await get_ai_response(prompt)
    return web.json_response({"response": response})


def create_web_app() -> web.Application:
    app = web.Application()

    app.router.add_get("/", index)
    app.router.add_static("/static", STATIC_DIR, show_index=False)

    app.router.add_get("/api/profile", api_profile)
    app.router.add_get("/api/score_history", api_score_history)
    app.router.add_get("/api/search_history", api_search_history)
    app.router.add_post("/api/recommend/from_score", api_recommend_from_score)
    app.router.add_post("/api/recommend/from_search", api_recommend_from_search)

    return app


import os
from typing import Any, Optional

from aiohttp import web

from database import (
    add_score_history,
    add_search_history,
    get_search_history,
    get_score_history,
    get_user_profile,
    save_user,
    upsert_web_user,
)
from handlers.career_test import QUESTIONS
from handlers.quiz import build_score_hint
from handlers.start import build_search_prompt
from services.gigachat_service import get_ai_response

BASE_DIR = os.path.dirname(__file__)
STATIC_DIR = os.path.join(BASE_DIR, "static")
INDEX_PATH = os.path.join(BASE_DIR, "index.html")

WEB_HOST = os.getenv("WEB_HOST", "0.0.0.0")
WEB_PORT = int(os.getenv("WEB_PORT", "8000"))


def _json_error(message: str, status: int = 400, details: Any = None) -> web.Response:
    payload = {"error": message}
    if details is not None:
        payload["details"] = details
    return web.json_response(payload, status=status)


async def _read_json(request: web.Request) -> dict:
    try:
        data = await request.json()
    except Exception:
        raise web.HTTPBadRequest(
            text=web.json_response({"error": "Request body must be valid JSON."}).text,
            content_type="application/json",
        )

    if not isinstance(data, dict):
        raise web.HTTPBadRequest(
            text=web.json_response({"error": "JSON body must be an object."}).text,
            content_type="application/json",
        )
    return data


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


def _require_tg_id(request: web.Request) -> int:
    tg_id = _parse_tg_id(request)
    if tg_id is None:
        raise ValueError("Parameter `tg_id` is required and must be an integer.")
    return tg_id


def _normalize_exam_type(exam_type: str) -> str:
    return (exam_type or "").strip().upper()


def _build_display_name(profile: Optional[dict], fallback_tg_id: Optional[int] = None) -> str:
    if not profile:
        return f"Пользователь {fallback_tg_id}" if fallback_tg_id else "Пользователь"

    first_name = (profile.get("first_name") or "").strip()
    last_name = (profile.get("last_name") or "").strip()
    username = (profile.get("username") or "").strip()

    full_name = " ".join(part for part in [first_name, last_name] if part)
    if full_name:
        return full_name
    if username:
        return f"@{username}"
    tg_id = profile.get("tg_id") or fallback_tg_id
    return f"Пользователь {tg_id}" if tg_id else "Пользователь"


def build_recommend_prompt_from_score(latest: dict) -> str:
    exam_type = _normalize_exam_type(latest.get("exam_type", ""))
    subjects = latest.get("subjects") or []
    scores = latest.get("scores") or {}
    cities = latest.get("cities") or []
    additional = latest.get("additional") or "не указано"

    subjects_text = ", ".join(subjects) if isinstance(subjects, list) else str(subjects)
    scores_text = ", ".join([f"{k}:{v}" for k, v in (scores or {}).items()]) if isinstance(scores, dict) else str(scores)
    cities_text = ", ".join(cities) if isinstance(cities, list) else str(cities)
    profile_hint = build_score_hint(scores if isinstance(scores, dict) else {}, exam_type)

    if exam_type == "ОГЭ":
        return (
            "Пользователь выбирает траекторию после 9 класса. "
            f"Города: {cities_text}. "
            f"Экзамен: ОГЭ. "
            f"Предметы и баллы: {scores_text}. "
            f"Направление (по предметам): {subjects_text}. "
            f"Дополнительно: {additional}. "
            f"{profile_hint} "
            "Верни 4-8 РЕАЛИСТИЧНЫХ вариантов только для поступления после ОГЭ: колледжи, техникумы, "
            "программы СПО при вузах. "
            "КРИТИЧЕСКОЕ ПРАВИЛО: не предлагай классические программы бакалавриата вузов, "
            "куда требуется ЕГЭ (например СамГУ, МГУ, ВШЭ, СПбГУ и т.п.). "
            "Не используй markdown и не вставляй ссылки."
        )

    return (
        "Пользователь выбирает варианты обучения после 11 класса. "
        f"Города: {cities_text}. "
        f"Экзамен: ЕГЭ. "
        f"Предметы и баллы: {scores_text}. "
        f"Направление (по предметам): {subjects_text}. "
        f"Дополнительно: {additional}. "
        f"{profile_hint} "
        "Верни 4-8 РЕАЛИСТИЧНЫХ вариантов вузов и специальностей, "
        "укажи направление/профиль и коротко объясни, почему подходит. "
        "Не используй markdown и не вставляй ссылки."
    )


def build_recommend_prompt_from_search(latest: dict) -> str:
    exam_type = _normalize_exam_type(latest.get("exam_type", ""))
    city = latest.get("city", "") or "город"
    subject = latest.get("subject", "") or "не указано"
    return build_search_prompt(city, subject, exam_type)


def _extract_dashboard(profile: Optional[dict], tg_id: int) -> dict:
    score_history = get_score_history(tg_id)
    search_history = get_search_history(tg_id)
    latest_score = score_history[0] if score_history else None
    latest_search = search_history[0] if search_history else None

    return {
        "profile": profile,
        "display_name": _build_display_name(profile, tg_id),
        "stats": {
            "score_history_count": len(score_history),
            "search_history_count": len(search_history),
            "has_profile": profile is not None,
        },
        "latest_score": latest_score,
        "latest_search": latest_search,
        "score_history": score_history,
        "search_history": search_history,
    }


def _career_test_prompt(answers: list[str]) -> str:
    return (
        "На основе этих ответов на тест профориентации кратко определи подходящее направление карьеры, "
        "2-4 интересных направления обучения и короткое объяснение, почему они подходят. "
        "Пиши простым языком для школьника, без markdown, без ссылок. "
        f"Ответы: {'; '.join(answers)}"
    )


def _validate_score_payload(data: dict) -> tuple[dict, list[str], str, list[str], str]:
    profession = (data.get("profession") or "").strip()
    subjects = data.get("subjects") or []
    scores = data.get("scores") or {}
    cities = data.get("cities") or []
    exam_type = (data.get("exam_type") or "").strip().upper()
    additional = (data.get("additional") or "").strip()

    if not profession:
        raise ValueError("Field `profession` is required.")
    if exam_type not in {"ОГЭ", "ЕГЭ"}:
        raise ValueError("Field `exam_type` must be either `ОГЭ` or `ЕГЭ`.")
    if not isinstance(subjects, list) or not subjects:
        raise ValueError("Field `subjects` must be a non-empty array.")
    if not isinstance(cities, list) or not cities:
        raise ValueError("Field `cities` must be a non-empty array.")
    if not isinstance(scores, dict) or not scores:
        raise ValueError("Field `scores` must be a non-empty object.")

    normalized_scores = {}
    for subject_name, raw_value in scores.items():
        try:
            numeric_value = int(raw_value)
        except (TypeError, ValueError):
            raise ValueError(f"Score for `{subject_name}` must be an integer from 0 to 100.")
        if numeric_value < 0 or numeric_value > 100:
            raise ValueError(f"Score for `{subject_name}` must be an integer from 0 to 100.")
        normalized_scores[str(subject_name)] = numeric_value

    return normalized_scores, [str(item) for item in subjects], exam_type, [str(item) for item in cities], additional


async def api_profile(request: web.Request) -> web.Response:
    try:
        tg_id = _require_tg_id(request)
    except ValueError as exc:
        return _json_error(str(exc))

    profile = get_user_profile(tg_id)
    score_history = get_score_history(tg_id)
    search_history = get_search_history(tg_id)
    return web.json_response(
        {
            "profile": profile,
            "display_name": _build_display_name(profile, tg_id),
            "score_history": score_history,
            "search_history": search_history,
        }
    )


async def api_dashboard(request: web.Request) -> web.Response:
    try:
        tg_id = _require_tg_id(request)
    except ValueError as exc:
        return _json_error(str(exc))

    profile = get_user_profile(tg_id)
    return web.json_response(_extract_dashboard(profile, tg_id))


async def api_score_history(request: web.Request) -> web.Response:
    try:
        tg_id = _require_tg_id(request)
    except ValueError as exc:
        return _json_error(str(exc))

    items = get_score_history(tg_id)
    return web.json_response({"items": items})


async def api_search_history(request: web.Request) -> web.Response:
    try:
        tg_id = _require_tg_id(request)
    except ValueError as exc:
        return _json_error(str(exc))

    items = get_search_history(tg_id)
    return web.json_response({"items": items})


async def api_auth_telegram(request: web.Request) -> web.Response:
    try:
        data = await _read_json(request)
        user = data.get("user") if isinstance(data.get("user"), dict) else data
        tg_id = user.get("id") or user.get("tg_id")
        if tg_id is None:
            return _json_error("Field `id` or `tg_id` is required in Telegram auth payload.")
        user["id"] = int(tg_id)
        profile = upsert_web_user(user)
        return web.json_response(
            {
                "ok": True,
                "profile": profile,
                "display_name": _build_display_name(profile, user["id"]),
            }
        )
    except ValueError as exc:
        return _json_error(str(exc))
    except Exception as exc:
        return _json_error("Failed to process Telegram auth payload.", status=500, details=str(exc))


async def api_career_test_questions(_request: web.Request) -> web.Response:
    items = [
        {
            "id": index + 1,
            "question": item["question"],
            "options": item["options"],
        }
        for index, item in enumerate(QUESTIONS)
    ]
    return web.json_response({"items": items, "total": len(items)})


async def api_career_test_submit(request: web.Request) -> web.Response:
    try:
        data = await _read_json(request)
        answers = data.get("answers")
        if not isinstance(answers, list) or len(answers) != len(QUESTIONS):
            return _json_error(f"Field `answers` must be an array with {len(QUESTIONS)} items.")

        normalized_answers = []
        for index, answer in enumerate(answers):
            question = QUESTIONS[index]
            if answer not in question["options"]:
                return _json_error(f"Answer #{index + 1} is invalid for the provided question.")
            normalized_answers.append(f"Вопрос {index + 1}: {question['question']} - Ответ: {answer}")

        result = await get_ai_response(_career_test_prompt(normalized_answers))
        return web.json_response(
            {
                "result": result,
                "answers": normalized_answers,
            }
        )
    except web.HTTPBadRequest as exc:
        return web.Response(text=exc.text, status=exc.status, content_type="application/json")
    except Exception as exc:
        return _json_error("Failed to process career test.", status=500, details=str(exc))


async def api_search_submit(request: web.Request) -> web.Response:
    try:
        data = await _read_json(request)
        tg_id = data.get("tg_id")
        city = (data.get("city") or "").strip()
        subject = (data.get("subject") or "не указано").strip() or "не указано"
        exam_type = _normalize_exam_type(data.get("exam_type", ""))

        if tg_id is None:
            return _json_error("Field `tg_id` is required.")
        try:
            tg_id = int(tg_id)
        except (TypeError, ValueError):
            return _json_error("Field `tg_id` must be an integer.")
        if not city:
            return _json_error("Field `city` is required.")
        if exam_type not in {"ОГЭ", "ЕГЭ"}:
            return _json_error("Field `exam_type` must be either `ОГЭ` or `ЕГЭ`.")

        if get_user_profile(tg_id) is None:
            save_user({"id": tg_id})

        add_search_history(tg_id, city, subject, exam_type)
        prompt = build_search_prompt(city, subject, exam_type)
        response = await get_ai_response(prompt)
        return web.json_response(
            {
                "response": response,
                "saved": {
                    "tg_id": tg_id,
                    "city": city,
                    "subject": subject,
                    "exam_type": exam_type,
                },
            }
        )
    except web.HTTPBadRequest as exc:
        return web.Response(text=exc.text, status=exc.status, content_type="application/json")
    except Exception as exc:
        return _json_error("Failed to process university search.", status=500, details=str(exc))


async def api_recommend_quiz_submit(request: web.Request) -> web.Response:
    try:
        data = await _read_json(request)
        tg_id = data.get("tg_id")
        if tg_id is None:
            return _json_error("Field `tg_id` is required.")
        try:
            tg_id = int(tg_id)
        except (TypeError, ValueError):
            return _json_error("Field `tg_id` must be an integer.")

        normalized_scores, subjects, exam_type, cities, additional = _validate_score_payload(data)
        profession = (data.get("profession") or "").strip()

        if get_user_profile(tg_id) is None:
            save_user({"id": tg_id})

        entry = {
            "profession": profession,
            "scores": normalized_scores,
            "exam_type": exam_type,
            "subjects": subjects,
            "cities": cities,
            "additional": additional,
        }
        add_score_history(tg_id, entry)

        profile_hint = build_score_hint(normalized_scores, exam_type)
        prompt = (
            f"Пользователь хочет стать {profession}. "
            f"Сдает {exam_type}: предметы {', '.join(subjects)}, баллы "
            f"{', '.join([f'{key}:{value}' for key, value in normalized_scores.items()])}. "
            f"Города: {', '.join(cities)}. "
            f"Дополнительно: {additional or 'не указано'}. "
            f"{profile_hint} "
            "Учитывай тип экзамена: если ОГЭ, то подбирай только вузы и программы, которые реально принимают ОГЭ; "
            "если ЕГЭ, то ориентируйся на требования ЕГЭ. "
            "Не используй markdown и не вставляй символы типа ###, **, __, `. "
            "Не добавляй ссылки, если не уверен в их работоспособности. "
            "Дай рекомендации по вузам и специальностям, подходящим по баллам и интересам, и объясни, почему они подходят."
        )
        response = await get_ai_response(prompt)

        return web.json_response(
            {
                "response": response,
                "saved_entry": entry,
                "score_hint": profile_hint,
            }
        )
    except ValueError as exc:
        return _json_error(str(exc))
    except web.HTTPBadRequest as exc:
        return web.Response(text=exc.text, status=exc.status, content_type="application/json")
    except Exception as exc:
        return _json_error("Failed to process recommendation quiz.", status=500, details=str(exc))


async def api_supplement(request: web.Request) -> web.Response:
    try:
        data = await _read_json(request)
        previous_response = (data.get("previous_response") or "").strip()
        supplement = (data.get("supplement") or "").strip()

        if not previous_response:
            return _json_error("Field `previous_response` is required.")
        if not supplement:
            return _json_error("Field `supplement` is required.")

        prompt = f"Предыдущий ответ: {previous_response}. Дополни на основе: {supplement}"
        response = await get_ai_response(prompt)
        return web.json_response({"response": response})
    except web.HTTPBadRequest as exc:
        return web.Response(text=exc.text, status=exc.status, content_type="application/json")
    except Exception as exc:
        return _json_error("Failed to process supplement request.", status=500, details=str(exc))


async def api_recommend_from_score(request: web.Request) -> web.Response:
    try:
        tg_id = _require_tg_id(request)
    except ValueError as exc:
        return _json_error(str(exc))

    items = get_score_history(tg_id)
    if not items:
        return _json_error("No score history for this tg_id.", status=404)

    latest = items[0]
    prompt = build_recommend_prompt_from_score(latest)
    response = await get_ai_response(prompt)
    return web.json_response({"response": response})


async def api_recommend_from_search(request: web.Request) -> web.Response:
    try:
        tg_id = _require_tg_id(request)
    except ValueError as exc:
        return _json_error(str(exc))

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

    app.router.add_post("/api/auth/telegram", api_auth_telegram)
    app.router.add_get("/api/profile", api_profile)
    app.router.add_get("/api/dashboard", api_dashboard)
    app.router.add_get("/api/score_history", api_score_history)
    app.router.add_get("/api/search_history", api_search_history)
    app.router.add_get("/api/career_test/questions", api_career_test_questions)
    app.router.add_post("/api/career_test/submit", api_career_test_submit)
    app.router.add_post("/api/search/submit", api_search_submit)
    app.router.add_post("/api/recommend/quiz_submit", api_recommend_quiz_submit)
    app.router.add_post("/api/supplement", api_supplement)
    app.router.add_post("/api/recommend/from_score", api_recommend_from_score)
    app.router.add_post("/api/recommend/from_search", api_recommend_from_search)

    return app
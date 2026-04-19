from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
    WebAppInfo,
)

from config import WEB_APP_URL


def _web_url() -> str:
    url = WEB_APP_URL or "https://example.com"
    if not url.startswith("https://"):
        return "https://example.com"
    return url


def webapp_inline_kb() -> InlineKeyboardMarkup:
    """Inline-кнопка открытия веб-приложения (основной вход)."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🚀 Открыть StudyMate",
                    web_app=WebAppInfo(url=_web_url()),
                )
            ]
        ]
    )


def main_kb():
    """Клавиатура: первая строка — Web App, далее базовые сценарии в чате."""
    web_btn = KeyboardButton(
        text="🚀 Открыть StudyMate",
        web_app=WebAppInfo(url=_web_url()),
    )
    kb = [
        [web_btn],
        [
            KeyboardButton(text="📝 Пройти опрос"),
            KeyboardButton(text="🔎 Найти университет"),
        ],
        [KeyboardButton(text="📋 Мои баллы"), KeyboardButton(text="🗨️ Помощь")],
        [
            KeyboardButton(text="📌 Советы"),
            KeyboardButton(text="🧠 Тест на профориентацию"),
        ],
        [KeyboardButton(text="📘 Инструкция")],
    ]
    return ReplyKeyboardMarkup(keyboard=kb, resize_keyboard=True)


def ai_response_kb():
    kb = [[KeyboardButton(text="🔄Дополнить ответ")]]
    return ReplyKeyboardMarkup(keyboard=kb, resize_keyboard=True)

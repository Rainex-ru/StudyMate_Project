"""
Сообщения, не обработанные сценариями start / quiz / career_test:
короткий ответ + кнопка открытия веб-приложения.
Роутер подключать в Dispatcher последним.
"""

from aiogram import F, Router
from aiogram.types import Message

from database import save_user
from keyboards.keyboard import main_kb, webapp_inline_kb

router = Router()

SHORT_WEB_HINT = (
    "Основной интерфейс StudyMate — на сайте (кнопка ниже).\n"
    "В этом чате доступны упрощённые сценарии кнопками."
)


@router.message(F.text.startswith("/") & ~F.text.in_({"/start", "/admin"}))
async def unknown_command(message: Message) -> None:
    """Неизвестные команды (/start и /admin обрабатываются в handlers.start)."""
    save_user(message.from_user)
    await message.answer(
        "Неизвестная команда. Откройте веб-приложение:",
        reply_markup=webapp_inline_kb(),
    )


@router.message()
async def push_web_fallback(message: Message) -> None:
    """Любые остальные апдейты (текст, стикеры, фото и т.д.), не взятые другими роутерами."""
    if not message.from_user:
        return
    save_user(message.from_user)
    await message.answer(SHORT_WEB_HINT, reply_markup=webapp_inline_kb())
    await message.answer("Или пользуйтесь кнопками:", reply_markup=main_kb())

from aiogram import Router, types, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext

from config import ADMIN_USERNAMES
from database import save_user, get_score_history, add_search_history, get_stats
from handlers.states import SearchUni
from keyboards.keyboard import main_kb
from keyboards.reply import score_history_inline_kb
from services.gigachat_service import get_ai_response
router = Router()


def format_score_entry(entry: dict, page: int, total: int) -> str:
    lines = [f'{subj}: {score}' for subj, score in entry.get('scores', {}).items()]
    subjects = ', '.join(entry.get('subjects', [])) or 'не указаны'
    cities = ', '.join(entry.get('cities', [])) or 'не указаны'
    return (
        f'<b>Мои баллы</b> — {page + 1}/{total}\n'
        f'Экзамен: <b>{entry.get("exam_type", "")}</b>\n'
        f'Предметы: <b>{subjects}</b>\n'
        f'Города: <b>{cities}</b>\n\n'
        'Баллы:\n'
        + '\n'.join(lines)
    )


def build_search_prompt(city: str, subject: str, exam_type: str) -> str:
    return (
        f'Подбери абитуриенту варианты учебных заведений в городе {city}. '
        f'Направление интереса: {subject}. Экзамен: {exam_type}. '
        'Сделай ответ понятным для школьника: 4-6 вариантов, '
        'укажи направление/специальность и коротко объясни, почему подходит. '
        'Если это ОГЭ — предлагай только реалистичные варианты для траектории после ОГЭ. '
        'Если это ЕГЭ — учитывай поступление в вузы по ЕГЭ. '
        'Не используй markdown-разметку и не придумывай ссылки.'
    )

@router.message(Command("start"))
async def cmd_start(message:types.Message):
    save_user(message.from_user)
    await message.answer(
        f'<b>Привет, {message.from_user.first_name}!</b> 👋\n'
        '<i>Я — StudyMate.</i> Помогу подобрать учебное заведение по твоим баллам и интересам.\n\n'
        '<b>Как пользоваться ботом:</b>\n'
        '1) Нажми <b>📝 Пройти опрос</b> и заполни шаги.\n'
        '2) Получи персональные рекомендации от ИИ.\n'
        '3) Используй <b>🔎 Найти университет</b>, если хочешь быстрый поиск по городу и направлению.\n'
        '4) В <b>📋 Мои баллы</b> можно посмотреть сохраненные результаты.\n\n'
        '<b>Начни с кнопки ниже:</b>',
        reply_markup=main_kb(),
        parse_mode='HTML'
    )

@router.message(Command("admin"))
async def admin_panel(message: types.Message):
    if message.from_user.username not in ADMIN_USERNAMES:
        await message.answer('Доступ ограничен.')
        return
    stats = get_stats()
    await message.answer(
        f'<b>Admin Panel</b>\n'
        f'Пользователей: {stats["total_users"]}\n'
        f'Записей баллов: {stats["total_scores"]}\n'
        f'Поисковых запросов: {stats["total_searches"]}',
        parse_mode='HTML'
    )

@router.message(F.text.in_(['🔎 Найти университет', 'Найти университет']))
async def start_search(message:types.Message, state: FSMContext):
    save_user(message.from_user)
    await state.set_state(SearchUni.waiting_for_city)
    await message.answer(
        '<b>В каком городе ищем вуз?</b>',
        parse_mode='HTML'
    )

@router.message(F.text.in_(['📋 Мои баллы', 'Мои баллы']))
async def show_scores(message: types.Message, state: FSMContext):
    save_user(message.from_user)
    history = get_score_history(message.from_user.id)
    if not history:
        await message.answer(
            '<i>Пока нет сохранённых баллов. Пройди опрос, чтобы сохранить результаты.</i>',
            parse_mode='HTML'
        )
        return

    page = 0
    await state.update_data(scores_page=page, score_history=history)
    entry = history[page]
    text = format_score_entry(entry, page, len(history))
    markup = score_history_inline_kb(page, len(history))
    await message.answer(text, parse_mode='HTML', reply_markup=markup)

@router.message(F.text.in_(['🗨️ Помощь', 'Помощь']))
async def help_text(message: types.Message):
    await message.answer(
        '<b>StudyMate</b> помогает:\n'
        '• подобрать вуз по баллам\n'
        '• выбрать подходящую специальность\n'
        '• найти университеты в нужном городе\n\n'
        'Если возникнут вопросы — пиши <b>@awaiting_winter</b>.\n'
        'Нажми <b>📝 Пройти опрос</b>, чтобы начать.',
        parse_mode='HTML'
    )

@router.message(F.text.in_(['📌 Советы', 'Советы']))
async def advice_text(message: types.Message):
    await message.answer(
        '<b>Советы для успешного выбора:</b>\n'
        '1. Оцени свои баллы реально.\n'
        '2. Сравни бюджетные и платные варианты.\n'
        '3. Учти формат обучения и город.\n\n'
        'Если хочешь — начни опрос, и я помогу подобрать вуз индивидуально.',
        parse_mode='HTML'
    )

@router.message(SearchUni.waiting_for_city)
async def search_by_city(message: types.Message, state: FSMContext):
    save_user(message.from_user)
    await state.update_data(search_city=message.text.strip())
    await state.set_state(SearchUni.waiting_for_subject)
    await message.answer(
        '<b>Какое направление тебя интересует?</b>\n'
        'Например: программирование, экономика или дизайн.',
        parse_mode='HTML'
    )

@router.message(SearchUni.waiting_for_subject)
async def search_by_subject(message: types.Message, state: FSMContext):
    await state.update_data(search_subject=message.text.strip())
    await state.set_state(SearchUni.waiting_for_exam_type)
    await message.answer(
        '<b>Какой тип экзамена?</b> Выбери ОГЭ или ЕГЭ.',
        parse_mode='HTML',
        reply_markup=types.ReplyKeyboardMarkup(
            keyboard=[[types.KeyboardButton(text='ОГЭ'), types.KeyboardButton(text='ЕГЭ')]],
            resize_keyboard=True
        )
    )

@router.message(SearchUni.waiting_for_exam_type)
async def search_by_exam_type(message: types.Message, state: FSMContext):
    if message.text not in ['ОГЭ', 'ЕГЭ']:
        await message.answer('Пожалуйста, выбери ОГЭ или ЕГЭ.')
        return

    data = await state.get_data()
    city = data.get('search_city', '')
    subject = data.get('search_subject', '')
    exam_type = message.text
    add_search_history(message.from_user.id, city, subject, exam_type)
    await message.answer('Секунду, подбираю рекомендации через ИИ...')
    prompt = build_search_prompt(city or 'город', subject or 'общее направление', exam_type)
    response = await get_ai_response(prompt)
    await state.clear()
    await message.answer(response, parse_mode='HTML', reply_markup=main_kb())

@router.callback_query(F.data == 'scores_prev')
async def scores_prev(callback_query: types.CallbackQuery, state: FSMContext):
    await callback_query.answer()
    data = await state.get_data()
    history = data.get('score_history', [])
    if not history:
        return
    page = max(0, data.get('scores_page', len(history) - 1) - 1)
    await state.update_data(scores_page=page)
    entry = history[page]
    await callback_query.message.edit_text(
        format_score_entry(entry, page, len(history)),
        parse_mode='HTML',
        reply_markup=score_history_inline_kb(page, len(history))
    )

@router.callback_query(F.data == 'scores_next')
async def scores_next(callback_query: types.CallbackQuery, state: FSMContext):
    await callback_query.answer()
    data = await state.get_data()
    history = data.get('score_history', [])
    if not history:
        return
    page = min(len(history) - 1, data.get('scores_page', len(history) - 1) + 1)
    await state.update_data(scores_page=page)
    entry = history[page]
    await callback_query.message.edit_text(
        format_score_entry(entry, page, len(history)),
        parse_mode='HTML',
        reply_markup=score_history_inline_kb(page, len(history))
    )
    
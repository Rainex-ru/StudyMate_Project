from aiogram import Router, types, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext

from config import ADMIN_USERNAMES
from database import save_user, get_score_history, add_search_history, get_stats
from handlers.states import SearchUni
from keyboards.keyboard import main_kb
from keyboards.reply import score_history_inline_kb
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


def get_university_suggestions(city: str, subject: str, exam_type: str, scores: dict) -> str:
    city_lower = city.lower()
    exam_text = 'ОГЭ' if exam_type.upper() == 'ОГЭ' else 'ЕГЭ'
    normalized_scores = [int(v) for v in scores.values() if isinstance(v, int) or (isinstance(v, str) and v.isdigit())]
    average = sum(normalized_scores) / len(normalized_scores) if normalized_scores else 0
    score_category = 'низкий' if average < 55 else 'средний' if average < 70 else 'высокий'

    if 'казань' in city_lower:
        if score_category == 'низкий':
            suggestions = [
                ('<b>Казанский национальный исследовательский технологический университет (КНИТУ-КАИ)</b>', 'ИТ, программная инженерия, информационные системы'),
                ('<b>Казанский государственный энергетический университет</b>', 'компьютерные науки, кибербезопасность'),
                ('<b>Казанский кооперативный институт</b>', 'прикладная информатика, программирование')
            ]
        elif score_category == 'средний':
            suggestions = [
                ('<b>Казанский федеральный университет (КФУ)</b>', 'информатика, прикладная математика, программирование'),
                ('<b>Казанский национальный исследовательский технологический университет (КНИТУ-КАИ)</b>', 'ИТ, программная инженерия, информационные системы'),
                ('<b>Казанский государственный энергетический университет</b>', 'компьютерные науки, кибербезопасность')
            ]
        else:
            suggestions = [
                ('<b>Казанский федеральный университет (КФУ)</b>', 'информатика, программная инженерия, прикладная математика'),
                ('<b>Казанский национальный исследовательский технологический университет (КНИТУ-КАИ)</b>', 'адаптивная кибербезопасность, ИТ-аналитика'),
                ('<b>Казанский государственный энергетический университет</b>', 'компьютерные науки, робототехника')
            ]
    elif 'самара' in city_lower:
        suggestions = [
            ('<b>Самарский национальный исследовательский университет им. С.П. Королёва (СамГУ)</b>', 'информатика, вычислительная техника, безопасность'),
            ('<b>Самарский государственный университет</b>', 'программирование, прикладная информатика, аналитика данных'),
            ('<b>Санкт-Петербургский государственный политехнический университет</b>', 'программная инженерия, робототехника')
        ]
    elif 'тольятти' in city_lower:
        suggestions = [
            ('<b>Тольяттинский государственный университет (ТГУ)</b>', 'информационные системы, программная инженерия, робототехника'),
            ('<b>Тольяттинский государственный университет им. В.И. Ленина</b>', 'технические науки, ИТ-специальности, автоматизация'),
            ('<b>Самарский государственный университет</b>', 'широкий выбор программ в регионе')
        ]
    elif 'москва' in city_lower:
        if score_category == 'низкий':
            suggestions = [
                ('<b>Московский технический университет связи и информатики</b>', 'программирование, ИТ, кибербезопасность'),
                ('<b>Московский политех</b>', 'информационные системы, программная инженерия'),
                ('<b>Московский государственный технический университет им. Н.Э. Баумана</b>', 'информационные технологии, роботехника')
            ]
        elif score_category == 'средний':
            suggestions = [
                ('<b>Национальный исследовательский университет «Высшая школа экономики»</b>', 'прикладная информатика, бизнес-информатика'),
                ('<b>Московский технический университет связи и информатики</b>', 'программирование, ИТ, кибербезопасность'),
                ('<b>Московский государственный технический университет им. Н.Э. Баумана</b>', 'программная инженерия, прикладная математика')
            ]
        else:
            suggestions = [
                ('<b>Высшая школа экономики (НИУ ВШЭ)</b>', 'прикладная информатика, программирование, аналитика данных'),
                ('<b>Национальный исследовательский университет «МЭИ»</b>', 'компьютерные науки, электротехника'),
                ('<b>Московский физико-технический институт (МФТИ)</b>', 'программирование, прикладная математика')
            ]
    else:
        if score_category == 'низкий':
            suggestions = [
                ('<b>Томский государственный университет систем управления и радиоэлектроники (ТУСУР)</b>', 'информационные технологии, кибербезопасность'),
                ('<b>Пензенский государственный университет</b>', 'прикладное программирование, информационные системы'),
                ('<b>Кубанский государственный технологический университет</b>', 'программная инженерия, автоматизация')
            ]
        elif score_category == 'средний':
            suggestions = [
                ('<b>Уральский федеральный университет</b>', 'информационные системы, вычислительная техника'),
                ('<b>Самарский национальный исследовательский университет им. С.П. Королёва (СамГУ)</b>', 'информатика, инженерия программного обеспечения'),
                ('<b>Санкт-Петербургский государственный политехнический университет</b>', 'программная инженерия, робототехника')
            ]
        else:
            suggestions = [
                ('<b>Национальный исследовательский университет «Высшая школа экономики»</b>', 'прикладная информатика, бизнес-информатика'),
                ('<b>Московский физико-технический институт (МФТИ)</b>', 'программирование, прикладная математика'),
                ('<b>Национальный исследовательский университет «МЭИ»</b>', 'компьютерные науки, электротехника')
            ]

    exam_note = (
        'Если выбран ОГЭ, ориентируйся на колледжи и программы, которые реально принимают ОГЭ. '
        'Для ЕГЭ выбирай профильные университеты и специальности.'
    )
    lines = [f'{name} — специальности: {fields}' for name, fields in suggestions]
    return (
        f'<b>Рекомендации по вузам для города {city.title()}</b>\n'
        f'Направление: <b>{subject}</b> ({exam_text})\n'
        f'Уровень баллов: <b>{score_category}</b>. {exam_note}\n\n'
        + '\n'.join(lines)
    )

@router.message(Command("start"))
async def cmd_start(message:types.Message):
    save_user(message.from_user)
    await message.answer(
        f'<b>Привет, {message.from_user.first_name}!</b> 👋\n'
        '<i>Я — StudyMate.</i> Помогу выбрать вуз, специальность и город по твоим баллам.\n\n'
        '<b>Выбери одну из кнопок ниже:</b>',
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
    response = get_university_suggestions(city or 'город', subject, exam_type, data.get('scores', {}))
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
    
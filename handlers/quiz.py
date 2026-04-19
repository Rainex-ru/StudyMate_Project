from aiogram import Router, types, F
from aiogram.fsm.context import FSMContext
from handlers.states import Quiz
from keyboards.reply import ai_response_inline_kb
from services.gigachat_service import get_ai_response
from database import save_user, add_score_history
from keyboards.keyboard import main_kb

POPULAR_SUBJECTS = ['Математика', 'Русский язык', 'Литература', 'История', 'Обществознание', 'Английский язык', 'Физика', 'Химия', 'Биология', 'Информатика', 'География']

TOP_CITIES = ['Москва', 'Санкт-Петербург', 'Екатеринбург', 'Новосибирск', 'Казань', 'Нижний Новгород', 'Челябинск', 'Самара', 'Омск', 'Ростов-на-Дону']

def subjects_inline_kb(selected):
    buttons = []
    for subj in POPULAR_SUBJECTS:
        status = '✅' if subj in selected else '⬜'
        buttons.append(types.InlineKeyboardButton(text=f'{status} {subj}', callback_data=f'subj_{subj}'))
    buttons.append(types.InlineKeyboardButton(text='Готово', callback_data='subjects_done'))
    return types.InlineKeyboardMarkup(inline_keyboard=[buttons[i:i+3] for i in range(0, len(buttons), 3)])

def cities_inline_kb(selected):
    buttons = []
    for city in TOP_CITIES:
        status = '✅' if city in selected else '⬜'
        buttons.append(types.InlineKeyboardButton(text=f'{status} {city}', callback_data=f'city_{city}'))
    buttons.append(types.InlineKeyboardButton(text='✍️ Ввести город вручную', callback_data='city_manual'))
    buttons.append(types.InlineKeyboardButton(text='Готово', callback_data='cities_done'))
    return types.InlineKeyboardMarkup(inline_keyboard=[buttons[i:i+3] for i in range(0, len(buttons), 3)])


def build_score_hint(scores: dict, exam_type: str) -> str:
    if not scores:
        return 'Сделай рекомендации только на основе указанных результатов, не предлагай топовые вузы без проверки баллов.'
    normalized = {k.lower(): v for k, v in scores.items()}
    core_scores = [normalized.get('математика', 0), normalized.get('информатика', 0), normalized.get('физика', 0), normalized.get('химия', 0)]
    profile_scores = [v for v in core_scores if v > 0]
    average = sum(profile_scores) / len(profile_scores) if profile_scores else 0
    if average < 55:
        return ('У пользователя низкий профильный уровень баллов (менее 55 по основным предметам). '
                'Не предлагай МГУ, ВШЭ, СПбГУ и другие топовые федеральные вузы, '
                'несколько рейтинг‑более низких региональных университетов приоритетнее.')
    if average < 70:
        return ('У пользователя средний уровень баллов (55–70). '
                'Предлагай вузы среднего уровня с реальными проходными баллами, избегай слишком дорогих и очень престижных вариантов.')
    return ('У пользователя хороший уровень баллов. '
            'Можно предлагать более сильные технические и профильные вузы, но по-прежнему ориентируйся на реалистичность рекомендаций.')


def is_study_topic_supplement(text: str) -> bool:
    raw = (text or '').strip().lower()
    if len(raw) < 3:
        return False
    edu_keywords = (
        'вуз', 'универс', 'колледж', 'техникум', 'спо',
        'егэ', 'огэ', 'балл', 'предмет', 'поступ',
        'направлен', 'специаль', 'професс', 'факульт',
        'город', 'общежит', 'прием'
    )
    return any(k in raw for k in edu_keywords)


def score_options_keyboard():
    return types.ReplyKeyboardMarkup(
        keyboard=[
            [types.KeyboardButton(text=text) for text in ['40', '50', '60', '70']],
            [types.KeyboardButton(text=text) for text in ['80', '85', '90', '95']],
            [types.KeyboardButton(text='Ввести вручную')]
        ],
        resize_keyboard=True
    )


async def ask_score_for_subject(message: types.Message, subject: str):
    await message.answer(
        f'<b>Укажи балл по предмету {subject}.</b>\n'
        'Выбери кнопку или нажми «Ввести вручную», если нужен точный балл.',
        parse_mode='HTML',
        reply_markup=score_options_keyboard()
    )

router = Router()

@router.message(F.text.in_(['📝 Пройти опрос', 'Пройти опрос']))
async def start_quiz(message: types.Message, state: FSMContext):
    if await state.get_state():
        await state.clear()
    await state.set_state(Quiz.quiz_profession)
    await message.answer(
        '<b>Кем ты хочешь стать?</b>\n'
        'Напиши направление, например:\n'
        '• врач\n'
        '• программист\n'
        '• учитель',
        parse_mode='HTML',
        reply_markup=types.ReplyKeyboardRemove()
    )

@router.message(Quiz.quiz_profession)
async def process_profession(message: types.Message, state: FSMContext):
    await state.update_data(profession=message.text)
    await state.set_state(Quiz.quiz_subjects_select)
    await state.update_data(selected_subjects=[])
    await message.answer(
        '<b>Выбери предметы, которые ты сдаёшь:</b>\nКликай на предметы, чтобы выбрать или снять.',
        parse_mode='HTML',
        reply_markup=subjects_inline_kb([])
    )

@router.callback_query(F.data.startswith('subj_'))
async def handle_subject_selection(callback_query: types.CallbackQuery, state: FSMContext):
    subj = callback_query.data[5:]  # subj_Математика -> Математика
    data = await state.get_data()
    selected = data.get('selected_subjects', [])
    if subj in selected:
        selected.remove(subj)
    else:
        selected.append(subj)
    await state.update_data(selected_subjects=selected)
    await callback_query.message.edit_reply_markup(reply_markup=subjects_inline_kb(selected))

@router.callback_query(F.data == 'subjects_done')
async def subjects_done(callback_query: types.CallbackQuery, state: FSMContext):
    data = await state.get_data()
    selected = data.get('selected_subjects', [])
    if not selected:
        await callback_query.answer('Выбери хотя бы один предмет!')
        return
    await state.update_data(subjects=selected)
    await state.set_state(Quiz.quiz_exam_type)
    await callback_query.answer()
    await callback_query.message.edit_reply_markup(reply_markup=None)
    await callback_query.message.answer(
        f'<b>Выбранные предметы:</b> {", ".join(selected)}\n\n<b>Это ОГЭ или ЕГЭ?</b>',
        parse_mode='HTML',
        reply_markup=types.ReplyKeyboardMarkup(
            keyboard=[[types.KeyboardButton(text='ОГЭ'), types.KeyboardButton(text='ЕГЭ')]],
            resize_keyboard=True
        )
    )

@router.message(Quiz.quiz_exam_type)
async def process_exam_type(message: types.Message, state: FSMContext):
    if message.text not in ['ОГЭ', 'ЕГЭ']:
        await message.answer('Пожалуйста, выбери ОГЭ или ЕГЭ.')
        return
    await state.update_data(exam_type=message.text)
    data = await state.get_data()
    subjects = data.get('subjects', [])
    await state.update_data(score_subjects=subjects, score_index=0, scores={})
    await state.set_state(Quiz.quiz_scores)
    if subjects:
        await ask_score_for_subject(message, subjects[0])
    else:
        await message.answer('Не удалось прочитать список предметов. Попробуй заново.', reply_markup=types.ReplyKeyboardRemove())

@router.message(Quiz.quiz_scores)
async def process_scores(message: types.Message, state: FSMContext):
    data = await state.get_data()
    score_subjects = data.get('score_subjects', [])
    index = data.get('score_index', 0)
    if index >= len(score_subjects):
        await message.answer('Произошла ошибка, начнем заново. Нажми «📝 Пройти опрос».')
        await state.clear()
        return

    current_subject = score_subjects[index]
    text = message.text.strip()
    if text.lower() == 'ввести вручную':
        await message.answer('Введите точный балл от 0 до 100 для предмета «' + current_subject + '».', reply_markup=types.ReplyKeyboardRemove())
        return

    try:
        score = int(text)
    except ValueError:
        await message.answer(
            '<b>Неверный формат.</b> Выбери кнопку или введи число от 0 до 100.',
            parse_mode='HTML',
            reply_markup=score_options_keyboard()
        )
        return

    if score < 0 or score > 100:
        await message.answer(
            '<b>Баллы должны быть от 0 до 100.</b>',
            parse_mode='HTML',
            reply_markup=score_options_keyboard()
        )
        return

    scores = data.get('scores', {})
    scores[current_subject] = score
    index += 1
    await state.update_data(scores=scores, score_index=index)

    if index < len(score_subjects):
        await ask_score_for_subject(message, score_subjects[index])
        return

    history = data.get('score_history', [])
    entry = {
        'scores': scores,
        'exam_type': data.get('exam_type', ''),
        'subjects': data.get('subjects', []),
        'cities': []
    }
    history.append(entry)
    save_user(message.from_user)
    add_score_history(message.from_user.id, entry)
    await state.update_data(scores=scores, score_history=history, scores_page=len(history) - 1)
    await state.set_state(Quiz.quiz_cities_select)
    await state.update_data(selected_cities=[])
    await message.answer(
        '<b>В каких городах ты хочешь учиться?</b>\nВыбери города из списка:',
        parse_mode='HTML',
        reply_markup=types.ReplyKeyboardRemove()
    )
    await message.answer(
        'Можно выбрать города кнопками ниже или добавить свой вручную.',
        parse_mode='HTML',
        reply_markup=cities_inline_kb([])
    )

@router.callback_query(F.data.startswith('city_'))
async def handle_city_selection(callback_query: types.CallbackQuery, state: FSMContext):
    city = callback_query.data[5:]  # city_Москва -> Москва
    data = await state.get_data()
    selected = data.get('selected_cities', [])
    if city in selected:
        selected.remove(city)
    else:
        selected.append(city)
    await state.update_data(selected_cities=selected)
    await callback_query.message.edit_reply_markup(reply_markup=cities_inline_kb(selected))


@router.callback_query(F.data == 'city_manual')
async def city_manual_input(callback_query: types.CallbackQuery, state: FSMContext):
    await callback_query.answer()
    await state.set_state(Quiz.quiz_city_manual_input)
    await callback_query.message.answer(
        '<b>Введите название города вручную:</b>\n'
        'Например: Пермь, Уфа, Владивосток.',
        parse_mode='HTML',
        reply_markup=types.ReplyKeyboardRemove()
    )


@router.message(Quiz.quiz_city_manual_input)
async def save_manual_city(message: types.Message, state: FSMContext):
    city = message.text.strip()
    if len(city) < 2:
        await message.answer('Название города слишком короткое. Попробуй еще раз.')
        return

    data = await state.get_data()
    selected = data.get('selected_cities', [])
    if city not in selected:
        selected.append(city)
        await state.update_data(selected_cities=selected)

    await state.set_state(Quiz.quiz_cities_select)
    await message.answer(
        f'Город <b>{city}</b> добавлен. Выбери еще города или нажми "Готово".',
        parse_mode='HTML',
        reply_markup=cities_inline_kb(selected)
    )

@router.callback_query(F.data == 'cities_done')
async def cities_done(callback_query: types.CallbackQuery, state: FSMContext):
    data = await state.get_data()
    selected = data.get('selected_cities', [])
    if not selected:
        await callback_query.answer('Выбери хотя бы один город!')
        return
    await state.update_data(cities=selected)
    history = data.get('score_history', [])
    page = data.get('scores_page', len(history) - 1)
    if 0 <= page < len(history):
        history[page]['cities'] = selected
        await state.update_data(score_history=history)
    await state.set_state(Quiz.quiz_additional)
    await callback_query.message.edit_text(
        f'<b>Выбранные города:</b> {", ".join(selected)}\n\n<b>Есть дополнительные пожелания?</b>\n'
        'Например:\n'
        '• бюджет или платно\n'
        '• уровень вуза\n'
        '• интересные специальности',
        parse_mode='HTML'
    )

@router.message(Quiz.quiz_additional)
async def process_additional(message: types.Message, state: FSMContext):
    await state.update_data(additional=message.text)
    data = await state.get_data()
    await state.set_state(Quiz.ai_processing)
    await message.answer('✨ <b>Отлично!</b> Обрабатываю данные...', parse_mode='HTML')

    # Составляем промпт
    profession = data.get('profession', '')
    subjects = ', '.join(data.get('subjects', []))
    exam_type = data.get('exam_type', '')
    scores = ', '.join([f'{k}:{v}' for k, v in data.get('scores', {}).items()])
    cities = ', '.join(data.get('cities', []))
    additional = data.get('additional', '')

    profile_hint = build_score_hint(data.get('scores', {}), exam_type)

    if exam_type == 'ОГЭ':
        prompt = f"""
    Пользователь хочет стать {profession}.
    Сдаёт ОГЭ после 9 класса: предметы {subjects}, отметки/баллы {scores}.
    Города: {cities}.
    Дополнительно: {additional}.
    {profile_hint}
    КРИТИЧЕСКИ ВАЖНО: это траектория после 9 класса. Предлагай ТОЛЬКО среднее профессиональное образование:
    техникумы, колледжи, училища, СПО и программы при вузах, куда поступают по аттестату/ОГЭ.
    НЕ предлагай бакалавриат в классических вузах, где нужен ЕГЭ (МГУ, ВШЭ, СПбГУ и т.п.).
    Не используй markdown и не вставляй символы типа ###, **, __, `.
    Не добавляй ссылки, если не уверен в их работоспособности.
    Дай 4–8 реалистичных вариантов СПО и объясни, почему они подходят.
    """
    else:
        prompt = f"""
    Пользователь хочет стать {profession}.
    Сдаёт ЕГЭ: предметы {subjects}, баллы {scores}.
    Города: {cities}.
    Дополнительно: {additional}.
    {profile_hint}
    Ориентируйся на поступление в вуз по ЕГЭ: вузы и специальности под эти баллы.
    Не используй markdown и не вставляй символы типа ###, **, __, `.
    Не добавляй ссылки, если не уверен в их работоспособности.
    Дай рекомендации по вузам и специальностям и объясни, почему они подходят.
    """

    response = await get_ai_response(prompt)
    await state.update_data(ai_response=response)
    await state.set_state(Quiz.ai_response)
    await message.answer(response, reply_markup=ai_response_inline_kb())
    await message.answer(
        'Главное меню снова доступно. Если хочешь, можешь пройти опрос еще раз или сразу найти университет.',
        reply_markup=main_kb()
    )

@router.message(F.text.in_(['🔄Дополнить ответ', 'Дополнить ответ']))
async def supplement_response(message: types.Message, state: FSMContext):
    await state.set_state(Quiz.supplement_input)
    await message.answer('Напиши, что добавить или уточнить.', reply_markup=types.ReplyKeyboardRemove())

@router.callback_query(F.data == 'supplement_answer')
async def supplement_answer_callback(callback_query: types.CallbackQuery, state: FSMContext):
    await callback_query.answer()
    await state.set_state(Quiz.supplement_input)
    await callback_query.message.answer('Напиши, что добавить или уточнить.', reply_markup=types.ReplyKeyboardRemove())

@router.message(Quiz.supplement_input)
async def handle_supplement_input(message: types.Message, state: FSMContext):
    data = await state.get_data()
    if not is_study_topic_supplement(message.text or ''):
        await message.answer(
            'Уточнение не по теме. Я могу дополнять только вопросы о поступлении, '
            'ОГЭ/ЕГЭ, баллах, предметах, городах и специальностях.'
        )
        return
    previous_response = data.get('ai_response', '')
    prompt = (
        f"Контекст прошлого ответа: {previous_response}. "
        "КРИТИЧЕСКОЕ ПРАВИЛО: дополняй только по теме поступления, ОГЭ/ЕГЭ, баллов, "
        f"предметов, городов и специальностей. Уточнение пользователя: {message.text}"
    )
    response = await get_ai_response(prompt)
    await state.update_data(ai_response=response)
    await state.set_state(Quiz.ai_response)
    await message.answer(response, reply_markup=ai_response_inline_kb())

@router.message(Quiz.ai_response)
async def handle_ai_response_text(message: types.Message, state: FSMContext):
    data = await state.get_data()
    if not is_study_topic_supplement(message.text or ''):
        await message.answer(
            'Сообщение не по теме StudyMate. Для экономии токенов уточняйте только '
            'поступление, ОГЭ/ЕГЭ, баллы, предметы, города и специальности.'
        )
        return
    previous_prompt = (
        f"Контекст прошлого ответа: {data.get('ai_response', '')}. "
        "Дополняй только по теме поступления и выбора учебной траектории. "
        f"Уточнение: {message.text}"
    )
    response = await get_ai_response(previous_prompt)
    await state.update_data(ai_response=response)
    await message.answer(response, reply_markup=ai_response_inline_kb())

from aiogram import Router, types, F
from aiogram.fsm.context import FSMContext
from handlers.states import Quiz
from keyboards.keyboard import main_kb, ai_response_kb
from services.gigachat_service import get_ai_response

router = Router()

@router.message(F.text.in_(['📝Пройти опрос', 'Пройти опрос']))
async def start_quiz(message: types.Message, state: FSMContext):
    await state.set_state(Quiz.quiz_profession)
    await message.answer(
        'Кем хочешь работать в будущем?\n'
        'Например:\n'
        '• врач\n'
        '• программист\n'
        '• учитель',
        reply_markup=types.ReplyKeyboardRemove()
    )

@router.message(Quiz.quiz_profession)
async def process_profession(message: types.Message, state: FSMContext):
    await state.update_data(profession=message.text)
    await state.set_state(Quiz.quiz_subjects)
    await message.answer(
        'Какие предметы ты сдаешь?\n'
        'Напиши через запятую.\n'
        'Например:\n'
        'математика, русский, биология'
    )

@router.message(Quiz.quiz_subjects)
async def process_subjects(message: types.Message, state: FSMContext):
    subjects = [s.strip() for s in message.text.split(',')]
    await state.update_data(subjects=subjects)
    await state.set_state(Quiz.quiz_exam_type)
    await message.answer('Это ОГЭ или ЕГЭ?', reply_markup=types.ReplyKeyboardMarkup(
        keyboard=[[types.KeyboardButton(text='ОГЭ'), types.KeyboardButton(text='ЕГЭ')]],
        resize_keyboard=True
    ))

@router.message(Quiz.quiz_exam_type)
async def process_exam_type(message: types.Message, state: FSMContext):
    if message.text not in ['ОГЭ', 'ЕГЭ']:
        await message.answer('Пожалуйста, выбери ОГЭ или ЕГЭ.')
        return
    await state.update_data(exam_type=message.text)
    await state.set_state(Quiz.quiz_scores)
    data = await state.get_data()
    subjects = data.get('subjects', [])
    await message.answer(
        'Укажи баллы по предметам:\n'
        f'({", ".join(subjects)})\n'
        'В формате:\n'
        'математика:85, русский:90',
        reply_markup=types.ReplyKeyboardRemove()
    )

@router.message(Quiz.quiz_scores)
async def process_scores(message: types.Message, state: FSMContext):
    try:
        scores = {}
        for pair in message.text.split(','):
            subj, score = pair.split(':')
            scores[subj.strip()] = int(score.strip())
        await state.update_data(scores=scores)
        await state.set_state(Quiz.quiz_cities)
        await message.answer(
            'В каких городах ты хочешь учиться?\n'
            'Напиши через запятую.\n'
            'Например:\n'
            'Москва, Санкт-Петербург'
        )
    except:
        await message.answer(
            'Неверный формат.\n'
            'Пиши так:\n'
            'математика:85, русский:90'
        )

@router.message(Quiz.quiz_cities)
async def process_cities(message: types.Message, state: FSMContext):
    cities = [c.strip() for c in message.text.split(',')]
    await state.update_data(cities=cities)
    await state.set_state(Quiz.quiz_additional)
    await message.answer(
        'Есть дополнительные пожелания?\n'
        'Например:\n'
        '• бюджет или платно\n'
        '• уровень вуза\n'
        '• интересные специальности'
    )

@router.message(Quiz.quiz_additional)
async def process_additional(message: types.Message, state: FSMContext):
    await state.update_data(additional=message.text)
    data = await state.get_data()
    await state.set_state(Quiz.ai_processing)
    await message.answer('Обрабатываю данные...')

    # Составляем промпт
    profession = data.get('profession', '')
    subjects = ', '.join(data.get('subjects', []))
    exam_type = data.get('exam_type', '')
    scores = ', '.join([f'{k}:{v}' for k, v in data.get('scores', {}).items()])
    cities = ', '.join(data.get('cities', []))
    additional = data.get('additional', '')

    prompt = f"""
    Пользователь хочет стать {profession}.
    Сдает {exam_type}: предметы {subjects}, баллы {scores}.
    Города: {cities}.
    Дополнительно: {additional}.
    Рекомендуй вузы и специальности в этих городах, подходящие по баллам и интересам. Объясни почему.
    """

    # Отправляем в ИИ
    response = await get_ai_response(prompt)
    await state.update_data(ai_response=response)
    await state.set_state(Quiz.ai_response)
    await message.answer(response, parse_mode='HTML', reply_markup=ai_response_kb())

@router.message(F.text.in_(['🔄Дополнить ответ', 'Дополнить ответ']))
async def supplement_response(message: types.Message, state: FSMContext):
    await state.set_state(Quiz.supplement_input)
    await message.answer('Напиши, что добавить или уточнить.', reply_markup=types.ReplyKeyboardRemove())

@router.message(Quiz.supplement_input)
async def handle_supplement_input(message: types.Message, state: FSMContext):
    data = await state.get_data()
    previous_response = data.get('ai_response', '')
    prompt = f"Предыдущий ответ: {previous_response}. Дополни на основе: {message.text}"
    response = await get_ai_response(prompt)
    await state.update_data(ai_response=response)
    await state.set_state(Quiz.ai_response)
    await message.answer(response, parse_mode='HTML', reply_markup=ai_response_kb())

@router.message(Quiz.ai_response)
async def handle_ai_response_text(message: types.Message, state: FSMContext):
    data = await state.get_data()
    previous_prompt = f"Предыдущий ответ: {data.get('ai_response', '')}. Дополни: {message.text}"
    response = await get_ai_response(previous_prompt)
    await state.update_data(ai_response=response)
    await message.answer(response, parse_mode='HTML', reply_markup=ai_response_kb())

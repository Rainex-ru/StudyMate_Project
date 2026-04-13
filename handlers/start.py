from aiogram import Router, types, F
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext

from keyboards.keyboard import main_kb
from handlers.states import SearchUni
router = Router()

@router.message(Command("start"))
async def cmd_start(message:types.Message):
    await message.answer(
        f'Привет, {message.from_user.first_name}!\n'
        'Я — StudyMate, бот, который поможет выбрать вуз по твоим баллам и интересам.\n'
        'Нажми кнопку ниже, чтобы начать опрос.',
        reply_markup=main_kb()
    )

@router.message(F.text == '🔎Найти университет')
async def start_search(message:types.Message, state: FSMContext):
    await state.set_state(SearchUni.waiting_for_city)
    await message.answer('В каком городе ищем вуз?')

@router.message(F.text == '📋Мои баллы ОГЭ/ЕГЭ')
async def show_scores(message: types.Message, state: FSMContext):
    data = await state.get_data()
    scores = data.get('scores')
    exam_type = data.get('exam_type')
    if not scores or not exam_type:
        await message.answer('Сначала пройди опрос через кнопку «📝Пройти опрос», а потом сможешь посмотреть свои баллы.')
        return

    lines = [f'{subj}: {score}' for subj, score in scores.items()]
    await message.answer(
        'Твои данные по экзаменам:\n'
        f'Тип экзамена: {exam_type}\n'
        'Баллы:\n'
        + '\n'.join(lines)
    )

@router.message(F.text == '🗨️Помощь')
async def help_text(message: types.Message):
    await message.answer(
        'Я помогу выбрать вуз на основе твоих баллов и интересов.\n'
        'Нажми «📝Пройти опрос», чтобы начать.\n'
        'Или выбери «🔎Найти университет», если хочешь искать вуз по городу.'
    )

@router.message(SearchUni.waiting_for_subject)
async def procces_subject(message:types.Message, state: FSMContext):
    user_data = await state.get_data()
    city = user_data.get('city')
    subject = message.text

    await state.clear() #сброс состояния после конца поиска
    
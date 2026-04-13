from aiogram import Router, types, F
from aiogram.fsm.context import FSMContext
from handlers.states import CareerTest
from services.gigachat_service import get_ai_response
from keyboards.keyboard import main_kb

router = Router()

QUESTIONS = [
    {
        "question": "Любишь ли ты работать с числами и логикой?",
        "options": ["Да, очень", "Иногда", "Нет, не люблю"]
    },
    {
        "question": "Предпочитаешь ли ты работать с людьми или в одиночку?",
        "options": ["С людьми", "В одиночку", "Зависит от ситуации"]
    },
    {
        "question": "Интересуешься ли ты творчеством и искусством?",
        "options": ["Да", "Нет", "Немного"]
    },
    {
        "question": "Хочешь ли ты помогать людям в их проблемах?",
        "options": ["Да, это мое", "Иногда", "Нет"]
    },
    {
        "question": "Любишь ли ты эксперименты и исследования?",
        "options": ["Да", "Нет", "Иногда"]
    },
    {
        "question": "Тебе нравится решать технические задачи?",
        "options": ["Да, обожаю", "Иногда", "Не очень"]
    },
    {
        "question": "Предпочитаешь ли ты стабильную работу или творческую?",
        "options": ["Стабильную", "Творческую", "Смешанную"]
    },
    {
        "question": "Интересуешься ли ты наукой и технологиями?",
        "options": ["Очень", "Немного", "Не интересует"]
    },
    {
        "question": "Тебе нравится общаться и убеждать других?",
        "options": ["Да", "Иногда", "Нет"]
    },
    {
        "question": "Хочешь ли ты создавать что-то новое?",
        "options": ["Да", "Нет", "Иногда"]
    }
]

def get_keyboard(options):
    return types.ReplyKeyboardMarkup(
        keyboard=[[types.KeyboardButton(text=opt)] for opt in options],
        resize_keyboard=True
    )

@router.message(F.text.in_(['🧠 Тест на профориентацию', 'Тест на профориентацию']))
async def start_career_test(message: types.Message, state: FSMContext):
    await state.set_state(CareerTest.test_question_1)
    await state.update_data(test_answers=[], test_index=0)
    q = QUESTIONS[0]
    await message.answer(
        f'<b>Вопрос 1/10:</b> {q["question"]}',
        parse_mode='HTML',
        reply_markup=get_keyboard(q["options"])
    )

@router.message(CareerTest.test_question_1)
async def process_q1(message: types.Message, state: FSMContext):
    await process_question(message, state, 0, CareerTest.test_question_2)

@router.message(CareerTest.test_question_2)
async def process_q2(message: types.Message, state: FSMContext):
    await process_question(message, state, 1, CareerTest.test_question_3)

@router.message(CareerTest.test_question_3)
async def process_q3(message: types.Message, state: FSMContext):
    await process_question(message, state, 2, CareerTest.test_question_4)

@router.message(CareerTest.test_question_4)
async def process_q4(message: types.Message, state: FSMContext):
    await process_question(message, state, 3, CareerTest.test_question_5)

@router.message(CareerTest.test_question_5)
async def process_q5(message: types.Message, state: FSMContext):
    await process_question(message, state, 4, CareerTest.test_question_6)

@router.message(CareerTest.test_question_6)
async def process_q6(message: types.Message, state: FSMContext):
    await process_question(message, state, 5, CareerTest.test_question_7)

@router.message(CareerTest.test_question_7)
async def process_q7(message: types.Message, state: FSMContext):
    await process_question(message, state, 6, CareerTest.test_question_8)

@router.message(CareerTest.test_question_8)
async def process_q8(message: types.Message, state: FSMContext):
    await process_question(message, state, 7, CareerTest.test_question_9)

@router.message(CareerTest.test_question_9)
async def process_q9(message: types.Message, state: FSMContext):
    await process_question(message, state, 8, CareerTest.test_question_10)

@router.message(CareerTest.test_question_10)
async def process_q10(message: types.Message, state: FSMContext):
    data = await state.get_data()
    answers = data.get('test_answers', [])
    q = QUESTIONS[9]
    if message.text in q["options"]:
        answers.append(f"Вопрос 10: {q['question']} - Ответ: {message.text}")
        await state.update_data(test_answers=answers)
        await state.set_state(CareerTest.test_result)
        # Generate AI response
        prompt = f"На основе этих ответов на тест профориентации, кратко определи подходящее направление карьеры: {'; '.join(answers)}. Дай краткий ответ без лишнего."
        result = await get_ai_response(prompt)
        await message.answer(
            f'<b>Результат теста:</b> {result}\n\nТеперь можешь пройти основной опрос для подбора вуза.',
            parse_mode='HTML',
            reply_markup=main_kb()
        )
        await state.clear()
    else:
        await message.answer('Выбери один из вариантов.', reply_markup=get_keyboard(q["options"]))

async def process_question(message: types.Message, state: FSMContext, q_index: int, next_state):
    data = await state.get_data()
    answers = data.get('test_answers', [])
    q = QUESTIONS[q_index]
    if message.text in q["options"]:
        answers.append(f"Вопрос {q_index+1}: {q['question']} - Ответ: {message.text}")
        await state.update_data(test_answers=answers)
        await state.set_state(next_state)
        next_q = QUESTIONS[q_index + 1]
        await message.answer(
            f'<b>Вопрос {q_index+2}/10:</b> {next_q["question"]}',
            parse_mode='HTML',
            reply_markup=get_keyboard(next_q["options"])
        )
    else:
        await message.answer('Выбери один из вариантов.', reply_markup=get_keyboard(q["options"]))
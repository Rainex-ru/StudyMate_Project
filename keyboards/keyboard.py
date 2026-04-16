from aiogram.types import ReplyKeyboardMarkup, KeyboardButton


def main_kb():
    kb = [
        [KeyboardButton(text='📝 Пройти опрос'), KeyboardButton(text='🔎 Найти университет')],
        [KeyboardButton(text='📋 Мои баллы'), KeyboardButton(text='🗨️ Помощь')],
        [KeyboardButton(text='📌 Советы'), KeyboardButton(text='🧠 Тест на профориентацию')],
        [KeyboardButton(text='📘 Инструкция')]
    ]
    return ReplyKeyboardMarkup(keyboard=kb, resize_keyboard=True)

def ai_response_kb():
    kb = [
        [KeyboardButton(text='🔄Дополнить ответ')]
    ]
    return ReplyKeyboardMarkup(keyboard=kb, resize_keyboard=True)
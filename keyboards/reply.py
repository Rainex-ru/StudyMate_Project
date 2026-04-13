from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton


def ai_response_inline_kb():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text='🔄 Дополнить ответ', callback_data='supplement_answer')]
    ])


def score_history_inline_kb(current: int, total: int):
    buttons = []
    if current > 0:
        buttons.append(InlineKeyboardButton(text='◀️ Назад', callback_data='scores_prev'))
    if current < total - 1:
        buttons.append(InlineKeyboardButton(text='Вперед ▶️', callback_data='scores_next'))
    if not buttons:
        return None
    return InlineKeyboardMarkup(inline_keyboard=[buttons])

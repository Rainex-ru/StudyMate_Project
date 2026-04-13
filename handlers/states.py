from aiogram.fsm.state import StatesGroup, State

class SearchUni(StatesGroup):
    waiting_for_city = State()
    waiting_for_subject = State()

class Quiz(StatesGroup):
    quiz_profession = State()
    quiz_subjects = State()
    quiz_exam_type = State()
    quiz_scores = State()
    quiz_cities = State()
    quiz_additional = State()
    ai_processing = State()
    ai_response = State()
    supplement_input = State()
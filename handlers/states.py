from aiogram.fsm.state import StatesGroup, State

class SearchUni(StatesGroup):
    waiting_for_city = State()
    waiting_for_subject = State()
    waiting_for_exam_type = State()

class Quiz(StatesGroup):
    quiz_profession = State()
    quiz_subjects_select = State()
    quiz_subjects = State()
    quiz_exam_type = State()
    quiz_scores = State()
    quiz_cities_select = State()
    quiz_cities = State()
    quiz_additional = State()
    ai_processing = State()
    ai_response = State()
    supplement_input = State()

class CareerTest(StatesGroup):
    test_question_1 = State()
    test_question_2 = State()
    test_question_3 = State()
    test_question_4 = State()
    test_question_5 = State()
    test_question_6 = State()
    test_question_7 = State()
    test_question_8 = State()
    test_question_9 = State()
    test_question_10 = State()
    test_result = State()
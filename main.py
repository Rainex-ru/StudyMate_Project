import asyncio
import logging
import os
import fcntl
from aiogram import Bot, Dispatcher, Router
from aiogram.fsm.storage.memory import MemoryStorage
from config import BOT_TOKEN
from database import init_db
from handlers import start, quiz, career_test


# Включаем логгирование бота в терминале для отладки
logging.basicConfig(level=logging.INFO)


def acquire_single_instance_lock():
    lock_path = os.path.join(os.path.dirname(__file__), '.bot_polling.lock')
    lock_file = open(lock_path, 'w')
    try:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock_file.close()
        raise RuntimeError('Bot is already running in another process.')
    return lock_file


async def main():
    lock_file = acquire_single_instance_lock()
    init_db()
    bot = Bot(token=BOT_TOKEN)
    dp = Dispatcher(storage=MemoryStorage())

    dp.include_routers(start.router, quiz.router, career_test.router)

    print("Bot is running!")
    try:
        await dp.start_polling(bot)
    finally:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
        lock_file.close()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Bot is shutted down!")
    except RuntimeError as exc:
        print(str(exc))

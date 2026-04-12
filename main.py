import asyncio
import logging
from aiogram import Bot, Dispatcher, Router
from config import BOT_TOKEN
from aiogram.client.session.aiohttp import AiohttpSession
from handlers import start, quiz


#Включаем логгирование бота в терминале для отладки
logging.basicConfig(level=logging.INFO)

#Подключаем прокси
proxy_url = "socks5://206.123.156.185:7059"
session = AiohttpSession(proxy=proxy_url)
async def main():

    bot = Bot(token=BOT_TOKEN, session=session)
    dp = Dispatcher()

    dp.include_routers(start.router, quiz.router)

    print("Bot is running!")
    await dp.start_polling(bot)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Bot is shutted down!")


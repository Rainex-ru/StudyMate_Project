import os
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
GIGA_CREDENTIALS = (
    os.getenv("GIGA_CREDENTIALS")
    or os.getenv("GIGACHAT_CREDENTIALS")
    or os.getenv("GIGA_AUTH_KEY")
)
if not GIGA_CREDENTIALS:
    client_id = os.getenv("GIGACHAT_CLIENT_ID")
    client_secret = os.getenv("GIGACHAT_CLIENT_SECRET")
    if client_id and client_secret:
        GIGA_CREDENTIALS = f"{client_id}:{client_secret}"

DATABASE_PATH = os.getenv("DATABASE_PATH", "data/studymate.db")

# Публичный HTTPS URL веб-приложения (Telegram Web App / кнопка в боте)
WEB_APP_URL = (os.getenv("WEB_APP_URL") or "").strip().rstrip("/")
ADMIN_USERNAMES = [name.strip() for name in os.getenv("ADMIN_USERNAMES", "awaiting_winter").split(",") if name.strip()]

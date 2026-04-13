import aiohttp
import json
from config import GIGA_CREDENTIALS

async def get_ai_response(prompt):
    if not GIGA_CREDENTIALS:
        return 'Ошибка: не заданы GIGA_CREDENTIALS'

    proxy_url = "socks5://206.123.156.185:7059"
    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        if ':' in GIGA_CREDENTIALS:
            # OAuth: client_id:client_secret
            try:
                client_id, client_secret = GIGA_CREDENTIALS.split(':', 1)
            except:
                return 'Ошибка: неверный формат GIGA_CREDENTIALS (должен быть client_id:client_secret)'
            # Получаем токен
            auth_data = {
                'scope': 'GIGACHAT_API_PERS',
                'grant_type': 'client_credentials'
            }
            auth_headers = {
                'Authorization': f'Basic {aiohttp.helpers.basic_auth(client_id, client_secret)}',
                'Content-Type': 'application/x-www-form-urlencoded'
            }
            async with session.post('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', data=auth_data, headers=auth_headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status != 200:
                    return f'Ошибка авторизации: {resp.status}'
                token_data = await resp.json()
                access_token = token_data.get('access_token')
                if not access_token:
                    return 'Ошибка: не получен токен'
        else:
            # Прямой токен
            access_token = GIGA_CREDENTIALS

        # Отправляем запрос
        chat_data = {
            'model': 'GigaChat',
            'messages': [
                {'role': 'user', 'content': prompt}
            ],
            'temperature': 0.7,
            'max_tokens': 1000
        }
        chat_headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        async with session.post('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', json=chat_data, headers=chat_headers, timeout=aiohttp.ClientTimeout(total=60)) as resp:
            if resp.status != 200:
                return f'Ошибка ИИ: {resp.status}'
            response_data = await resp.json()
            return response_data.get('choices', [])[0].get('message', {}).get('content', 'Нет ответа от ИИ')
import aiohttp
import json
import uuid
from config import GIGA_CREDENTIALS

def clean_ai_text(text: str) -> str:
    import re

    if not isinstance(text, str):
        return ''

    # Удаляем markdown-символы, заголовки, HTML-теги и нерабочие URL
    text = re.sub(r'\*\*|__|\*|`|###|##|#', '', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'https?://\S+|www\.\S+', '', text)
    text = re.sub(r'(^|\n)\s*[-*+]\s*', r'\1', text)
    text = re.sub(r'[ \t]+\n', '\n', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


async def get_ai_response(prompt):
    if not GIGA_CREDENTIALS:
        return 'Ошибка: не заданы GIGA_CREDENTIALS'

    proxy_url = "socks5://206.123.156.185:7059"
    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        creds = GIGA_CREDENTIALS.strip()
        access_token = None

        request_id = str(uuid.uuid4())
        if ':' in creds:
            # OAuth: client_id:client_secret
            try:
                client_id, client_secret = creds.split(':', 1)
            except ValueError:
                return 'Ошибка: неверный формат GIGA_CREDENTIALS (должен быть client_id:client_secret)'
            auth_data = {
                'scope': 'GIGACHAT_API_PERS'
            }
            auth_headers = {
                'Authorization': str(aiohttp.BasicAuth(client_id, client_secret).encode()),
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'RqUID': request_id
            }
            async with session.post(
                'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
                data=auth_data,
                headers=auth_headers,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    return f'Ошибка авторизации: {resp.status} — {error_text}'
                token_data = await resp.json()
                access_token = token_data.get('access_token')
                if not access_token:
                    return 'Ошибка: не получен токен'
        elif creds.lower().startswith('bearer '):
            access_token = creds.split(None, 1)[1]
        else:
            # Authorization key из GigaChat API Setup
            auth_data = {
                'scope': 'GIGACHAT_API_PERS'
            }
            auth_headers = {
                'Authorization': f'Basic {creds}',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'RqUID': request_id
            }
            async with session.post(
                'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
                data=auth_data,
                headers=auth_headers,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    return f'Ошибка авторизации: {resp.status} — {error_text}'
                token_data = await resp.json()
                access_token = token_data.get('access_token')
                if not access_token:
                    return 'Ошибка: не получен токен'

        # Отправляем запрос
        chat_data = {
            'model': 'GigaChat',
            'messages': [
                {
                    'role': 'system',
                    'content': (
                        'Ты — эксперт StudyMate по траектории учёбы после 9 и 11 класса. Отвечай уверенно, живо и по делу. '
                        'Стиль должен быть понятным, дружелюбным и кратким, но без излишней сухости. '
                        'Не используй markdown, не ставь ###, **, __, ` или HTML-теги. '
                        'Работай только по теме выбора учебного заведения, баллов ОГЭ/ЕГЭ, специальностей и городов. '
                        'Если пользователь уходит в чат, мягко верни его к выбору учёбы и специальности. '
                        'КРИТИЧЕСКОЕ ПРАВИЛО: если речь об ОГЭ (после 9 класса), предлагай только СПО — техникумы, колледжи, '
                        'училища, программы среднего профессионального образования; не предлагай классический бакалавриат вузов с ЕГЭ. '
                        'Если речь о ЕГЭ (после 11 класса), ориентируйся на вузы и программы бакалавриата/специалитета. '
                        'Не придумывай и не вставляй нерабочие ссылки. Если не уверен в работоспособности URL, не добавляй его.'
                    )
                },
                {'role': 'user', 'content': prompt}
            ],
            'temperature': 0.75,
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
            raw_text = response_data.get('choices', [])[0].get('message', {}).get('content', 'Нет ответа от ИИ')
            return clean_ai_text(raw_text)

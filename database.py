import sqlite3
import json
import os
from datetime import datetime

from config import DATABASE_PATH


def get_db_path():
    path = DATABASE_PATH
    if not os.path.dirname(path):
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def get_connection():
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tg_id INTEGER UNIQUE,
            username TEXT,
            first_name TEXT,
            last_name TEXT,
            last_seen TEXT
        )
        '''
    )
    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS score_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            entry TEXT,
            created_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        '''
    )
    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS search_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            city TEXT,
            subject TEXT,
            exam_type TEXT,
            created_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        '''
    )
    conn.commit()
    conn.close()


def save_user(user):
    if user is None:
        return
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    cursor.execute(
        '''
        INSERT INTO users (tg_id, username, first_name, last_name, last_seen)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(tg_id) DO UPDATE SET
            username=excluded.username,
            first_name=excluded.first_name,
            last_name=excluded.last_name,
            last_seen=excluded.last_seen
        ''',
        (user.id, user.username, user.first_name, user.last_name, now)
    )
    conn.commit()
    conn.close()


def find_user_id(tg_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT id FROM users WHERE tg_id = ?', (tg_id,))
    row = cursor.fetchone()
    conn.close()
    return row['id'] if row else None


def add_score_history(tg_id, entry):
    user_id = find_user_id(tg_id)
    if user_id is None:
        return
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO score_history (user_id, entry, created_at) VALUES (?, ?, ?)',
        (user_id, json.dumps(entry, ensure_ascii=False), datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()


def get_score_history(tg_id):
    user_id = find_user_id(tg_id)
    if user_id is None:
        return []
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT entry FROM score_history WHERE user_id = ? ORDER BY id DESC', (user_id,))
    rows = cursor.fetchall()
    conn.close()
    history = []
    for row in rows:
        try:
            history.append(json.loads(row['entry']))
        except json.JSONDecodeError:
            continue
    return history


def add_search_history(tg_id, city, subject, exam_type):
    user_id = find_user_id(tg_id)
    if user_id is None:
        return
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO search_history (user_id, city, subject, exam_type, created_at) VALUES (?, ?, ?, ?, ?)',
        (user_id, city, subject, exam_type, datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()


def get_stats():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT COUNT(*) as total_users FROM users')
    total_users = cursor.fetchone()['total_users']
    cursor.execute('SELECT COUNT(*) as total_scores FROM score_history')
    total_scores = cursor.fetchone()['total_scores']
    cursor.execute('SELECT COUNT(*) as total_searches FROM search_history')
    total_searches = cursor.fetchone()['total_searches']
    conn.close()
    return {
        'total_users': total_users,
        'total_scores': total_scores,
        'total_searches': total_searches,
    }


def get_recent_searches(limit: int = 20):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        '''
        SELECT s.city, s.subject, s.exam_type, s.created_at, u.username, u.first_name
        FROM search_history s
        LEFT JOIN users u ON u.id = s.user_id
        ORDER BY s.id DESC
        LIMIT ?
        ''',
        (limit,)
    )
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows


def get_recent_scores(limit: int = 20):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        '''
        SELECT sh.entry, sh.created_at, u.username, u.first_name
        FROM score_history sh
        LEFT JOIN users u ON u.id = sh.user_id
        ORDER BY sh.id DESC
        LIMIT ?
        ''',
        (limit,)
    )
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows

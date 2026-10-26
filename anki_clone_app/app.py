import os
from flask import Flask, render_template, request, jsonify
import sqlite3
import datetime
import google.generativeai as genai
import json

app = Flask(__name__)

# Configure Gemini API (Set your API key in environment variables)
genai.configure(api_key=os.environ.get("GEMINI_API_KEY", "YOUR_API_KEY_HERE"))
model = genai.GenerativeModel('gemini-1.5-flash')

def get_db_connection():
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            word TEXT NOT NULL,
            meaning TEXT NOT NULL,
            pos TEXT NOT NULL,
            repetition INTEGER DEFAULT 0,
            interval INTEGER DEFAULT 1,
            easiness REAL DEFAULT 2.5,
            next_review DATE DEFAULT CURRENT_DATE
        )
    ''')
    conn.commit()
    conn.close()

init_db()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/cards', methods=['GET', 'POST'])
def cards():
    conn = get_db_connection()
    if request.method == 'POST':
        data = request.json
        conn.execute('INSERT INTO cards (word, meaning, pos) VALUES (?, ?, ?)',
                     (data['word'], data['meaning'], data['pos']))
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
    else:
        cards = conn.execute('SELECT * FROM cards').fetchall()
        conn.close()
        return jsonify([dict(ix) for ix in cards])

@app.route('/api/due_cards', methods=['GET'])
def due_cards():
    conn = get_db_connection()
    today = datetime.date.today().isoformat()
    cards = conn.execute('SELECT * FROM cards WHERE next_review <= ?', (today,)).fetchall()
    conn.close()
    return jsonify([dict(ix) for ix in cards])

@app.route('/api/review/<int:card_id>', methods=['POST'])
def review_card(card_id):
    data = request.json
    quality = data.get('quality') # 0: Again, 3: Hard, 4: Good, 5: Easy
    
    conn = get_db_connection()
    card = conn.execute('SELECT * FROM cards WHERE id = ?', (card_id,)).fetchone()
    
    repetition = card['repetition']
    interval = card['interval']
    easiness = card['easiness']
    
    if quality < 3:
        repetition = 0
        interval = 1
    else:
        if repetition == 0:
            interval = 1
        elif repetition == 1:
            interval = 6
        else:
            interval = int(interval * easiness)
        repetition += 1
        
    easiness = max(1.3, easiness + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    next_review = datetime.date.today() + datetime.timedelta(days=interval)
    
    conn.execute('''
        UPDATE cards 
        SET repetition = ?, interval = ?, easiness = ?, next_review = ?
        WHERE id = ?
    ''', (repetition, interval, easiness, next_review.isoformat(), card_id))
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})

@app.route('/api/ai_quiz', methods=['GET'])
def ai_quiz():
    conn = get_db_connection()
    cards = conn.execute('SELECT word FROM cards ORDER BY RANDOM() LIMIT 1').fetchall()
    conn.close()
    
    if not cards:
        return jsonify({"error": "単語が登録されていません。"}), 400
        
    word = cards[0]['word']
    prompt = f'''「{word}」の別の意味、または派生的な意味、イディオムなど、あまり知られていない意味を問う6択クイズを作成してください。
以下のJSONフォーマットのみを出力してください。
{{
    "word": "{word}",
    "question": "この単語の別の意味として正しいものはどれ？",
    "options": ["選択肢1", "選択肢2", "選択肢3", "選択肢4", "選択肢5", "選択肢6"],
    "answer_index": 0から5の正解インデックス,
    "explanation": "正解の解説"
}}'''
    try:
        response = model.generate_content(prompt)
        text = response.text
        if "```json" in text: text = text.split("```json")[1].split("```")[0]
        elif "```" in text: text = text.split("```")[1].split("```")[0]
        return jsonify(json.loads(text.strip()))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)

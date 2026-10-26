
let cards = JSON.parse(localStorage.getItem('anki_cards')) || [];
let dueCards = [];
let currentCard = null;

// Initialize API Key
document.addEventListener('DOMContentLoaded', () => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) document.getElementById('api-key-input').value = savedKey;
    updateDashboard();
});

function saveApiKey() {
    const key = document.getElementById('api-key-input').value;
    localStorage.setItem('gemini_api_key', key);
    alert('APIキーを保存しました！');
}

function updateDashboard() {
    const today = new Date().toISOString().split('T')[0];
    dueCards = cards.filter(c => c.next_review <= today);
    document.getElementById('due-count').innerText = `今日の学習: ${dueCards.length}件 / 全${cards.length}件`;
}

function addCard() {
    const word = document.getElementById('new-word').value.trim();
    const meaning = document.getElementById('new-meaning').value.trim();
    const pos = document.getElementById('new-pos').value;
    
    if(!word || !meaning) return alert("単語と意味を入力してください");

    const newCard = {
        id: Date.now(),
        word, meaning, pos,
        repetition: 0, interval: 1, easiness: 2.5,
        next_review: new Date().toISOString().split('T')[0]
    };
    
    cards.push(newCard);
    localStorage.setItem('anki_cards', JSON.stringify(cards));
    
    alert("追加しました！");
    document.getElementById('new-word').value = '';
    document.getElementById('new-meaning').value = '';
    updateDashboard();
}

function startStudy() {
    if (cards.length === 0) return alert("まずは単語を追加してください！");
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('settings-area').style.display = 'none';
    nextCard();
}

function nextCard() {
    const today = new Date().toISOString().split('T')[0];
    dueCards = cards.filter(c => c.next_review <= today);

    if (dueCards.length === 0) {
        document.getElementById('study-area').style.display = 'none';
        document.getElementById('ai-quiz-area').style.display = 'block';
        return;
    }
    
    currentCard = dueCards[0];
    document.getElementById('study-area').style.display = 'block';
    document.getElementById('study-word').innerText = currentCard.word;
    document.getElementById('pos-quiz').style.display = 'block';
    document.getElementById('meaning-area').style.display = 'none';
}

function checkPos(selectedPos) {
    if (selectedPos === currentCard.pos) {
        document.getElementById('correct-pos').innerText = `${currentCard.pos} (正解🎉)`;
        document.getElementById('correct-pos').style.color = '#28a745';
    } else {
        document.getElementById('correct-pos').innerText = `${currentCard.pos} (あなたの回答: ${selectedPos} ❌)`;
        document.getElementById('correct-pos').style.color = '#dc3545';
    }
    document.getElementById('pos-quiz').style.display = 'none';
    document.getElementById('meaning-area').style.display = 'block';
    document.getElementById('study-meaning').innerText = currentCard.meaning;
}

function rateCard(quality) {
    // SM-2 Algorithm
    if (quality < 3) {
        currentCard.repetition = 0;
        currentCard.interval = 1;
    } else {
        if (currentCard.repetition === 0) currentCard.interval = 1;
        else if (currentCard.repetition === 1) currentCard.interval = 6;
        else currentCard.interval = Math.round(currentCard.interval * currentCard.easiness);
        currentCard.repetition += 1;
    }
    
    currentCard.easiness = Math.max(1.3, currentCard.easiness + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + currentCard.interval);
    currentCard.next_review = nextDate.toISOString().split('T')[0];
    
    // Update storage
    const index = cards.findIndex(c => c.id === currentCard.id);
    cards[index] = currentCard;
    localStorage.setItem('anki_cards', JSON.stringify(cards));
    
    nextCard();
}

async function generateAiQuiz() {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) return alert("画面上部からGemini APIキーを設定してください。");

    document.getElementById('generate-ai-btn').style.display = 'none';
    document.getElementById('ai-loading').style.display = 'block';
    
    // Pick a random card
    const randomCard = cards[Math.floor(Math.random() * cards.length)];
    const word = randomCard.word;

    const prompt = `あなたは優秀な英語教師です。ユーザーはすでに「${word}」という単語の基本的な意味を知っています。
この単語の「別の意味」「派生的な意味」「イディオム」「スラング」など、あまり知られていない側面に焦点を当てた6択クイズを1つ作成してください。
必ず以下のJSONフォーマットのみを返してください。マークダウンや説明は不要です。
{
    "word": "${word}",
    "question": "この単語の別の意味や使い方として正しいものはどれ？",
    "options": ["選択肢1", "選択肢2", "選択肢3", "選択肢4", "選択肢5", "選択肢6"],
    "answer_index": 正解のインデックス(0から5),
    "explanation": "なぜそれが正解なのか、例文を交えた詳しい解説"
}`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        
        let text = data.candidates[0].content.parts[0].text;
        // Clean JSON formatting if Gemini adds markdown blocks
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const quizData = JSON.parse(text);
        
        document.getElementById('ai-loading').style.display = 'none';
        document.getElementById('ai-quiz-content').style.display = 'block';
        document.getElementById('ai-word').innerText = `Target Word: ${quizData.word}`;
        document.getElementById('ai-question').innerText = quizData.question;
        
        const optsDiv = document.getElementById('ai-options');
        optsDiv.innerHTML = '';
        quizData.options.forEach((opt, idx) => {
            const btn = document.createElement('button');
            btn.innerText = opt;
            btn.onclick = () => {
                document.getElementById('ai-options').style.display = 'none';
                document.getElementById('ai-result').style.display = 'block';
                const judge = document.getElementById('ai-judgement');
                if(idx === quizData.answer_index) {
                    judge.innerText = "🎉 正解！";
                    judge.style.color = '#28a745';
                } else {
                    judge.innerText = "❌ 不正解...";
                    judge.style.color = '#dc3545';
                }
                document.getElementById('ai-explanation').innerText = quizData.explanation;
            };
            optsDiv.appendChild(btn);
        });

    } catch (error) {
        alert("クイズの生成に失敗しました。APIキーが正しいか確認してください。
" + error.message);
        document.getElementById('ai-loading').style.display = 'none';
        document.getElementById('generate-ai-btn').style.display = 'block';
    }
}

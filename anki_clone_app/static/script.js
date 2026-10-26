
let dueCards = [];
let currentCard = null;

async function addCard() {
    const word = document.getElementById('new-word').value;
    const meaning = document.getElementById('new-meaning').value;
    const pos = document.getElementById('new-pos').value;
    
    if(!word || !meaning) return alert("入力してください");

    await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, meaning, pos })
    });
    alert("追加しました！");
    document.getElementById('new-word').value = '';
    document.getElementById('new-meaning').value = '';
}

async function startStudy() {
    document.getElementById('dashboard').style.display = 'none';
    const res = await fetch('/api/due_cards');
    dueCards = await res.json();
    nextCard();
}

function nextCard() {
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
        alert("正解！");
    } else {
        alert("不正解... 正解は: " + currentCard.pos);
    }
    document.getElementById('pos-quiz').style.display = 'none';
    document.getElementById('meaning-area').style.display = 'block';
    document.getElementById('correct-pos').innerText = currentCard.pos;
    document.getElementById('study-meaning').innerText = currentCard.meaning;
}

async function rateCard(quality) {
    await fetch(`/api/review/${currentCard.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quality })
    });
    dueCards.shift();
    if(quality < 3) dueCards.push(currentCard); // Again
    nextCard();
}

async function generateAiQuiz() {
    document.getElementById('generate-ai-btn').style.display = 'none';
    document.getElementById('ai-loading').style.display = 'block';
    
    const res = await fetch('/api/ai_quiz');
    if (!res.ok) {
        alert("クイズ生成に失敗しました（単語が登録されていないか、APIエラーです）");
        location.reload();
        return;
    }
    const data = await res.json();
    
    document.getElementById('ai-loading').style.display = 'none';
    document.getElementById('ai-quiz-content').style.display = 'block';
    document.getElementById('ai-word').innerText = `単語: ${data.word}`;
    document.getElementById('ai-question').innerText = data.question;
    
    const optsDiv = document.getElementById('ai-options');
    optsDiv.innerHTML = '';
    data.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.innerText = opt;
        btn.onclick = () => {
            if(idx === data.answer_index) alert("正解！");
            else alert("不正解...");
            document.getElementById('ai-options').style.display = 'none';
            document.getElementById('ai-result').style.display = 'block';
            document.getElementById('ai-explanation').innerText = data.explanation;
        };
        optsDiv.appendChild(btn);
    });
}

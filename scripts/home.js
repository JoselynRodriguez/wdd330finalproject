const yearSpan = document.getElementById("currentyear");
const currentYear = new Date().getFullYear();
yearSpan.textContent = currentYear;

const DICTIONARY_API_BASE = "https://api.dictionaryapi.dev/api/v2/entries/en/";

async function fetchWordData(word) {
    const url = `${DICTIONARY_API_BASE}${encodeURIComponent(word)}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!Array.isArray(data)) {
        throw new Error("No definitions found");
    }

    return normalizeDictionaryData(data);
}

const fallbackWords = ["example", "learn", "language", "explore", "practice"];

async function fetchRandomWord() {
    const random = fallbackWords[Math.floor(Math.random() * fallbackWords.length)];
    return fetchWordData(random);
}

function normalizeDictionaryData(apiResponse) {
    const entry = apiResponse[0];

    const word = entry.word || "";
    const phonetic = entry.phonetic || (entry.phonetics?.[0]?.text ?? "");

    const meanings = [];
    entry.meanings?.forEach((meaning) => {
        meaning.definitions?.forEach((def) => {
            meanings.push({
                partOfSpeech: meaning.partOfSpeech,
                definition: def.definition,
                example: def.example || "",
            });
        });
    });

    const firstDefinition = meanings[0]?.definition ?? "";
    const examples = meanings
        .filter((m) => m.example)
        .slice(0, 3)
        .map((m) => m.example);

    return {
        word,
        phonetic,
        definition: firstDefinition,
        examples,
    };
}

async function translateText(text, targetLang) {
    const res = await fetch("https://translate.argosopentech.com/translate", {
        method: "POST",
        body: JSON.stringify({
            q: text,
            source: "en",
            target: targetLang,
            format: "text"
        }),
        headers: { "Content-Type": "application/json" }
    });

    if (!res.ok) {
        throw new Error("Translation failed");
    }

    const data = await res.json();
    return data.translatedText;
}


const VOCAB_KEY = "language_tool_vocab";

function loadVocabulary() {
    const raw = localStorage.getItem(VOCAB_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function saveVocabulary(vocabList) {
    localStorage.setItem(VOCAB_KEY, JSON.stringify(vocabList));
}

function addWordToVocabulary(wordData, translation) {
    const vocab = loadVocabulary();

    const exists = vocab.some(
        (item) => item.word.toLowerCase() === wordData.word.toLowerCase()
    );

    if (exists) return { added: false, vocab };

    const newItem = {
        id: Date.now(),
        word: wordData.word,
        definition: wordData.definition,
        phonetic: wordData.phonetic,
        translation: translation || "",
    };

    const updated = [newItem, ...vocab];
    saveVocabulary(updated);
    return { added: true, vocab: updated };
}

function removeWordFromVocabulary(id) {
    const vocab = loadVocabulary();
    const updated = vocab.filter((item) => item.id !== id);
    saveVocabulary(updated);
    return updated;
}

function createQuizQuestions(vocabList) {
    if (vocabList.length < 2) return [];

    const questions = vocabList.map((item) => {
        const correct = item.translation || "(no translation saved)";
        const options = generateOptions(correct, vocabList);
        return {
            word: item.word,
            question: `What is the translation of "${item.word}"?`,
            correct,
            options,
        };
    });

    return shuffleArray(questions);
}

function generateOptions(correct, vocabList) {
    const translations = vocabList
        .map((v) => v.translation)
        .filter((t) => t && t !== correct);

    const shuffled = shuffleArray(translations).slice(0, 3);
    return shuffleArray([correct, ...shuffled]);
}

function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function renderWordCard(wordData, translation = "") {
    document.getElementById("word-text").textContent = wordData.word;
    document.getElementById("word-phonetic").textContent = wordData.phonetic;
    document.getElementById("word-definition").textContent = wordData.definition;
    document.getElementById("word-translation").textContent = translation;

    const examplesList = document.getElementById("word-examples");
    examplesList.innerHTML = "";

    if (wordData.examples.length) {
        wordData.examples.forEach((ex) => {
            const li = document.createElement("li");
            li.textContent = ex;
            examplesList.appendChild(li);
        });
    } else {
        const li = document.createElement("li");
        li.textContent = "No examples available.";
        examplesList.appendChild(li);
    }
}

function renderVocabularyList(vocabList, onDelete) {
    const container = document.getElementById("vocab-list-container");
    container.innerHTML = "";

    if (!vocabList.length) {
        container.innerHTML = "<p>Your vocabulary list is empty.</p>";
        return;
    }

    vocabList.forEach((item) => {
        const div = document.createElement("div");
        div.className = "vocab-item";

        div.innerHTML = `
      <div class="vocab-item-main">
        <p class="vocab-item-word">${item.word}</p>
        <p>${item.definition}</p>
        <p class="vocab-item-translation">${item.translation}</p>
      </div>
      <button class="btn-icon" data-id="${item.id}">✖</button>
    `;

        div.querySelector("button").addEventListener("click", () => onDelete(item.id));

        container.appendChild(div);
    });
}

function renderQuizQuestion(questionObj, index, total) {
    document.getElementById("quiz-message").textContent =
        `Question ${index + 1} of ${total}`;

    document.getElementById("quiz-question-container").textContent =
        questionObj.question;

    const optionsContainer = document.getElementById("quiz-options-container");
    optionsContainer.innerHTML = "";

    questionObj.options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.className = "quiz-option";
        btn.textContent = opt;
        btn.dataset.value = opt;
        optionsContainer.appendChild(btn);
    });
}

function updateQuizScore(score, total) {
    document.getElementById("quiz-score").textContent =
        `Score: ${score} / ${total}`;
}

function showFeedback(id, msg, type = "info") {
    const el = document.getElementById(id);
    el.textContent = msg;

    if (type === "success") el.style.color = "#047857";
    else if (type === "error") el.style.color = "#b91c1c";
    else el.style.color = "#4b5563";
}

let currentWordData = null;
let currentTranslation = "";
let quizQuestions = [];
let currentQuestionIndex = 0;
let score = 0;

document.addEventListener("DOMContentLoaded", () => {
    setupEvents();
    loadInitial();
});

function setupEvents() {
    document.getElementById("btn-new-word").onclick = loadRandomWord;
    document.getElementById("btn-save-word").onclick = saveWord;
    document.getElementById("btn-start-quiz").onclick = startQuiz;
    document.getElementById("btn-next-question").onclick = nextQuestion;

    document.getElementById("btn-translate").onclick = translateCurrent;

    document.getElementById("search-form").onsubmit = (e) => {
        e.preventDefault();
        const q = document.getElementById("search-input").value.trim();
        if (q) searchWord(q);
    };

    document.getElementById("quiz-options-container").onclick = handleQuizClick;
}

async function loadInitial() {
    renderVocabularyList(loadVocabulary(), deleteWord);
    await loadRandomWord();
}

async function loadRandomWord() {
    showFeedback("word-feedback", "Loading...");
    try {
        currentWordData = await fetchRandomWord();
        currentTranslation = "";
        renderWordCard(currentWordData);
        showFeedback("word-feedback", "Loaded", "success");
    } catch {
        showFeedback("word-feedback", "Error loading word", "error");
    }
}

async function searchWord(q) {
    showFeedback("word-feedback", "Searching...");
    try {
        currentWordData = await fetchWordData(q);
        currentTranslation = "";
        renderWordCard(currentWordData);
        showFeedback("word-feedback", "Found", "success");
    } catch {
        showFeedback("word-feedback", "Not found", "error");
    }
}

async function translateCurrent() {
    if (!currentWordData) return;

    const lang = document.getElementById("target-language").value;

    showFeedback("word-feedback", "Translating...");
    try {
        currentTranslation = await translateText(currentWordData.word, lang);
        renderWordCard(currentWordData, currentTranslation);
        showFeedback("word-feedback", "Translated", "success");
    } catch {
        showFeedback("word-feedback", "Translation failed", "error");
    }
}

function saveWord() {
    if (!currentWordData) return;

    const { added, vocab } = addWordToVocabulary(currentWordData, currentTranslation);
    renderVocabularyList(vocab, deleteWord);

    if (added) showFeedback("word-feedback", "Saved", "success");
    else showFeedback("word-feedback", "Already saved", "info");
}

function deleteWord(id) {
    const updated = removeWordFromVocabulary(id);
    renderVocabularyList(updated, deleteWord);
}

function startQuiz() {
    const vocab = loadVocabulary();
    quizQuestions = createQuizQuestions(vocab);

    if (!quizQuestions.length) {
        document.getElementById("quiz-message").textContent =
            "Save at least 2 words to start a quiz.";
        return;
    }

    score = 0;
    currentQuestionIndex = 0;

    updateQuizScore(score, quizQuestions.length);
    showFeedback("quiz-feedback", "");
    showQuestion();
}

function showQuestion() {
    renderQuizQuestion(
        quizQuestions[currentQuestionIndex],
        currentQuestionIndex,
        quizQuestions.length
    );

    document.getElementById("btn-next-question").disabled = true;
}

function handleQuizClick(e) {
    if (!e.target.classList.contains("quiz-option")) return;

    const selected = e.target.dataset.value;
    const correct = quizQuestions[currentQuestionIndex].correct;

    document.querySelectorAll(".quiz-option").forEach((btn) => {
        btn.disabled = true;
        if (btn.dataset.value === correct) btn.classList.add("correct");
        if (btn.dataset.value === selected && selected !== correct)
            btn.classList.add("incorrect");
    });

    if (selected === correct) {
        score++;
        showFeedback("quiz-feedback", "Correct!", "success");
    } else {
        showFeedback("quiz-feedback", `Incorrect. Correct: ${correct}`, "error");
    }

    updateQuizScore(score, quizQuestions.length);
    document.getElementById("btn-next-question").disabled = false;
}

function nextQuestion() {
    currentQuestionIndex++;

    if (currentQuestionIndex >= quizQuestions.length) {
        showFeedback(
            "quiz-feedback",
            `Finished! Score: ${score} / ${quizQuestions.length}`
        );
        return;
    }

    showFeedback("quiz-feedback", "");
    showQuestion();
}

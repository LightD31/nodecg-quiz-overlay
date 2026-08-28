'use strict';

const fs = require('fs');
const path = require('path');

const { normalizeQuestion, buildQuestionState } = require('./questions');


module.exports = function (nodecg) {
    const questionsRep = nodecg.Replicant('questionsList', {
        defaultValue: []
    });
    const questionRep = nodecg.Replicant('question', {
        defaultValue: {
            text: '',
            propositions: ['', '', '', ''],
            correctAnswer: 0,
            state: 'hidden',
            eliminatedAnswers: [],
            answeredCorrectly: false,
            revealOnWrong: true,
            showCorrectOnWrong: false,
            lastWrongAnswer: -1,
            type: 'multipleChoice', // 'multipleChoice', 'trueFalse', 'threeWordsClue', or 'funnySummary'
            clues: [], // For threeWordsClue - array of 3 word hints
            summary: '', // For funnySummary - the funny plot description
            answer: '', // For threeWordsClue and funnySummary - the correct answer text
            phase: 1, // Phase indicator (1, 2, or 3)
            openWrongTeam: '' // For open questions - tracks which team answered wrong (team1, team2, or '')
        }
    });
    const scoresRep = nodecg.Replicant('scores', {
        defaultValue: {
            team1: { name: 'Team 1', score: 0, color: '#00d9ff' },
            team2: { name: 'Team 2', score: 0, color: '#ff6b6b' }
        }
    });
    const questionFilesRep = nodecg.Replicant('questionFiles', {
        defaultValue: {
            files: [],
            currentFile: ''
        }
    });

    const logoUrlRep = nodecg.Replicant('logoUrl', { defaultValue: '' });

    // Index of the question currently loaded into `question`, or -1 if none.
    // This is a replicant so the dashboard can show which question is live
    // instead of tracking its own copy and drifting out of sync.
    const currentIndexRep = nodecg.Replicant('currentQuestionIndex', { defaultValue: -1 });

    const questionsDir = path.join(__dirname, '..', 'questions');

    // Get list of available question files
    function getQuestionFiles() {
        const files = [];

        // Check for questions.json in bundle root
        const rootFile = path.join(__dirname, '..', 'questions.json');
        if (fs.existsSync(rootFile)) {
            files.push({ name: 'questions.json', path: rootFile, isDefault: true });
        }

        // Check questions folder
        if (fs.existsSync(questionsDir)) {
            const dirFiles = fs.readdirSync(questionsDir);
            dirFiles.forEach(file => {
                if (file.endsWith('.json')) {
                    files.push({
                        name: file,
                        path: path.join(questionsDir, file),
                        isDefault: false
                    });
                }
            });
        }

        return files;
    }

    // The reveal-on-wrong setting rides along on the question replicant, so carry
    // it across question changes instead of resetting it.
    function currentRevealOnWrong() {
        return questionRep.value && questionRep.value.revealOnWrong !== undefined
            ? questionRep.value.revealOnWrong
            : true;
    }

    // Load a question by index into the question replicant. Returns false if the
    // index is out of range.
    function showQuestionAt(index, state) {
        const question = questionsRep.value[index];
        if (!question) {
            return false;
        }

        currentIndexRep.value = index;
        questionRep.value = buildQuestionState(question, state, currentRevealOnWrong());
        return true;
    }

    // Load questions from a specific file
    function loadQuestionsFromFile(filePath) {
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(data);
            const rawQuestions = Array.isArray(parsed) ? parsed : parsed && parsed.questions;

            if (!Array.isArray(rawQuestions)) {
                throw new Error('file must contain a "questions" array');
            }

            questionsRep.value = rawQuestions.map(normalizeQuestion);

            const fileName = path.basename(filePath);
            questionFilesRep.value = {
                ...questionFilesRep.value,
                currentFile: fileName
            };

            nodecg.log.info(`Loaded ${questionsRep.value.length} questions from ${fileName}`);

            // Report anything suspicious once, with the question number, so the
            // operator can fix the file instead of discovering it mid-show.
            const flagged = questionsRep.value.filter(q => q.issues.length > 0);
            if (flagged.length > 0) {
                nodecg.log.warn(`${flagged.length} of ${questionsRep.value.length} questions in ${fileName} have problems:`);
                questionsRep.value.forEach((q, i) => {
                    q.issues.forEach(issue => nodecg.log.warn(`  Question ${i + 1}: ${issue}`));
                });
            }

            // Auto-select first question (hidden, no feedback states)
            if (questionsRep.value.length > 0) {
                showQuestionAt(0, 'hidden');
                nodecg.log.info('First question pre-selected (hidden)');
            } else {
                currentIndexRep.value = -1;
            }

            return true;
        } catch (error) {
            nodecg.log.error(`Failed to load ${path.basename(filePath)}:`, error.message);
            questionsRep.value = [];
            currentIndexRep.value = -1;
            return false;
        }
    }

    // Legacy function - loads default questions.json or first available file
    function loadQuestions() {
        const questionsPath = path.join(__dirname, '..', 'questions.json');

        // Check if default file exists
        if (fs.existsSync(questionsPath)) {
            loadQuestionsFromFile(questionsPath);
        } else {
            // Try to load first available file from questions folder
            const files = getQuestionFiles();
            if (files.length > 0) {
                loadQuestionsFromFile(files[0].path);
            } else {
                nodecg.log.info('No question files found. Please add JSON files to the questions folder.');
            }
        }
    }

    // Refresh file list
    function refreshFileList() {
        const files = getQuestionFiles();
        questionFilesRep.value = {
            ...questionFilesRep.value,
            files: files.map(f => ({ name: f.name, isDefault: f.isDefault }))
        };
        nodecg.log.info(`Found ${files.length} question file(s)`);
    }

    // Initialize: refresh file list and load default
    refreshFileList();
    loadQuestions();

    // Watch questions folder for changes
    if (fs.existsSync(questionsDir)) {
        fs.watch(questionsDir, (eventType, filename) => {
            if (filename && filename.endsWith('.json')) {
                nodecg.log.info('Questions folder changed, refreshing file list...');
                refreshFileList();
            }
        });
    }

    // Watch for default file changes (only if it exists)
    const questionsPath = path.join(__dirname, '..', 'questions.json');
    if (fs.existsSync(questionsPath)) {
        fs.watchFile(questionsPath, () => {
            nodecg.log.info('Questions file changed, reloading...');
            loadQuestions();
        });
    }

    // ========================================
    // HTTP API for Bitfocus Companion
    // ========================================
    const router = nodecg.Router();

    // Helper to send JSON response
    function sendJson(res, data) {
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(data));
    }

    // GET /api/status - Get current state
    router.get('/api/status', (req, res) => {
        sendJson(res, {
            currentQuestion: currentIndexRep.value,
            totalQuestions: questionsRep.value.length,
            questionState: questionRep.value.state,
            scores: scoresRep.value,
            currentFile: questionFilesRep.value.currentFile
        });
    });

    // GET /api/files - Get list of available question files
    router.get('/api/files', (req, res) => {
        refreshFileList();
        sendJson(res, {
            files: questionFilesRep.value.files,
            currentFile: questionFilesRep.value.currentFile
        });
    });

    // POST /api/files/load/:filename - Load a specific question file
    router.post('/api/files/load/:filename', (req, res) => {
        const filename = req.params.filename;
        const files = getQuestionFiles();
        const file = files.find(f => f.name === filename);

        if (!file) {
            return sendJson(res, { error: 'File not found' });
        }

        const success = loadQuestionsFromFile(file.path);
        if (success) {
            sendJson(res, {
                success: true,
                file: filename,
                questionsCount: questionsRep.value.length
            });
        } else {
            sendJson(res, { error: 'Failed to load file' });
        }
    });

    // POST /api/files/refresh - Refresh the file list
    router.post('/api/files/refresh', (req, res) => {
        refreshFileList();
        sendJson(res, {
            success: true,
            files: questionFilesRep.value.files
        });
    });

    // POST /api/question/show/:index - Load and show a specific question
    router.post('/api/question/show/:index', (req, res) => {
        const index = parseInt(req.params.index, 10);
        if (!Number.isInteger(index) || !showQuestionAt(index, 'showing')) {
            return sendJson(res, { error: 'Invalid question index' });
        }

        nodecg.log.info(`[API] Showing question ${index + 1}`);
        sendJson(res, { success: true, question: index + 1 });
    });

    // POST /api/question/next - Show next question
    router.post('/api/question/next', (req, res) => {
        const nextIndex = currentIndexRep.value + 1;
        if (!showQuestionAt(nextIndex, 'showing')) {
            return sendJson(res, { error: 'No more questions' });
        }

        nodecg.log.info(`[API] Showing next question ${nextIndex + 1}`);
        sendJson(res, { success: true, question: nextIndex + 1 });
    });

    // POST /api/question/previous - Show previous question
    router.post('/api/question/previous', (req, res) => {
        const prevIndex = currentIndexRep.value - 1;
        if (prevIndex < 0 || !showQuestionAt(prevIndex, 'showing')) {
            return sendJson(res, { error: 'Already at first question' });
        }

        nodecg.log.info(`[API] Showing previous question ${prevIndex + 1}`);
        sendJson(res, { success: true, question: prevIndex + 1 });
    });

    // POST /api/question/reveal - Reveal the answer
    router.post('/api/question/reveal', (req, res) => {
        if (questionRep.value) {
            questionRep.value.state = 'revealed';
            nodecg.log.info('[API] Answer revealed');
            sendJson(res, { success: true });
        } else {
            sendJson(res, { error: 'No question loaded' });
        }
    });

    // POST /api/question/openWrong/:team - Mark a team as having answered wrong on open question
    router.post('/api/question/openWrong/:team', (req, res) => {
        if (questionRep.value) {
            const team = req.params.team;
            if (team !== 'team1' && team !== 'team2') {
                return sendJson(res, { error: 'Unknown team' });
            }
            questionRep.value.openWrongTeam = team;
            const teamName = scoresRep.value ? scoresRep.value[team].name : team;
            nodecg.log.info(`[API] Open question wrong answer by ${teamName}`);
            sendJson(res, { success: true, team: teamName });
        } else {
            sendJson(res, { error: 'No question loaded' });
        }
    });

    // POST /api/question/clearWrong - Clear the wrong feedback for open questions
    router.post('/api/question/clearWrong', (req, res) => {
        if (questionRep.value) {
            questionRep.value.openWrongTeam = '';
            nodecg.log.info('[API] Cleared open question wrong feedback');
            sendJson(res, { success: true });
        } else {
            sendJson(res, { error: 'No question loaded' });
        }
    });

    // POST /api/settings/revealOnWrong - Toggle reveal on wrong setting
    router.post('/api/settings/revealOnWrong', (req, res) => {
        if (questionRep.value) {
            const enabled = req.query.enabled === 'true';
            questionRep.value.revealOnWrong = enabled;
            nodecg.log.info(`[API] Reveal on wrong: ${enabled}`);
            sendJson(res, { success: true, enabled });
        } else {
            sendJson(res, { error: 'Question replicant not ready' });
        }
    });

    // POST /api/question/hide - Hide the question
    router.post('/api/question/hide', (req, res) => {
        if (questionRep.value) {
            questionRep.value.state = 'hidden';
            nodecg.log.info('[API] Question hidden');
            sendJson(res, { success: true });
        } else {
            sendJson(res, { error: 'No question loaded' });
        }
    });

    // POST /api/question/show - Show/restore the current question
    router.post('/api/question/show', (req, res) => {
        if (questionRep.value && questionRep.value.text) {
            questionRep.value.state = 'showing';
            nodecg.log.info('[API] Question shown');
            sendJson(res, { success: true });
        } else {
            sendJson(res, { error: 'No question loaded' });
        }
    });

    // ========================================
    // Score Endpoints
    // ========================================

    function adjustScore(team, delta, res) {
        if (!scoresRep.value || !scoresRep.value[team]) {
            return sendJson(res, { error: 'Unknown team' });
        }

        scoresRep.value[team].score = Math.max(0, scoresRep.value[team].score + delta);
        nodecg.log.info(`[API] ${scoresRep.value[team].name} score: ${scoresRep.value[team].score}`);
        sendJson(res, { success: true, score: scoresRep.value[team].score });
    }

    // POST /api/score/:team/add - Add a point to a team
    // POST /api/score/:team/sub - Subtract a point from a team
    router.post('/api/score/:team/:action', (req, res) => {
        const { team, action } = req.params;
        if (team !== 'team1' && team !== 'team2') {
            return sendJson(res, { error: 'Unknown team - expected team1 or team2' });
        }
        if (action !== 'add' && action !== 'sub') {
            return sendJson(res, { error: 'Unknown action - expected add or sub' });
        }
        adjustScore(team, action === 'add' ? 1 : -1, res);
    });

    // POST /api/score/reset - Reset both scores
    router.post('/api/score/reset', (req, res) => {
        if (scoresRep.value) {
            scoresRep.value.team1.score = 0;
            scoresRep.value.team2.score = 0;
            nodecg.log.info('[API] Scores reset');
            sendJson(res, { success: true });
        }
    });

    // ========================================
    // Team Answer Endpoints (auto-scoring)
    // ========================================

    // Helper to process team answer
    function processAnswer(team, answerIndex, res) {
        if (!questionRep.value || !questionRep.value.text) {
            return sendJson(res, { error: 'No question active' });
        }

        if (questionRep.value.state === 'revealed' || questionRep.value.answeredCorrectly) {
            return sendJson(res, { error: 'Answer already revealed' });
        }

        // Check if this answer is already eliminated
        if (questionRep.value.eliminatedAnswers && questionRep.value.eliminatedAnswers.includes(answerIndex)) {
            return sendJson(res, { error: 'Answer already eliminated' });
        }

        // True/False always offers exactly two buttons; everything else is bounded
        // by how many propositions the question actually has.
        const isTrueFalse = questionRep.value.type === 'trueFalse';
        const propositions = questionRep.value.propositions || [];
        const answerCount = isTrueFalse ? 2 : Math.min(propositions.length, 4);

        if (answerCount === 0) {
            return sendJson(res, { error: 'This question is answered verbally - use /api/score or /api/question/openWrong' });
        }

        if (answerIndex >= answerCount) {
            return sendJson(res, { error: `Invalid answer - this question only has ${answerCount} options` });
        }

        const isCorrect = answerIndex === questionRep.value.correctAnswer;

        // Get answer label based on question type
        let answerLabel;
        let correctAnswerLabel;
        if (isTrueFalse) {
            answerLabel = answerIndex === 0 ? 'Vrai' : 'Faux';
            correctAnswerLabel = questionRep.value.correctAnswer === 0 ? 'Vrai' : 'Faux';
        } else {
            answerLabel = String.fromCharCode(65 + answerIndex); // 0=A, 1=B, 2=C, 3=D
            correctAnswerLabel = questionRep.value.correctAnswer >= 0
                ? String.fromCharCode(65 + questionRep.value.correctAnswer)
                : '?';
        }

        if (isCorrect) {
            // Correct answer - reveal and lock
            questionRep.value.state = 'revealed';
            questionRep.value.answeredCorrectly = true;

            // Update score
            if (scoresRep.value) {
                scoresRep.value[team].score++;
            }
        } else {
            // Wrong answer - add to eliminated but keep playing
            if (!questionRep.value.eliminatedAnswers) {
                questionRep.value.eliminatedAnswers = [];
            }
            questionRep.value.lastWrongAnswer = answerIndex;
            questionRep.value.eliminatedAnswers = [...questionRep.value.eliminatedAnswers, answerIndex];

            // If revealOnWrong is enabled, show the correct answer
            if (questionRep.value.revealOnWrong) {
                questionRep.value.showCorrectOnWrong = true;
            }
        }

        const teamName = scoresRep.value ? scoresRep.value[team].name : team;
        nodecg.log.info(`[API] ${teamName} answered ${answerLabel} - ${isCorrect ? 'CORRECT!' : 'Wrong'}`);

        sendJson(res, {
            success: true,
            team: teamName,
            answer: answerLabel,
            correct: isCorrect,
            correctAnswer: correctAnswerLabel,
            newScore: scoresRep.value ? scoresRep.value[team].score : 0,
            eliminatedAnswers: questionRep.value.eliminatedAnswers || []
        });
    }

    // POST /api/team1/answer/:option and /api/team2/answer/:option (a, b, c or d)
    router.post('/api/:team/answer/:option', (req, res) => {
        const { team, option } = req.params;
        if (team !== 'team1' && team !== 'team2') {
            return sendJson(res, { error: 'Unknown team - expected team1 or team2' });
        }
        if (!/^[a-d]$/.test(option)) {
            return sendJson(res, { error: 'Unknown answer - expected a, b, c or d' });
        }
        processAnswer(team, option.charCodeAt(0) - 97, res); // a=0, b=1, c=2, d=3
    });

    // Mount the router
    nodecg.mount('/quiz-overlay', router);
    nodecg.log.info('HTTP API mounted at /quiz-overlay/api/');
};

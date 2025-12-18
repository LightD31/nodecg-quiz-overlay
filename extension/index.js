'use strict';

const fs = require('fs');
const path = require('path');

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
            // New fields for additional question types
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
    const backgroundColorRep = nodecg.Replicant('backgroundColor', { defaultValue: '#1a1a2e' });
    
    let currentQuestionIndex = -1;
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

    // Load questions from a specific file
    function loadQuestionsFromFile(filePath) {
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(data);
            questionsRep.value = parsed.questions || [];
            
            // Update current file in replicant
            const fileName = path.basename(filePath);
            questionFilesRep.value = {
                ...questionFilesRep.value,
                currentFile: fileName
            };
            
            nodecg.log.info(`Loaded ${questionsRep.value.length} questions from ${fileName}`);
            
            // Auto-select first question (hidden, no feedback states)
            if (questionsRep.value.length > 0) {
                const q = questionsRep.value[0];
                currentQuestionIndex = 0;
                questionRep.value = {
                    text: q.text,
                    propositions: q.propositions ? [...q.propositions] : [],
                    correctAnswer: q.correctAnswer !== undefined ? q.correctAnswer : -1,
                    state: 'hidden',
                    eliminatedAnswers: [],
                    answeredCorrectly: false,
                    revealOnWrong: true,
                    showCorrectOnWrong: false,
                    lastWrongAnswer: -1,
                    type: q.type || 'multipleChoice',
                    clues: q.clues ? [...q.clues] : [],
                    summary: q.summary || '',
                    answer: q.answer || '',
                    phase: q.phase || 1,
                    openWrongTeam: ''
                };
                nodecg.log.info('First question pre-selected (hidden)');
            }
            
            return true;
        } catch (error) {
            nodecg.log.error('Failed to load questions:', error.message);
            questionsRep.value = [];
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
            currentQuestion: currentQuestionIndex,
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
            currentQuestionIndex = 0;
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
        const index = parseInt(req.params.index);
        if (index < 0 || index >= questionsRep.value.length) {
            return sendJson(res, { error: 'Invalid question index' });
        }
        
        const q = questionsRep.value[index];
        currentQuestionIndex = index;
        const revealOnWrong = questionRep.value ? questionRep.value.revealOnWrong : true;
        questionRep.value = {
            text: q.text,
            propositions: q.propositions ? [...q.propositions] : [],
            correctAnswer: q.correctAnswer !== undefined ? q.correctAnswer : -1,
            state: 'showing',
            eliminatedAnswers: [],
            answeredCorrectly: false,
            revealOnWrong: revealOnWrong,
            showCorrectOnWrong: false,
            lastWrongAnswer: -1,
            type: q.type || 'multipleChoice',
            clues: q.clues ? [...q.clues] : [],
            summary: q.summary || '',
            answer: q.answer || '',
            phase: q.phase || 1,
            openWrongTeam: ''
        };
        
        nodecg.log.info(`[API] Showing question ${index + 1}`);
        sendJson(res, { success: true, question: index + 1 });
    });
    
    // POST /api/question/next - Show next question
    router.post('/api/question/next', (req, res) => {
        const nextIndex = currentQuestionIndex + 1;
        if (nextIndex >= questionsRep.value.length) {
            return sendJson(res, { error: 'No more questions' });
        }
        
        const q = questionsRep.value[nextIndex];
        currentQuestionIndex = nextIndex;
        const revealOnWrong = questionRep.value ? questionRep.value.revealOnWrong : true;
        questionRep.value = {
            text: q.text,
            propositions: q.propositions ? [...q.propositions] : [],
            correctAnswer: q.correctAnswer !== undefined ? q.correctAnswer : -1,
            state: 'showing',
            eliminatedAnswers: [],
            answeredCorrectly: false,
            revealOnWrong: revealOnWrong,
            showCorrectOnWrong: false,
            lastWrongAnswer: -1,
            type: q.type || 'multipleChoice',
            clues: q.clues ? [...q.clues] : [],
            summary: q.summary || '',
            answer: q.answer || '',
            phase: q.phase || 1,
            openWrongTeam: ''
        };
        
        nodecg.log.info(`[API] Showing next question ${nextIndex + 1}`);
        sendJson(res, { success: true, question: nextIndex + 1 });
    });
    
    // POST /api/question/previous - Show previous question
    router.post('/api/question/previous', (req, res) => {
        const prevIndex = currentQuestionIndex - 1;
        if (prevIndex < 0) {
            return sendJson(res, { error: 'Already at first question' });
        }
        
        const q = questionsRep.value[prevIndex];
        currentQuestionIndex = prevIndex;
        const revealOnWrong = questionRep.value ? questionRep.value.revealOnWrong : true;
        questionRep.value = {
            text: q.text,
            propositions: q.propositions ? [...q.propositions] : [],
            correctAnswer: q.correctAnswer !== undefined ? q.correctAnswer : -1,
            state: 'showing',
            eliminatedAnswers: [],
            answeredCorrectly: false,
            revealOnWrong: revealOnWrong,
            showCorrectOnWrong: false,
            lastWrongAnswer: -1,
            type: q.type || 'multipleChoice',
            clues: q.clues ? [...q.clues] : [],
            summary: q.summary || '',
            answer: q.answer || '',
            phase: q.phase || 1,
            openWrongTeam: ''
        };
        
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
            questionRep.value.openWrongTeam = team;
            const teamName = scoresRep.value ? scoresRep.value[team]?.name : team;
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
    
    // POST /api/score/team1/add - Add point to team 1
    router.post('/api/score/team1/add', (req, res) => {
        if (scoresRep.value) {
            scoresRep.value.team1.score++;
            nodecg.log.info(`[API] Team 1 score: ${scoresRep.value.team1.score}`);
            sendJson(res, { success: true, score: scoresRep.value.team1.score });
        }
    });
    
    // POST /api/score/team1/sub - Subtract point from team 1
    router.post('/api/score/team1/sub', (req, res) => {
        if (scoresRep.value) {
            scoresRep.value.team1.score = Math.max(0, scoresRep.value.team1.score - 1);
            nodecg.log.info(`[API] Team 1 score: ${scoresRep.value.team1.score}`);
            sendJson(res, { success: true, score: scoresRep.value.team1.score });
        }
    });
    
    // POST /api/score/team2/add - Add point to team 2
    router.post('/api/score/team2/add', (req, res) => {
        if (scoresRep.value) {
            scoresRep.value.team2.score++;
            nodecg.log.info(`[API] Team 2 score: ${scoresRep.value.team2.score}`);
            sendJson(res, { success: true, score: scoresRep.value.team2.score });
        }
    });
    
    // POST /api/score/team2/sub - Subtract point from team 2
    router.post('/api/score/team2/sub', (req, res) => {
        if (scoresRep.value) {
            scoresRep.value.team2.score = Math.max(0, scoresRep.value.team2.score - 1);
            nodecg.log.info(`[API] Team 2 score: ${scoresRep.value.team2.score}`);
            sendJson(res, { success: true, score: scoresRep.value.team2.score });
        }
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
        
        // For True/False questions, only allow answers 0 (True) or 1 (False)
        const isTrueFalse = questionRep.value.type === 'trueFalse';
        if (isTrueFalse && answerIndex > 1) {
            return sendJson(res, { error: 'Invalid answer for True/False question' });
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
            correctAnswerLabel = String.fromCharCode(65 + questionRep.value.correctAnswer);
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
    
    // Team 1 answers
    router.post('/api/team1/answer/a', (req, res) => processAnswer('team1', 0, res));
    router.post('/api/team1/answer/b', (req, res) => processAnswer('team1', 1, res));
    router.post('/api/team1/answer/c', (req, res) => processAnswer('team1', 2, res));
    router.post('/api/team1/answer/d', (req, res) => processAnswer('team1', 3, res));
    
    // Team 2 answers
    router.post('/api/team2/answer/a', (req, res) => processAnswer('team2', 0, res));
    router.post('/api/team2/answer/b', (req, res) => processAnswer('team2', 1, res));
    router.post('/api/team2/answer/c', (req, res) => processAnswer('team2', 2, res));
    router.post('/api/team2/answer/d', (req, res) => processAnswer('team2', 3, res));
    
    // Mount the router
    nodecg.mount('/quiz-overlay', router);
    nodecg.log.info('HTTP API mounted at /quiz-overlay/api/');
};

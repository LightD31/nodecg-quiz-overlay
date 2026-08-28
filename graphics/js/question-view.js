'use strict';

// Question rendering shared by the graphics in this folder.
//
// overlay-integrated.html and participant.html style the question card very
// differently, but they decide *what* to show from the same replicant in the
// same way: which propositions exist, which are eliminated, which is correct,
// and the clue/summary/wrong-answer feedback for the open question types. That
// logic was copy-pasted into both pages; it lives here now.
//
// Anything that is genuinely per-page - the overlay's phase badge and
// answer-visible sizing, the participant's waiting message - stays in the page.
//
// Exposed as window.QuizQuestionView.
(function (global) {

    const PROP_LETTERS = ['A', 'B', 'C', 'D'];

    // Only one graphic runs per document, so a single timer here is equivalent
    // to the per-page variable each copy used to keep.
    let wrongAnimationTimeout = null;

    function isThreeWords(question) {
        return (question.type || 'multipleChoice') === 'threeWordsClue';
    }

    function isFunnySummary(question) {
        return (question.type || 'multipleChoice') === 'funnySummary';
    }

    function isTrueFalse(question) {
        return (question.type || 'multipleChoice') === 'trueFalse';
    }

    function hasPropositions(question) {
        return Boolean(question.propositions && question.propositions.length > 0);
    }

    // How many proposition tiles this question type shows.
    function propositionCount(question) {
        if (isTrueFalse(question)) return 2;
        if (isThreeWords(question) || isFunnySummary(question)) return 3;
        return 4;
    }

    // Put the propositions grid into the right layout for the question type,
    // or hide it entirely for a question answered out loud.
    function applyGridMode(question, propositionsGrid) {
        if (!hasPropositions(question)) {
            propositionsGrid.style.display = 'none';
            return;
        }

        propositionsGrid.style.display = '';
        if (isThreeWords(question) || isFunnySummary(question)) {
            propositionsGrid.classList.add('special-mode');
            propositionsGrid.classList.remove('true-false');
        } else {
            propositionsGrid.classList.remove('special-mode');
            propositionsGrid.classList.toggle('true-false', isTrueFalse(question));
        }
    }

    // Show the clue row for threeWordsClue and the summary block for
    // funnySummary, and fill in their text.
    function renderCluesAndSummary(question, cluesContainer, clueElements, summaryContainer, summaryText) {
        cluesContainer.style.display = isThreeWords(question) ? 'flex' : 'none';
        summaryContainer.style.display = isFunnySummary(question) ? 'block' : 'none';

        if (isThreeWords(question) && question.clues) {
            question.clues.forEach((clue, i) => {
                if (clueElements[i]) {
                    clueElements[i].textContent = clue;
                }
            });
        }

        if (isFunnySummary(question) && question.summary) {
            summaryText.textContent = `"${question.summary}"`;
        }
    }

    // Fill in the proposition tiles and apply the correct/wrong/eliminated
    // states. A freshly wrong answer flashes as `wrong` and then settles into
    // `eliminated`, unless the correct answer is being revealed alongside it.
    function renderPropositions(question, propElements, propTexts) {
        if (!hasPropositions(question)) return;

        const currentPropCount = propositionCount(question);

        if (question.propositions) {
            question.propositions.forEach((prop, i) => {
                if (i < currentPropCount && propElements[i]) {
                    if (propTexts[i]) propTexts[i].textContent = prop || `Answer ${PROP_LETTERS[i]}`;
                    propElements[i].classList.remove('hidden');
                }
            });
        }

        for (let i = currentPropCount; i < propElements.length; i++) {
            if (propElements[i]) propElements[i].classList.add('hidden');
        }

        for (let i = 0; i < currentPropCount; i++) {
            const el = propElements[i];
            if (!el) continue;

            const isLastWrong = question.lastWrongAnswer == i;
            const isEliminated = question.eliminatedAnswers && question.eliminatedAnswers.some(a => a == i);

            if (isLastWrong && question.state === 'showing') {
                el.classList.remove('correct', 'eliminated');
                el.classList.add('wrong');

                if (!question.showCorrectOnWrong) {
                    if (wrongAnimationTimeout) clearTimeout(wrongAnimationTimeout);
                    wrongAnimationTimeout = setTimeout(() => {
                        el.classList.remove('wrong');
                        el.classList.add('eliminated');
                    }, 800);
                }
            } else {
                el.classList.remove('correct', 'wrong', 'eliminated');

                if (question.state === 'showing' && isEliminated && !isLastWrong) {
                    el.classList.add('eliminated');
                }

                if (question.state === 'showing' && question.showCorrectOnWrong && i == question.correctAnswer) {
                    el.classList.add('correct');
                }

                if (question.state === 'revealed') {
                    if (i == question.correctAnswer) {
                        el.classList.add('correct');
                    }
                    if (isEliminated) {
                        el.classList.add('eliminated');
                    }
                }
            }
        }
    }

    // "<team> a répondu faux" feedback, shown only while an open question is
    // still on screen.
    function renderWrongFeedback(question, scores, wrongFeedbackContainer, wrongFeedbackTeam) {
        const isOpen = isThreeWords(question) || isFunnySummary(question);

        if (isOpen && question.openWrongTeam && question.state === 'showing') {
            const teamKey = question.openWrongTeam;
            let teamName = teamKey === 'team1' ? 'Équipe 1' : 'Équipe 2';
            if (scores && scores[teamKey]) {
                teamName = scores[teamKey].name || teamName;
            }
            wrongFeedbackTeam.textContent = teamName;
            wrongFeedbackContainer.classList.add('visible');
        } else {
            wrongFeedbackContainer.classList.remove('visible');
        }
    }

    global.QuizQuestionView = {
        PROP_LETTERS,
        isThreeWords,
        isFunnySummary,
        isTrueFalse,
        hasPropositions,
        propositionCount,
        applyGridMode,
        renderCluesAndSummary,
        renderPropositions,
        renderWrongFeedback
    };
})(window);

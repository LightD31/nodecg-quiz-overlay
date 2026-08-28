'use strict';

const QUESTION_TYPES = ['multipleChoice', 'trueFalse', 'threeWordsClue', 'funnySummary'];

// Question types that are answered verbally instead of with the A/B/C/D buttons
// (unless the file also supplies propositions for them).
function isOpenType(type) {
    return type === 'threeWordsClue' || type === 'funnySummary';
}

function toText(value) {
    if (typeof value === 'string') return value;
    if (value === undefined || value === null) return '';
    return String(value);
}

function toTextArray(value) {
    return Array.isArray(value) ? value.map(toText) : [];
}

/**
 * Coerce a raw question from a JSON file into the shape every panel and graphic
 * expects, and collect anything that looks wrong along the way.
 *
 * Questions with problems are kept rather than dropped: removing one would shift
 * the index of every question after it, which is far more disruptive mid-show
 * than a flagged question. The `issues` array is surfaced in the control panel.
 */
function normalizeQuestion(raw) {
    const issues = [];
    const isObject = Boolean(raw) && typeof raw === 'object' && !Array.isArray(raw);
    const source = isObject ? raw : {};

    if (!isObject) {
        issues.push('not a question object - replaced with an empty question');
    }

    let type = toText(source.type) || 'multipleChoice';
    if (!QUESTION_TYPES.includes(type)) {
        issues.push(`unknown type "${type}" - treated as multipleChoice`);
        type = 'multipleChoice';
    }

    if (source.propositions !== undefined && !Array.isArray(source.propositions)) {
        issues.push('"propositions" is not an array - ignored');
    }
    if (source.clues !== undefined && !Array.isArray(source.clues)) {
        issues.push('"clues" is not an array - ignored');
    }

    const text = toText(source.text);
    const summary = toText(source.summary);
    const answer = toText(source.answer);
    const propositions = toTextArray(source.propositions);
    const clues = toTextArray(source.clues);

    let phase = Number(source.phase);
    if (source.phase !== undefined && !Number.isFinite(phase)) {
        issues.push(`phase "${source.phase}" is not a number - defaulted to 1`);
    }
    if (!Number.isFinite(phase)) {
        phase = 1;
    }

    let correctAnswer = Number(source.correctAnswer);
    if (!Number.isInteger(correctAnswer)) {
        correctAnswer = -1;
    }

    // An open question is one the teams answer out loud, so it needs no propositions.
    const isOpen = isOpenType(type) && propositions.length === 0;

    if (!text && !isOpen) {
        issues.push('missing "text"');
    }

    if (type === 'trueFalse') {
        if (correctAnswer !== 0 && correctAnswer !== 1) {
            issues.push('trueFalse needs "correctAnswer" 0 (true) or 1 (false)');
        }
    } else if (isOpen) {
        if (!answer) {
            issues.push('missing "answer"');
        }
        if (type === 'threeWordsClue' && clues.length === 0) {
            issues.push('missing "clues"');
        }
        if (type === 'funnySummary' && !summary) {
            issues.push('missing "summary"');
        }
    } else {
        if (propositions.length < 2) {
            issues.push(`needs at least 2 propositions, got ${propositions.length}`);
        }
        if (source.correctAnswer === undefined) {
            issues.push('missing "correctAnswer"');
        } else if (correctAnswer < 0 || correctAnswer >= propositions.length) {
            issues.push(`"correctAnswer" ${source.correctAnswer} is out of range for ${propositions.length} proposition(s)`);
        }
        if (propositions.length > 4) {
            issues.push(`${propositions.length} propositions - only the first 4 are displayed`);
        }
    }

    return { type, text, propositions, clues, summary, answer, phase, correctAnswer, issues };
}

/**
 * Build the full `question` replicant payload for a normalized question.
 * Every field is set explicitly so no state leaks from the previous question.
 */
function buildQuestionState(question, state, revealOnWrong) {
    return {
        text: question.text,
        propositions: [...question.propositions],
        correctAnswer: question.correctAnswer,
        state,
        eliminatedAnswers: [],
        answeredCorrectly: false,
        revealOnWrong,
        showCorrectOnWrong: false,
        lastWrongAnswer: -1,
        type: question.type,
        clues: [...question.clues],
        summary: question.summary,
        answer: question.answer,
        phase: question.phase,
        openWrongTeam: ''
    };
}

module.exports = {
    QUESTION_TYPES,
    isOpenType,
    normalizeQuestion,
    buildQuestionState
};

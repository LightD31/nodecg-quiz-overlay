'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { normalizeQuestion, buildQuestionState } = require('../extension/questions');

test('a valid multiple choice question passes without issues', () => {
    const q = normalizeQuestion({
        type: 'multipleChoice',
        text: 'What is the capital of France?',
        propositions: ['London', 'Berlin', 'Paris', 'Madrid'],
        correctAnswer: 2,
        phase: 1
    });

    assert.deepStrictEqual(q.issues, []);
    assert.strictEqual(q.correctAnswer, 2);
    assert.strictEqual(q.propositions.length, 4);
});

test('a missing type defaults to multipleChoice', () => {
    const q = normalizeQuestion({ text: 'Q', propositions: ['a', 'b'], correctAnswer: 0 });
    assert.strictEqual(q.type, 'multipleChoice');
    assert.deepStrictEqual(q.issues, []);
});

test('an unknown type is flagged and falls back to multipleChoice', () => {
    const q = normalizeQuestion({ type: 'quickfire', text: 'Q', propositions: ['a', 'b'], correctAnswer: 0 });
    assert.strictEqual(q.type, 'multipleChoice');
    assert.strictEqual(q.issues.length, 1);
    assert.match(q.issues[0], /unknown type/);
});

test('an out of range correctAnswer is flagged', () => {
    const q = normalizeQuestion({ text: 'Q', propositions: ['a', 'b', 'c', 'd'], correctAnswer: 7 });
    assert.strictEqual(q.issues.length, 1);
    assert.match(q.issues[0], /out of range/);
});

test('a missing correctAnswer is flagged rather than defaulting to A', () => {
    const q = normalizeQuestion({ text: 'Q', propositions: ['a', 'b'] });
    assert.strictEqual(q.correctAnswer, -1);
    assert.match(q.issues.join(" "), /missing "correctAnswer"/);
});

test('missing text is flagged for a multiple choice question', () => {
    const q = normalizeQuestion({ propositions: ['a', 'b'], correctAnswer: 0 });
    assert.match(q.issues.join(' '), /missing "text"/);
});

test('trueFalse only accepts correctAnswer 0 or 1', () => {
    assert.deepStrictEqual(normalizeQuestion({ type: 'trueFalse', text: 'Q', correctAnswer: 0 }).issues, []);
    assert.deepStrictEqual(normalizeQuestion({ type: 'trueFalse', text: 'Q', correctAnswer: 1 }).issues, []);
    assert.match(
        normalizeQuestion({ type: 'trueFalse', text: 'Q', correctAnswer: 3 }).issues.join(' '),
        /0 \(true\) or 1 \(false\)/
    );
});

test('trueFalse does not require propositions', () => {
    const q = normalizeQuestion({ type: 'trueFalse', text: 'The earth is flat.', correctAnswer: 1 });
    assert.deepStrictEqual(q.issues, []);
    assert.deepStrictEqual(q.propositions, []);
});

test('threeWordsClue needs clues and an answer', () => {
    const good = normalizeQuestion({
        type: 'threeWordsClue',
        text: 'Identify the movie',
        clues: ['Witch', 'Lion', 'Wardrobe'],
        answer: 'The Chronicles of Narnia'
    });
    assert.deepStrictEqual(good.issues, []);

    const bad = normalizeQuestion({ type: 'threeWordsClue', text: 'Identify the movie' });
    assert.match(bad.issues.join(' '), /missing "clues"/);
    assert.match(bad.issues.join(' '), /missing "answer"/);
});

test('funnySummary needs a summary and an answer', () => {
    const good = normalizeQuestion({
        type: 'funnySummary',
        text: 'What is this movie?',
        summary: 'A billionaire beats up a mentally ill person.',
        answer: 'Batman'
    });
    assert.deepStrictEqual(good.issues, []);

    const bad = normalizeQuestion({ type: 'funnySummary', answer: 'Batman' });
    assert.match(bad.issues.join(' '), /missing "summary"/);
});

test('an open question type with propositions is validated like a multiple choice', () => {
    const q = normalizeQuestion({
        type: 'funnySummary',
        text: 'What is this movie?',
        summary: 'A billionaire beats up a mentally ill person.',
        propositions: ['Batman', 'Superman', 'Spider-Man'],
        correctAnswer: 5
    });
    assert.match(q.issues.join(' '), /out of range/);
});

test('non-array propositions and clues are ignored and flagged', () => {
    const q = normalizeQuestion({ text: 'Q', propositions: 'a,b,c', clues: 'x' });
    assert.deepStrictEqual(q.propositions, []);
    assert.deepStrictEqual(q.clues, []);
    assert.match(q.issues.join(' '), /"propositions" is not an array/);
    assert.match(q.issues.join(' '), /"clues" is not an array/);
});

test('a non-numeric phase is flagged and defaults to 1', () => {
    const q = normalizeQuestion({ text: 'Q', propositions: ['a', 'b'], correctAnswer: 0, phase: 'two' });
    assert.strictEqual(q.phase, 1);
    assert.match(q.issues.join(' '), /phase "two"/);
});

test('garbage entries never throw and are always renderable', () => {
    for (const raw of [null, undefined, 42, 'a string', [], { text: 12345 }]) {
        const q = normalizeQuestion(raw);
        assert.strictEqual(typeof q.text, 'string');
        assert.ok(Array.isArray(q.propositions));
        assert.ok(Array.isArray(q.clues));
        assert.ok(Array.isArray(q.issues));
        assert.strictEqual(typeof q.phase, 'number');
    }
});

test('more than four propositions is flagged as truncated', () => {
    const q = normalizeQuestion({ text: 'Q', propositions: ['a', 'b', 'c', 'd', 'e'], correctAnswer: 0 });
    assert.match(q.issues.join(' '), /only the first 4 are displayed/);
});

test('buildQuestionState clears all per-question feedback state', () => {
    const q = normalizeQuestion({ text: 'Q', propositions: ['a', 'b'], correctAnswer: 1 });
    const state = buildQuestionState(q, 'showing', false);

    assert.strictEqual(state.state, 'showing');
    assert.strictEqual(state.revealOnWrong, false);
    assert.deepStrictEqual(state.eliminatedAnswers, []);
    assert.strictEqual(state.answeredCorrectly, false);
    assert.strictEqual(state.showCorrectOnWrong, false);
    assert.strictEqual(state.lastWrongAnswer, -1);
    assert.strictEqual(state.openWrongTeam, '');
});

test('buildQuestionState copies arrays instead of sharing them', () => {
    const q = normalizeQuestion({ text: 'Q', propositions: ['a', 'b'], correctAnswer: 0 });
    const state = buildQuestionState(q, 'showing', true);

    state.propositions.push('c');
    assert.strictEqual(q.propositions.length, 2);
});

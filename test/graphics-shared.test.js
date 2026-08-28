'use strict';

// Unit tests for the modules shared by the two graphics. These run the real
// files from graphics/js/ in a stubbed browser context.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadGraphicsModules() {
    const timers = [];
    const cssVars = {};
    const sandbox = {
        setTimeout: (fn) => { timers.push(fn); return timers.length; },
        clearTimeout: (id) => { if (id) timers[id - 1] = null; },
        document: {
            documentElement: { style: { setProperty: (k, v) => { cssVars[k] = v; } } },
            body: { style: {} }
        }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);

    for (const file of ['theme.js', 'question-view.js']) {
        const code = fs.readFileSync(path.join(__dirname, '..', 'graphics', 'js', file), 'utf8');
        new vm.Script(code, { filename: file }).runInContext(sandbox);
    }

    return {
        theme: sandbox.QuizTheme,
        view: sandbox.QuizQuestionView,
        cssVars,
        flushTimers: () => timers.splice(0).forEach(fn => fn && fn())
    };
}

function makeEl() {
    const classes = new Set();
    return {
        textContent: '',
        style: {},
        classes,
        classList: {
            add: (...c) => c.forEach(x => classes.add(x)),
            remove: (...c) => c.forEach(x => classes.delete(x)),
            toggle: (c, force) => {
                const on = force === undefined ? !classes.has(c) : force;
                if (on) classes.add(c); else classes.delete(c);
            },
            contains: c => classes.has(c)
        }
    };
}

const question = (over = {}) => Object.assign({
    text: 'Q', propositions: ['a', 'b', 'c', 'd'], correctAnswer: 2, state: 'showing',
    eliminatedAnswers: [], answeredCorrectly: false, showCorrectOnWrong: false,
    lastWrongAnswer: -1, type: 'multipleChoice', clues: [], summary: '', answer: '',
    phase: 1, openWrongTeam: ''
}, over);

// --- theme -----------------------------------------------------------------

test('both shared modules load and export their API', () => {
    const { theme, view } = loadGraphicsModules();
    ['hexToRgb', 'rgbToHex', 'mixRgb', 'approxLuminance', 'setCssVar', 'applyTheme', 'applyGradient', 'hexToRgba']
        .forEach(fn => assert.strictEqual(typeof theme[fn], 'function', `QuizTheme.${fn}`));
    ['applyGridMode', 'renderCluesAndSummary', 'renderPropositions', 'renderWrongFeedback', 'propositionCount']
        .forEach(fn => assert.strictEqual(typeof view[fn], 'function', `QuizQuestionView.${fn}`));
});

test('hexToRgb handles 3 and 6 digit hex and rejects junk', () => {
    const { theme } = loadGraphicsModules();
    // Spread into this realm: objects built inside the vm have a different
    // Object prototype, which deepStrictEqual treats as a mismatch.
    assert.deepStrictEqual({ ...theme.hexToRgb('#ff8000') }, { r: 255, g: 128, b: 0 });
    assert.deepStrictEqual({ ...theme.hexToRgb('#f80') }, { r: 255, g: 136, b: 0 });
    assert.strictEqual(theme.hexToRgb(''), null);
    assert.strictEqual(theme.hexToRgb('#12345'), null);
});

test('rgbToHex round-trips with hexToRgb', () => {
    const { theme } = loadGraphicsModules();
    assert.strictEqual(theme.rgbToHex(theme.hexToRgb('#224aa8')), '#224aa8');
    assert.strictEqual(theme.rgbToHex({ r: 0, g: 0, b: 0 }), '#000000');
});

test('a dark background gets light text, a light background gets dark text', () => {
    const dark = loadGraphicsModules();
    dark.theme.applyTheme('#1a1a2e');
    assert.strictEqual(dark.cssVars['--theme-text-strong'], '#ffffff');

    const light = loadGraphicsModules();
    light.theme.applyTheme('#f2f2f2');
    assert.strictEqual(light.cssVars['--theme-text-strong'], '#1b0d0d');
});

test('applyTheme falls back to the default background for junk input', () => {
    const { theme, cssVars } = loadGraphicsModules();
    theme.applyTheme('not-a-colour');
    assert.strictEqual(cssVars['--theme-text-strong'], '#ffffff');
    assert.ok(cssVars['--theme-accent'], 'an accent is still derived');
});

// --- proposition rendering -------------------------------------------------

test('propositionCount matches the question type', () => {
    const { view } = loadGraphicsModules();
    assert.strictEqual(view.propositionCount(question()), 4);
    assert.strictEqual(view.propositionCount(question({ type: 'trueFalse' })), 2);
    assert.strictEqual(view.propositionCount(question({ type: 'threeWordsClue' })), 3);
    assert.strictEqual(view.propositionCount(question({ type: 'funnySummary' })), 3);
});

test('revealing marks the correct answer and keeps eliminated ones eliminated', () => {
    const { view } = loadGraphicsModules();
    const props = [makeEl(), makeEl(), makeEl(), makeEl()];
    const texts = [makeEl(), makeEl(), makeEl(), makeEl()];

    view.renderPropositions(question({ state: 'revealed', eliminatedAnswers: [0] }), props, texts);

    assert.ok(props[2].classList.contains('correct'), 'correct answer marked');
    assert.ok(props[0].classList.contains('eliminated'), 'eliminated answer marked');
    assert.ok(!props[1].classList.contains('correct'));
    assert.strictEqual(texts[2].textContent, 'c');
});

test('a fresh wrong answer flashes wrong then settles to eliminated', () => {
    const { view, flushTimers } = loadGraphicsModules();
    const props = [makeEl(), makeEl(), makeEl(), makeEl()];
    const texts = [makeEl(), makeEl(), makeEl(), makeEl()];

    view.renderPropositions(question({ eliminatedAnswers: [0], lastWrongAnswer: 0 }), props, texts);
    assert.ok(props[0].classList.contains('wrong'), 'flashes wrong first');
    assert.ok(!props[0].classList.contains('eliminated'));

    flushTimers();
    assert.ok(props[0].classList.contains('eliminated'), 'settles to eliminated');
    assert.ok(!props[0].classList.contains('wrong'));
});

test('when the correct answer is revealed alongside a wrong one, the flash does not settle', () => {
    const { view, flushTimers } = loadGraphicsModules();
    const props = [makeEl(), makeEl(), makeEl(), makeEl()];
    const texts = [makeEl(), makeEl(), makeEl(), makeEl()];

    view.renderPropositions(
        question({ eliminatedAnswers: [0], lastWrongAnswer: 0, showCorrectOnWrong: true }),
        props, texts
    );
    flushTimers();

    assert.ok(props[0].classList.contains('wrong'), 'stays wrong');
    assert.ok(props[2].classList.contains('correct'), 'correct answer shown');
});

test('tiles beyond the question type\'s count are hidden', () => {
    const { view } = loadGraphicsModules();
    const props = [makeEl(), makeEl(), makeEl(), makeEl()];
    const texts = [makeEl(), makeEl(), makeEl(), makeEl()];

    view.renderPropositions(question({ type: 'trueFalse', propositions: ['Vrai', 'Faux'] }), props, texts);

    assert.ok(!props[0].classList.contains('hidden'));
    assert.ok(!props[1].classList.contains('hidden'));
    assert.ok(props[2].classList.contains('hidden'), 'C hidden for true/false');
    assert.ok(props[3].classList.contains('hidden'), 'D hidden for true/false');
});

test('an empty proposition falls back to its letter', () => {
    const { view } = loadGraphicsModules();
    const props = [makeEl(), makeEl(), makeEl(), makeEl()];
    const texts = [makeEl(), makeEl(), makeEl(), makeEl()];

    view.renderPropositions(question({ propositions: ['', 'b', 'c', 'd'] }), props, texts);
    assert.strictEqual(texts[0].textContent, 'Answer A');
});

test('a question with no propositions renders nothing', () => {
    const { view } = loadGraphicsModules();
    const props = [makeEl(), makeEl(), makeEl(), makeEl()];
    const texts = [makeEl(), makeEl(), makeEl(), makeEl()];

    view.renderPropositions(question({ type: 'threeWordsClue', propositions: [] }), props, texts);
    props.forEach(p => assert.strictEqual(p.classes.size, 0));
});

// --- grid, clues, summary, feedback ----------------------------------------

test('the grid switches layout per question type', () => {
    const { view } = loadGraphicsModules();

    const mc = makeEl();
    view.applyGridMode(question(), mc);
    assert.strictEqual(mc.style.display, '');
    assert.ok(!mc.classList.contains('true-false'));

    const tf = makeEl();
    view.applyGridMode(question({ type: 'trueFalse', propositions: ['Vrai', 'Faux'] }), tf);
    assert.ok(tf.classList.contains('true-false'));

    const special = makeEl();
    view.applyGridMode(question({ type: 'funnySummary', propositions: ['a', 'b', 'c'] }), special);
    assert.ok(special.classList.contains('special-mode'));

    const open = makeEl();
    view.applyGridMode(question({ type: 'funnySummary', propositions: [] }), open);
    assert.strictEqual(open.style.display, 'none');
});

test('clues and summary are shown only for their own question type', () => {
    const { view } = loadGraphicsModules();
    const clues = makeEl(), summary = makeEl(), summaryText = makeEl();
    const clueEls = [makeEl(), makeEl(), makeEl()];

    view.renderCluesAndSummary(
        question({ type: 'threeWordsClue', clues: ['Witch', 'Lion', 'Wardrobe'] }),
        clues, clueEls, summary, summaryText
    );
    assert.strictEqual(clues.style.display, 'flex');
    assert.strictEqual(summary.style.display, 'none');
    assert.strictEqual(clueEls[1].textContent, 'Lion');

    view.renderCluesAndSummary(
        question({ type: 'funnySummary', summary: 'A billionaire beats up a mentally ill person.' }),
        clues, clueEls, summary, summaryText
    );
    assert.strictEqual(clues.style.display, 'none');
    assert.strictEqual(summary.style.display, 'block');
    assert.strictEqual(summaryText.textContent, '"A billionaire beats up a mentally ill person."');
});

test('wrong-answer feedback uses the team name and only shows while the question is up', () => {
    const { view } = loadGraphicsModules();
    const container = makeEl(), teamEl = makeEl();
    const scores = { team1: { name: 'Alpha' }, team2: { name: 'Bravo' } };
    const open = { type: 'threeWordsClue', propositions: [], state: 'showing', openWrongTeam: 'team2' };

    view.renderWrongFeedback(open, scores, container, teamEl);
    assert.ok(container.classList.contains('visible'));
    assert.strictEqual(teamEl.textContent, 'Bravo');

    view.renderWrongFeedback({ ...open, state: 'revealed' }, scores, container, teamEl);
    assert.ok(!container.classList.contains('visible'), 'hidden once revealed');

    view.renderWrongFeedback(open, null, container, teamEl);
    assert.strictEqual(teamEl.textContent, 'Équipe 2', 'falls back when scores are missing');
});

test('wrong-answer feedback never shows for a multiple choice question', () => {
    const { view } = loadGraphicsModules();
    const container = makeEl(), teamEl = makeEl();
    view.renderWrongFeedback(question({ openWrongTeam: 'team1' }), null, container, teamEl);
    assert.ok(!container.classList.contains('visible'));
});

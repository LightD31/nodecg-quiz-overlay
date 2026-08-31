'use strict';

// Exercises the HTTP API by loading the real extension against a stubbed
// NodeCG and a minimal router, then asserting the status code and body of
// each response. Clients such as Bitfocus Companion key off the status code,
// so the codes are part of the contract.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const BUNDLE_ROOT = path.join(__dirname, '..');
const QUESTIONS_DIR = path.join(BUNDLE_ROOT, 'questions');

// Build a fresh extension instance with its own replicants and routes.
// `preset` seeds replicant values before the extension declares them, which is
// the only way to reach the "replicant not ready" branches.
function loadExtension(preset = {}) {
    const reps = { ...preset };
    const routes = [];
    const logs = [];

    const nodecg = {
        Replicant(name, opts = {}) {
            if (!reps[name]) reps[name] = { value: opts.defaultValue };
            return reps[name];
        },
        Router: () => ({
            get: (p, h) => routes.push({ method: 'GET', path: p, handler: h }),
            post: (p, h) => routes.push({ method: 'POST', path: p, handler: h })
        }),
        mount: () => {},
        log: {
            info: m => logs.push(`info: ${m}`),
            warn: (...m) => logs.push(`warn: ${m.join(' ')}`),
            error: (...m) => logs.push(`error: ${m.join(' ')}`)
        }
    };

    // The extension is required fresh so module state does not leak between tests.
    delete require.cache[require.resolve('../extension/index.js')];
    delete require.cache[require.resolve('../extension/questions.js')];
    require('../extension/index.js')(nodecg);

    // Match a request against the registered routes the way Express would for
    // these single-segment `:param` patterns.
    function call(method, url) {
        const [pathname, query = ''] = url.split('?');
        const segments = pathname.split('/').filter(Boolean);

        for (const route of routes) {
            if (route.method !== method) continue;
            const pattern = route.path.split('/').filter(Boolean);
            if (pattern.length !== segments.length) continue;

            const params = {};
            let matched = true;
            for (let i = 0; i < pattern.length; i++) {
                if (pattern[i].startsWith(':')) params[pattern[i].slice(1)] = segments[i];
                else if (pattern[i] !== segments[i]) { matched = false; break; }
            }
            if (!matched) continue;

            let status = 200;
            let body;
            const res = {
                status(code) { status = code; return this; },
                json(payload) { body = payload; return this; },
                setHeader() { return this; },
                send(payload) { body = typeof payload === 'string' ? JSON.parse(payload) : payload; return this; }
            };
            route.handler({ params, query: Object.fromEntries(new URLSearchParams(query)) }, res);
            return { status, body };
        }

        throw new Error(`no route matched ${method} ${url}`);
    }

    return { call, reps, logs };
}

// example.json ships with the bundle: 2 multiple choice, 1 true/false,
// 1 threeWordsClue, 1 funnySummary.
test('the bundled example questions load', () => {
    const { reps } = loadExtension();
    assert.strictEqual(reps.questionsList.value.length, 5);
});

// --- 200 -------------------------------------------------------------------

test('successful requests answer 200', () => {
    const { call } = loadExtension();

    assert.strictEqual(call('GET', '/api/status').status, 200);
    assert.strictEqual(call('GET', '/api/files').status, 200);
    assert.strictEqual(call('POST', '/api/files/refresh').status, 200);
    assert.strictEqual(call('POST', '/api/question/show/0').status, 200);
    assert.strictEqual(call('POST', '/api/question/next').status, 200);
    assert.strictEqual(call('POST', '/api/question/previous').status, 200);
    assert.strictEqual(call('POST', '/api/question/hide').status, 200);
    assert.strictEqual(call('POST', '/api/question/show').status, 200);
    assert.strictEqual(call('POST', '/api/question/reveal').status, 200);
    assert.strictEqual(call('POST', '/api/score/team1/add').status, 200);
    assert.strictEqual(call('POST', '/api/score/team2/sub').status, 200);
    assert.strictEqual(call('POST', '/api/score/reset').status, 200);
    assert.strictEqual(call('POST', '/api/settings/revealOnWrong?enabled=false').status, 200);
});

test('a successful response still reports success in the body', () => {
    const { call } = loadExtension();
    const res = call('POST', '/api/question/show/1');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual({ ...res.body }, { success: true, question: 2 });
});

// --- 400: the request itself is malformed -----------------------------------

test('a non-numeric question index is 400', () => {
    const { call } = loadExtension();
    const res = call('POST', '/api/question/show/banana');
    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /expected a number/);
});

test('an unknown team is 400 on every endpoint that takes one', () => {
    const { call } = loadExtension();
    for (const url of [
        '/api/score/nobody/add',
        '/api/nobody/answer/a',
        '/api/question/openWrong/nobody'
    ]) {
        const res = call('POST', url);
        assert.strictEqual(res.status, 400, url);
        assert.match(res.body.error, /team1 or team2/, url);
    }
});

test('an unknown score action is 400', () => {
    const { call } = loadExtension();
    const res = call('POST', '/api/score/team1/multiply');
    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /add or sub/);
});

test('an answer option outside a-d is 400', () => {
    const { call } = loadExtension();
    const res = call('POST', '/api/team1/answer/z');
    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /a, b, c or d/);
});

// --- 404: the thing addressed does not exist --------------------------------

test('an out of range question index is 404', () => {
    const { call } = loadExtension();
    const res = call('POST', '/api/question/show/99');
    assert.strictEqual(res.status, 404);
    assert.match(res.body.error, /No question at index 99/);
});

test('loading a file that does not exist is 404', () => {
    const { call } = loadExtension();
    const res = call('POST', '/api/files/load/nope.json');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'File not found');
});

// --- 409: conflicts with the current state ----------------------------------

test('running past the last question is 409', () => {
    const { call, reps } = loadExtension();
    call('POST', `/api/question/show/${reps.questionsList.value.length - 1}`);
    const res = call('POST', '/api/question/next');
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.error, 'No more questions');
});

test('going back from the first question is 409', () => {
    const { call } = loadExtension();
    call('POST', '/api/question/show/0');
    const res = call('POST', '/api/question/previous');
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.error, 'Already at first question');
});

test('answering again after the answer is revealed is 409', () => {
    const { call } = loadExtension();
    call('POST', '/api/question/show/0');   // correctAnswer 2
    call('POST', '/api/team1/answer/c');    // correct - reveals and locks

    const res = call('POST', '/api/team2/answer/a');
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.error, 'Answer already revealed');
});

test('replaying an eliminated answer is 409', () => {
    const { call } = loadExtension();
    call('POST', '/api/question/show/0');
    call('POST', '/api/team1/answer/a');    // wrong - eliminates A

    const res = call('POST', '/api/team2/answer/a');
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.error, 'Answer already eliminated');
});

test('an option beyond a true/false question is 409, not 400', () => {
    const { call } = loadExtension();
    call('POST', '/api/question/show/2');   // the true/false question

    const res = call('POST', '/api/team1/answer/c');
    // The request is well formed - it just does not fit this question.
    assert.strictEqual(res.status, 409);
    assert.match(res.body.error, /only has 2 options/);
});

test('pressing an answer button on a verbal question is 409', () => {
    const { call } = loadExtension();
    call('POST', '/api/question/show/3');   // threeWordsClue, answered out loud

    const res = call('POST', '/api/team1/answer/a');
    assert.strictEqual(res.status, 409);
    assert.match(res.body.error, /answered verbally/);
});

// --- 422: the file is there but unusable ------------------------------------

test('a question file that is not valid JSON is 422', (t) => {
    const broken = path.join(QUESTIONS_DIR, 'broken-for-test.json');
    fs.writeFileSync(broken, '{ not json at all');
    t.after(() => fs.rmSync(broken, { force: true }));

    const { call, reps } = loadExtension();
    const res = call('POST', '/api/files/load/broken-for-test.json');

    assert.strictEqual(res.status, 422);
    assert.match(res.body.error, /not valid JSON/);
    assert.strictEqual(reps.questionsList.value.length, 0, 'stale questions are cleared');
    assert.strictEqual(reps.currentQuestionIndex.value, -1);
});

// --- the body contract is unchanged ----------------------------------------

test('every refusal still carries an error string in the body', () => {
    const { call } = loadExtension();
    for (const url of ['/api/question/show/99', '/api/score/nobody/add', '/api/team1/answer/z']) {
        const res = call('POST', url);
        assert.ok(res.status >= 400, url);
        assert.strictEqual(typeof res.body.error, 'string', url);
        assert.ok(!('success' in res.body), url);
    }
});

// --- 503: a replicant is not ready ------------------------------------------

test('score endpoints answer 503 rather than hanging when scores are missing', () => {
    // Before this change /api/score/reset had no else branch: with no scores it
    // returned nothing at all and the client waited for its own timeout.
    const { call } = loadExtension({ scores: { value: null } });

    for (const url of ['/api/score/reset', '/api/score/team1/add', '/api/score/team2/sub']) {
        const res = call('POST', url);
        assert.strictEqual(res.status, 503, url);
        assert.strictEqual(typeof res.body.error, 'string', url);
    }
});

test('every endpoint answers something - none leave the request hanging', () => {
    const { call } = loadExtension({ scores: { value: null }, question: { value: null } });

    const urls = [
        ['GET', '/api/status'],
        ['GET', '/api/files'],
        ['POST', '/api/files/refresh'],
        ['POST', '/api/files/load/nope.json'],
        ['POST', '/api/question/show/0'],
        ['POST', '/api/question/show/abc'],
        ['POST', '/api/question/show'],
        ['POST', '/api/question/hide'],
        ['POST', '/api/question/next'],
        ['POST', '/api/question/previous'],
        ['POST', '/api/question/reveal'],
        ['POST', '/api/question/clearWrong'],
        ['POST', '/api/question/openWrong/team1'],
        ['POST', '/api/settings/revealOnWrong?enabled=true'],
        ['POST', '/api/score/reset'],
        ['POST', '/api/score/team1/add'],
        ['POST', '/api/team1/answer/a']
    ];

    for (const [method, url] of urls) {
        const res = call(method, url);
        assert.ok(Number.isInteger(res.status), `${method} ${url} produced no status`);
        assert.ok(res.body !== undefined, `${method} ${url} produced no body`);
    }
});

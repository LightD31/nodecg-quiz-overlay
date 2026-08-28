'use strict';

// Most of this bundle's code lives in <script> blocks inside the dashboard
// panels and graphics, where nothing else would catch a syntax error until the
// page is opened in NodeCG - by which point it is usually show day. These tests
// parse every piece of browser JavaScript in the bundle.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const BROWSER_DIRS = ['dashboard', 'graphics'];

function walk(dir) {
    const absolute = path.join(ROOT, dir);
    if (!fs.existsSync(absolute)) return [];

    return fs.readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
        const relative = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(relative) : [relative];
    });
}

const files = BROWSER_DIRS.flatMap(walk);
const pages = files.filter(f => f.endsWith('.html'));
const scripts = files.filter(f => f.endsWith('.js'));

function parse(code, filename) {
    // vm.Script parses without executing, so browser globals are irrelevant.
    assert.doesNotThrow(() => new vm.Script(code, { filename }));
}

test('the dashboard panels and graphics are discovered', () => {
    assert.ok(pages.length >= 6, `expected at least 6 pages, found ${pages.length}`);
});

let blocksChecked = 0;

for (const page of pages) {
    test(`${page}: inline scripts parse`, () => {
        const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
        const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];

        blocks.forEach((match, i) => {
            parse(match[1], `${page}#inline-${i}`);
            blocksChecked++;
        });
    });
}

for (const script of scripts) {
    test(`${script}: parses`, () => {
        parse(fs.readFileSync(path.join(ROOT, script), 'utf8'), script);
        blocksChecked++;
    });
}

test('some browser JavaScript was actually checked', () => {
    assert.ok(blocksChecked > 0, 'no inline scripts or .js files were parsed');
});

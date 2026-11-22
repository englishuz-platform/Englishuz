#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const articlesJson = JSON.parse(fs.readFileSync(path.join(root, 'data', 'articles.json'), 'utf8'));
const report = [];
function check(name, fn) { fn(); report.push(name); }

function makeElement(selector = '') {
  return {
    selector, innerHTML: '', textContent: '', value: '', hidden: false, disabled: false,
    dataset: {}, attributes: {}, style: {}, isConnected: true,
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    removeAttribute(k) { delete this.attributes[k]; },
    addEventListener(){}, removeEventListener(){},
    querySelector(){ return makeElement('nested'); }, querySelectorAll(){ return []; },
    append(){}, appendChild(){}, remove(){}, focus(){}, select(){}, blur(){},
    setSelectionRange(){}, closest(){ return null; },
    getBoundingClientRect(){ return { width: 100, height: 30 }; }
  };
}
const local = new Map();
const elements = new Map();
const events = new Map();
const documentMock = {
  visibilityState: 'visible',
  documentElement: makeElement('html'),
  body: makeElement('body'),
  activeElement: null,
  querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, makeElement(selector));
    return elements.get(selector);
  },
  querySelectorAll(){ return []; },
  getElementById(id) { return this.querySelector(`#${id}`); },
  addEventListener(){},
  createElement(tag){ return makeElement(tag); }
};
const windowMock = {
  location: { hash: '#dashboard', protocol: 'https:' }, history: { replaceState(){} }, innerWidth: 1440, navigator: {},
  EnglishUzAuth: { getState: () => ({ status: 'unconfigured', user: null, profile: null, syncStatus: 'idle' }) },
  matchMedia: () => ({ matches: false }),
  addEventListener(type, fn) { if (!events.has(type)) events.set(type, []); events.get(type).push(fn); },
  dispatchEvent(){}, setTimeout(){ return 1; }, clearTimeout(){}, setInterval(){ return 1; }, clearInterval(){},
  speechSynthesis: { cancel(){}, speak(){}, getVoices(){ return []; } }
};
const localStorageMock = {
  getItem(key) { return local.has(String(key)) ? local.get(String(key)) : null; },
  setItem(key, value) { local.set(String(key), String(value)); },
  removeItem(key) { local.delete(String(key)); },
  clear() { local.clear(); }
};

const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.ok(scriptMatches.length >= 1, 'main inline script must exist');
let source = scriptMatches[0][1];
source = source.replace(/\ninit\(\);\s*$/, '\n// init() disabled in deterministic QA harness');
source += `\n;globalThis.__EnglishUzQA = {\n` +
  `GRAMMAR_TOPICS, ALL_VOCABULARY_ENTRIES, ARTICLES_SOURCE, TEST_PACKS, PAGE_META, paths,\n` +
  `globalSearchIndex, testAnswerCorrect, buildAttemptBreakdown, smartCreateDailyPlan,\n` +
  `smartGetCurrentPlan, renderDashboard, getTestHistory,\n` +
  `setGoal: (value) => { smartSelectedGoal = value; }\n};\n`;
const context = {
  console, document: documentMock, window: windowMock, localStorage: localStorageMock,
  Date, Intl, JSON, Math, Map, Set, Array, Object, String, Number, Boolean, RegExp, Promise,
  TextEncoder, CustomEvent: function(type, init = {}) { this.type = type; this.detail = init.detail; },
  SpeechSynthesisUtterance: function(text) { this.text = text; },
  confirm: () => true, alert(){}, navigator: {},
  setTimeout(){ return 1; }, clearTimeout(){}, setInterval(){ return 1; }, clearInterval(){},
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { timeout: 15000, filename: 'englishuz-inline-qa.js' });
const app = context.__EnglishUzQA;

check('9 ta asosiy bo‘lim metama’lumoti', () => {
  assert.equal(Object.keys(app.PAGE_META).length, 9);
  for (const key of ['dashboard','grammar','vocabulary','articles','tests','results','activity','smart','profile']) assert.ok(app.PAGE_META[key]);
});
check('41 ta Grammar darsi', () => {
  assert.equal(app.GRAMMAR_TOPICS.length, 41);
  const levels = new Set(app.GRAMMAR_TOPICS.map(x => x.level));
  for (const level of ['A1','A2','B1','B2','C1']) assert.ok(levels.has(level));
  for (const topic of app.GRAMMAR_TOPICS) {
    assert.ok(topic.id && topic.title && topic.goal);
    assert.ok(Array.isArray(topic.examples) && topic.examples.length >= 1);
    assert.ok(Array.isArray(topic.formulas) && topic.formulas.length >= 1);
    assert.ok(Array.isArray(topic.mistakes) && topic.mistakes.length >= 1);
  }
});
check('600 ta lug‘at yozuvi va 527 ta noyob inglizcha birlik', () => {
  assert.equal(app.ALL_VOCABULARY_ENTRIES.length, 600);
  assert.equal(new Set(app.ALL_VOCABULARY_ENTRIES.map(x => x.en.toLocaleLowerCase('en'))).size, 527);
  assert.ok(app.ALL_VOCABULARY_ENTRIES.every(x => x.en && x.uz && x.articleId));
});
check('100 ta to‘liq maqola, 10 ta PART, har maqolada 6 ta lug‘at', () => {
  assert.equal(app.ARTICLES_SOURCE.articles.length, 100);
  assert.equal(app.ARTICLES_SOURCE.parts.length, 10);
  assert.equal(articlesJson.articles.length, 100);
  assert.equal(articlesJson.parts.length, 10);
  for (const article of app.ARTICLES_SOURCE.articles) {
    assert.ok(article.title && article.paragraphs.length >= 3);
    assert.equal(article.words.length, 6, `article ${article.id} must have 6 vocabulary items`);
    assert.ok(article.paragraphs.every(p => typeof p === 'string' && p.length > 50));
  }
});
check('16 ta test to‘plami va 405 savol', () => {
  assert.equal(app.TEST_PACKS.length, 16);
  const total = app.TEST_PACKS.reduce((sum, pack) => sum + pack.questions.length, 0);
  assert.equal(total, 405);
  const ids = app.TEST_PACKS.map(x => x.id);
  assert.equal(new Set(ids).size, ids.length, 'test pack IDs must be unique');
  for (const pack of app.TEST_PACKS) {
    assert.ok(pack.title && pack.category && pack.questions.length >= 25);
    for (const q of pack.questions) {
      assert.ok(q.type && (q.question || q.prompt) && q.answer !== undefined, `question missing required fields in ${pack.id}`);
      assert.equal(app.testAnswerCorrect(q, q.answer), true, `answer key invalid: ${pack.id}`);
    }
  }
});
check('Test breakdown barcha savollarni ko‘nikma va daraja bo‘yicha qamrab oladi', () => {
  const pack = app.TEST_PACKS[0];
  const answers = Object.fromEntries(pack.questions.map((q, i) => [i, q.answer]));
  const breakdown = app.buildAttemptBreakdown(pack, answers);
  const skillTotal = Object.values(breakdown.skillBreakdown).reduce((n, v) => n + v.total, 0);
  const levelTotal = Object.values(breakdown.levelBreakdown).reduce((n, v) => n + v.total, 0);
  assert.equal(skillTotal, pack.questions.length);
  assert.equal(levelTotal, pack.questions.length);
});
check('Global qidiruv Grammar, Article, Vocabulary va Tests ichidan natija beradi', () => {
  assert.ok(app.globalSearchIndex('Present Simple').some(x => x.kind === 'grammar'));
  assert.ok(app.globalSearchIndex('The Silk Road').some(x => x.kind === 'article'));
  assert.ok(app.globalSearchIndex('merchant').some(x => x.kind === 'vocabulary'));
  assert.ok(app.globalSearchIndex('Vocabulary 01').some(x => x.kind === 'test'));
  assert.equal(app.globalSearchIndex('x').length, 0);
});
check('Smart Learning rejalari kunlik maqsad daqiqalariga mos', () => {
  for (const goal of [15,30,45,60,90,120]) {
    app.setGoal(goal);
    const plan = app.smartCreateDailyPlan(false);
    const sum = plan.tasks.reduce((n, task) => n + task.minutes, 0);
    assert.equal(sum, goal, `plan minutes do not match ${goal}`);
    assert.equal(plan.tasks.length, 4);
  }
});
check('Dashboard haqiqiy kontent sonlarini ishlatadi, ism yoki soxta statistika qotirilmagan', () => {
  app.renderDashboard();
  const output = documentMock.querySelector('#page-content').innerHTML;
  assert.ok(output.includes('41 ta dars'));
  assert.ok(output.includes('600 ta lug‘at yozuvi'));
  assert.ok(output.includes('100 ta reading matni'));
  assert.ok(output.includes('405 ta savol'));
  assert.ok(output.includes('O‘quvchi'));
  assert.ok(!output.includes('Javohirbek'));
  assert.ok(!output.includes('Platforma tayyor bo‘lgach'));
});
check('Firebase config to‘g‘ri placeholder holatida va Firestore Rules mavjud', () => {
  const config = fs.readFileSync(path.join(root,'assets/js/firebase-config.js'),'utf8');
  assert.ok(config.includes('apiKey: ""'));
  assert.ok(config.includes('projectId: ""'));
  const rules = fs.readFileSync(path.join(root,'firestore.rules'),'utf8');
  assert.ok(rules.includes('request.auth.uid == userId'));
  assert.ok(rules.includes("documentId == 'learningState'"));
});
check('GitHub Pages workflow to‘g‘ri ruxsat va deployment actionlarini belgilaydi', () => {
  const workflow = fs.readFileSync(path.join(root,'.github/workflows/deploy.yml'),'utf8');
  for (const required of ['actions/checkout@v6','actions/configure-pages@v5','actions/upload-pages-artifact@v4','actions/deploy-pages@v4','pages: write','id-token: write']) assert.ok(workflow.includes(required), `workflow missing ${required}`);
});
check('Asosiy HTML ichki IDlari takrorlanmagan', () => {
  const staticMarkup = html.split('<script>')[0];
  const ids = [...staticMarkup.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], []);
});

check('Barcha ishlatilgan SVG ikonkalarning yo‘li mavjud', () => {
  const iconBlock = source.match(/const paths = \{([\s\S]*?)\n\};/);
  assert.ok(iconBlock, 'SVG icon map missing');
  const keys = new Set([...iconBlock[1].matchAll(/(?:^|\n)\s*(?:'([^']+)'|\"([^\"]+)\"|([A-Za-z_$][\w$]*))\s*:/g)].map(m => m[1] || m[2] || m[3]));
  const references = new Set([...source.matchAll(/icon\(['\"]([^'\"]+)/g)].map(m => m[1]));
  for (const key of references) assert.ok(keys.has(key), `missing SVG icon path: ${key}`);
});
check('Standalone HTML Firebase modulisiz va to‘g‘ri demo adapter bilan', () => {
  const standalone = fs.readFileSync(path.join(root,'EnglishUz-Standalone.html'),'utf8');
  assert.ok(standalone.includes('Local standalone mode'));
  assert.ok(!standalone.includes('src="assets/js/auth.js"'));
  assert.ok(!standalone.includes('src="assets/js/firebase-config.js"'));
  assert.ok(standalone.includes("status: 'unconfigured'"));
  const inline = [...standalone.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(inline.length >= 2);
  const { spawnSync } = require('node:child_process');
  for (let i=0;i<inline.length;i++) {
    const temp = path.join(root,'tests',`.standalone-${i}.js`);
    fs.writeFileSync(temp,inline[i][1]);
    const result = spawnSync(process.execPath,['--check',temp],{encoding:'utf8'});
    fs.unlinkSync(temp);
    assert.equal(result.status,0,result.stderr||result.stdout);
  }
});
check('Ishlatilgan lokal resurslar repository ichida mavjud', () => {
  for (const resource of ['assets/favicon.svg','assets/js/firebase-config.js','assets/js/auth.js','firestore.rules','.github/workflows/deploy.yml','README.md','SECURITY.md','EnglishUz-Standalone.html']) {
    assert.ok(fs.existsSync(path.join(root,resource)), `missing resource: ${resource}`);
  }
  assert.ok(html.includes('assets/favicon.svg'));
  assert.ok(html.includes('assets/js/firebase-config.js'));
  assert.ok(html.includes('assets/js/auth.js'));
});
check('Eski foydalanilmaydigan scaffold fayllar olib tashlangan', () => {
  for (const obsolete of ['assets/js/app.js','assets/js/grammar-data.js','assets/js/vocabulary-data.js','assets/js/icons.js','assets/css/styles.css']) {
    assert.ok(!fs.existsSync(path.join(root,obsolete)), `obsolete file still present: ${obsolete}`);
  }
});

check('Runtime script va Firebase Auth module sintaksisi tekshiriladi', () => {
  const jsPath = path.join(root,'tests','.inline-check.js');
  let mainScript = scriptMatches[0][1].replace(/\ninit\(\);\s*$/, '\n');
  fs.writeFileSync(jsPath, mainScript);
  const { spawnSync } = require('node:child_process');
  const main = spawnSync(process.execPath, ['--check', jsPath], { encoding:'utf8' });
  fs.unlinkSync(jsPath);
  assert.equal(main.status, 0, main.stderr || main.stdout);
  const auth = spawnSync(process.execPath, ['--check', path.join(root,'assets/js/auth.js')], { encoding:'utf8' });
  assert.equal(auth.status, 0, auth.stderr || auth.stdout);
});

console.log(`EnglishUz QA: ${report.length}/${report.length} tekshiruv muvaffaqiyatli.`);
report.forEach((name, i) => console.log(`${String(i+1).padStart(2,'0')}. PASS — ${name}`));

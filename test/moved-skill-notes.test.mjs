import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Content-production skills moved to the wjgoarxiv-skills repository. Its Grok Build edition of each is one folder,
// `variants/litgrok/<id>/`, which is a one-skill plugin, so a user installs only that skill. LitGrok keeps a
// same-name SKILL.md for each, so `/<id>`, the project rule's bare `lit` routes, agent preloads and the status row
// still answer. Each note says three things: the skill moved, where it lives now, and Grok Build's one-line install.
// The install goes through the plugin store because LitGrok's installer owns `.grok/skills/<id>/`, where the note is.
// It names the folder path itself: given `<repo>#variants/litgrok/<id>`, Grok Build 1.0.13 copies the whole repository
// (over 200 MB, .git included) into its plugin store for every skill, while a folder path copies that folder alone.
const MOVED = {
  'frontend-ui-ux': true,
  'visual-qa': true,
  'lit-typographic-motion': true,
  'readme-studio': true,
  'lit-diagram-drawer': true,
  'lit-schematic': true,
  'lit-scientific-visualization': true,
  'lit-docx': true,
  'lit-pptx': true,
};

const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILLS = join(PRODUCT_ROOT, '.grok', 'skills');
const PLACEHOLDER = '<path to your wjgoarxiv-skills clone>';
const note = (id) => readFileSync(join(SKILLS, id, 'SKILL.md'), 'utf8');
const tracked = (prefix) => spawnSync('git', ['-C', PRODUCT_ROOT, 'ls-files', '--cached', '--others', '--exclude-standard', prefix], { encoding: 'utf8' })
  .stdout.split('\n').filter(Boolean);
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));

test('each moved skill is a same-name note, SKILL.md alone', () => {
  for (const id of Object.keys(MOVED)) {
    assert.deepEqual(tracked(`.grok/skills/${id}`), [`.grok/skills/${id}/SKILL.md`], `${id} keeps no body file`);
    const bytes = statSync(join(SKILLS, id, 'SKILL.md')).size;
    assert.ok(bytes < 6000, `${id} note is ${bytes} bytes`);
  }
});

test('each note says it moved, where it lives now, and the one-line Grok Build install of that one skill', () => {
  for (const id of Object.keys(MOVED)) {
    const text = note(id);
    assert.match(text, new RegExp(`^---\\nname: ${id}\\n`, 'u'), `${id} keeps its name`);
    assert.match(text, /\ndescription: "Moved: /u, `${id} description starts with Moved:`);
    assert.match(text.split('\n---\n')[0], /is now a LitFamily extension/u, `${id} description calls it a LitFamily extension`);
    assert.match(text, /\n[a-z-]+ moved out of LitGrok and is now a LitFamily extension\./u, `${id} note opens with the LitFamily extension framing`);
    assert.match(text, /that it is now a LitFamily extension/u, `${id} tells the user it is a LitFamily extension`);
    assert.match(text, /\nuser-invocable: true\n/u);
    assert.ok(text.includes('wjgoarxiv-skills'), `${id} names the repository`);
    assert.ok(text.includes(`wjgoarxiv-skills/variants/litgrok/${id}/`), `${id} names its folder in the repository`);
    assert.ok(text.includes(`grok plugin install "${PLACEHOLDER}/variants/litgrok/${id}" --trust`), `${id} carries the one-folder install line`);
    assert.doesNotMatch(text, /#variants\//u, `${id} never offers the #subdir form, which copies the whole repository`);
    assert.match(text, /whole repository/u, `${id} says why the line names the folder path`);
    assert.ok(text.includes('git clone https://github.com/wjgoarxiv/wjgoarxiv-skills\n'), `${id} gives the clone line of the public repository`);
    assert.doesNotMatch(text, /not published|once the repository is published/u, `${id} no longer calls the repository unpublished`);
    assert.ok(text.includes(`\`${id}:${id}\``), `${id} names the qualified plugin skill`);
    assert.ok(text.includes(`grok plugin uninstall ${id}`), `${id} says how to remove the plugin`);
    assert.match(text, /installer owns `\.grok\/skills\//u, `${id} says why the install avoids the note's folder`);
    assert.doesNotMatch(text, /#plugins\/|plugins\/[a-z-]+\/skills\//u, `${id} names no family plugin`);
    assert.doesNotMatch(text, /first written for another/u, `${id} no longer warns about another harness's text`);
  }
});

test('no note carries a leftover procedure from the body it replaced', () => {
  for (const id of Object.keys(MOVED)) {
    const text = note(id);
    for (const leftover of [/references\//u, /Load `?references/u, /node \.grok\/skills\//u, /FRONTEND_SKILL_ROOT/u, /SKILL_ROOT/u, /\.\.\/[a-z-]+\/SKILL\.md/u]) {
      assert.doesNotMatch(text, leftover, `${id}: ${leftover}`);
    }
  }
});

test('the pack ships each moved skill as its note alone', () => {
  const lock = JSON.parse(readFileSync(join(PRODUCT_ROOT, 'skills.lock.json'), 'utf8'));
  for (const id of Object.keys(MOVED)) {
    assert.deepEqual(lock.pack.filter((path) => path.startsWith(`.grok/skills/${id}/`)), [`.grok/skills/${id}/SKILL.md`], id);
    assert.equal(lock.skills[id].files, 1, id);
  }
});

test('every route still reaches the note: plugin manifest, rule, agents and the lock', () => {
  const manifest = JSON.parse(readFileSync(join(PRODUCT_ROOT, '.grok-plugin', 'plugin.json'), 'utf8'));
  const rule = readFileSync(join(PRODUCT_ROOT, '.grok', 'rules', '00-litgrok.md'), 'utf8');
  const lock = JSON.parse(readFileSync(join(PRODUCT_ROOT, 'skills.lock.json'), 'utf8'));
  for (const id of Object.keys(MOVED)) {
    assert.ok(manifest.skills.includes(`./.grok/skills/${id}`), `${id} stays in the plugin manifest`);
    assert.ok(Object.hasOwn(lock.budgets, id), `${id} keeps its lock budget`);
  }
  if (MOVED['frontend-ui-ux']) assert.match(rule, /`\/frontend-ui-ux`/u, 'the rule still routes interfaces to frontend-ui-ux');
  if (MOVED['visual-qa']) {
    for (const agent of ['litgrok-verifier.md', 'litgrok-quality-reviewer.md']) {
      assert.match(readFileSync(join(PRODUCT_ROOT, '.grok', 'agents', agent), 'utf8'), /^\s*- visual-qa$/mu, `${agent} still preloads visual-qa`);
    }
    assert.match(note('visual-qa'), /no visual verdict/u, 'a reviewer without visual-qa records the gap');
  }
  if (MOVED['frontend-ui-ux']) assert.match(note('frontend-ui-ux'), /Never report the missing probe as passed/u);
});

test('no core surface still runs a moved skill\'s body', () => {
  const moved = Object.keys(MOVED);
  const surfaces = [
    '.grok/rules/00-litgrok.md', 'AGENTS.md', 'CONTRIBUTING.md', '.github/workflows/ci.yml', '.github/workflows/publish.yml',
    ...walk(join(PRODUCT_ROOT, '.grok', 'skills')).map((file) => relative(PRODUCT_ROOT, file)).filter((file) => !moved.some((id) => file.startsWith(`.grok/skills/${id}/`))),
    ...walk(join(PRODUCT_ROOT, '.grok', 'agents')).map((file) => relative(PRODUCT_ROOT, file)),
  ];
  for (const file of surfaces) {
    const bytes = readFileSync(join(PRODUCT_ROOT, file));
    if (bytes.includes(0)) continue;
    const text = bytes.toString('utf8');
    for (const id of moved) {
      assert.doesNotMatch(text, new RegExp(`\\.grok/skills/${id}/(?:scripts|references|kit|assets|templates|engine)/`, 'u'), `${file} still reaches into ${id}`);
      assert.doesNotMatch(text, new RegExp(`\\.\\./${id}/(?!SKILL\\.md)`, 'u'), `${file} still reaches into ${id}`);
    }
  }
});

test('no shipped file or doc names a private machine path', () => {
  const privatePath = [/~\/Desktop/u, /27_LITFAMILY/u, /\.worktrees\/(?!<)/u, /\/Users\/[a-z]/u];
  const offenders = [];
  for (const file of [...walk(join(PRODUCT_ROOT, '.grok')), ...walk(join(PRODUCT_ROOT, 'docs'))]) {
    const bytes = readFileSync(file);
    if (bytes.includes(0)) continue;
    const text = bytes.toString('utf8');
    for (const pattern of privatePath) if (pattern.test(text)) offenders.push(`${relative(PRODUCT_ROOT, file)} ${pattern}`);
  }
  assert.deepEqual(offenders, []);
});

test('no doc or skill offers the #variants subdir install, which copies the whole repository per skill', () => {
  const files = ['README.md', 'README_ko-KR.md', 'CHANGELOG.md', 'AGENTS.md', ...walk(join(PRODUCT_ROOT, 'docs')).map((file) => relative(PRODUCT_ROOT, file)), ...walk(join(PRODUCT_ROOT, '.grok')).map((file) => relative(PRODUCT_ROOT, file))];
  const offenders = [];
  for (const file of files) {
    const bytes = readFileSync(join(PRODUCT_ROOT, file));
    if (bytes.includes(0)) continue;
    if (/(?:clone>|wjgoarxiv-skills)#variants\//u.test(bytes.toString('utf8'))) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

// Safe install lines, checked on Grok Build 1.0.13 in a throwaway HOME: a second `grok plugin install` of the same
// folder stops with `already installed` and changes nothing; `grok plugin update <id>` reports a local install as
// "already live" without copying the folder again; installing the same id from a second clone adds a second plugin
// of that name. A same-name skill in any skills folder Grok reads takes the bare `/<id>` name (the plugin stays as
// `<id>:<id>`). So each note checks before it installs, updates by uninstall plus install, and moves a personal copy
// whole into a dated folder under ~/.grok/extension-backups, which Grok does not scan.
const SKILL_DIRS = '{.grok,.agents,.claude,.cursor,~/.grok,~/.agents,~/.claude,~/.cursor}';
const countLine = (id) => `grok plugin list --json | grep -cF '"name": "${id}"'`;
const personalLine = (id) => `grep -L '^description: "Moved: ${id} ' ${SKILL_DIRS}/skills/${id}/SKILL.md 2>/dev/null`;
const moveAsideLine = 'mkdir -p ~/.grok/extension-backups && mv "<that folder>" "$(mktemp -d ~/.grok/extension-backups/$(date +%Y%m%d-%H%M%S)-XXXXXX)/"';
const updateLine = `git -C "${PLACEHOLDER}" pull`;

test('each note checks before it installs, and gives the update, move-aside and remove lines Grok Build supports', () => {
  for (const id of Object.keys(MOVED)) {
    const text = note(id);
    const install = text.slice(text.indexOf('\n## Install\n'), text.indexOf('\n## Hard stops\n'));
    const block = install.slice(install.indexOf('```bash\n'), install.indexOf('\n```', install.indexOf('```bash\n') + 7));
    const lines = block.split('\n').slice(1);
    assert.deepEqual(lines, [
      'git clone https://github.com/wjgoarxiv/wjgoarxiv-skills',
      countLine(id),
      personalLine(id),
      `grok plugin install "${PLACEHOLDER}/variants/litgrok/${id}" --trust`,
    ], `${id} gives clone, check, check, install in that order`);
    assert.match(install, /already installed/u, `${id} says a second install stops`);
    assert.match(install, /`grok plugin update` does not copy a local folder again/u, `${id} says update does not re-copy`);
    assert.ok(install.includes(updateLine), `${id} pulls the clone before updating`);
    assert.ok(install.includes(`\`grok plugin uninstall ${id}\` once for each counted copy`), `${id} clears every installed copy before reinstalling`);
    assert.ok(install.includes(`\`/${id}\``), `${id} says which name a personal copy takes`);
    assert.ok(install.includes(moveAsideLine), `${id} moves a personal copy aside whole`);
    assert.doesNotMatch(install, /\brm -r|\brm -f|\brm -rf/u, `${id} deletes nothing`);
    assert.match(text, new RegExp(`\\ndescription: "Moved: ${id} `, 'u'), `${id}'s own description is what the check skips`);
    assert.ok(statSync(join(SKILLS, id, 'SKILL.md')).size < 6000, `${id} note stays short`);
  }
});

// `litgrok extensions` runs the same steps in code; the hand lines stay as the manual route.
test('each note names the litgrok extensions verbs before the manual lines', () => {
  for (const id of Object.keys(MOVED)) {
    const install = note(id).slice(note(id).indexOf('\n## Install\n'), note(id).indexOf('\n## Hard stops\n'));
    const verb = install.indexOf(`\`litgrok extensions install ${id}\``);
    assert.ok(verb !== -1, `${id} names its install verb`);
    assert.ok(verb < install.indexOf('```bash'), `${id} names the verb before the manual lines`);
    assert.match(install, /changes nothing until you add `--yes`/u, `${id} says the verb previews first`);
    assert.ok(install.includes('`litgrok extensions update`') && install.includes(`\`remove ${id}\``), `${id} names update and remove`);
  }
});

test('the check and move-aside lines do what the note says in bash and zsh', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-safe-install-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const shells = ['bash', 'zsh'].filter((shell) => spawnSync(shell, ['-c', 'true']).status === 0);
  assert.ok(shells.includes('bash'), 'bash is available');
  for (const shell of shells) {
    for (const id of Object.keys(MOVED)) {
      const home = join(root, shell, id, 'home');
      const project = join(root, shell, id, 'project');
      const own = join(home, '.grok', 'skills', id);
      const personal = join(home, '.claude', 'skills', id);
      const projectCopy = join(project, '.agents', 'skills', id);
      for (const dir of [own, personal, projectCopy]) mkdirSync(dir, { recursive: true });
      writeFileSync(join(own, 'SKILL.md'), note(id));
      writeFileSync(join(personal, 'SKILL.md'), `---\nname: ${id}\ndescription: "my own copy"\n---\n`);
      writeFileSync(join(personal, 'mine.txt'), 'keep me\n');
      writeFileSync(join(projectCopy, 'SKILL.md'), `---\nname: ${id}\ndescription: "a project copy"\n---\n`);
      const sh = (line) => spawnSync(shell, shell === 'zsh' ? ['-f', '-c', line] : ['--norc', '--noprofile', '-c', line], { cwd: project, encoding: 'utf8', env: { HOME: home, PATH: process.env.PATH } });
      const found = sh(personalLine(id)).stdout.trim().split('\n').sort();
      assert.deepEqual(found, [join(home, '.claude', 'skills', id, 'SKILL.md'), `.agents/skills/${id}/SKILL.md`].sort(), `${shell} ${id}: the check names both personal copies and skips the note`);
      for (const folder of [personal, projectCopy]) {
        const moved = sh(moveAsideLine.replace('<that folder>', folder));
        assert.equal(moved.status, 0, `${shell} ${id}: ${moved.stderr}`);
        assert.equal(existsSync(folder), false, `${shell} ${id}: ${folder} left its skills folder`);
      }
      const backups = join(home, '.grok', 'extension-backups');
      const saved = readdirSync(backups).map((dated) => join(backups, dated, id));
      assert.equal(saved.length, 2, `${shell} ${id}: one dated folder per move`);
      for (const folder of saved) {
        assert.deepEqual(readdirSync(join(folder, '..')), [id], `${shell} ${id}: the folder moved whole, no nesting`);
        assert.ok(existsSync(join(folder, 'SKILL.md')));
      }
      assert.ok(saved.some((folder) => existsSync(join(folder, 'mine.txt')) && readFileSync(join(folder, 'mine.txt'), 'utf8') === 'keep me\n'), `${shell} ${id}: the user file survives`);
      assert.ok(saved.every((folder) => !folder.includes(`${join('skills', '')}`)), `${shell} ${id}: no backup sits under a skills folder`);
      assert.deepEqual(sh(personalLine(id)).stdout.trim(), '', `${shell} ${id}: the check is clean afterwards`);
    }
  }
});

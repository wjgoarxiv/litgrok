import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { restoreHistoricalFixture } from './fixtures/historical-installs/restore.mjs';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PRODUCT_ROOT = dirname(TEST_DIRECTORY);

function captureIo({ interactive = true } = {}) {
  let stdout = '';
  let stderr = '';

  return {
    stdin: { isTTY: interactive },
    stdout: {
      isTTY: interactive,
      write(chunk) {
        stdout += String(chunk);
        return true;
      },
    },
    stderr: {
      isTTY: interactive,
      write(chunk) {
        stderr += String(chunk);
        return true;
      },
    },
    read() {
      return { stdout, stderr };
    },
  };
}

function regularFilesBelow(root, relativeRoot = '') {
  const files = [];
  for (const entry of readdirSync(join(root, relativeRoot), { withFileTypes: true })) {
    const relativePath = join(relativeRoot, entry.name);
    if (entry.isDirectory()) files.push(...regularFilesBelow(root, relativePath));
    if (entry.isFile()) files.push(relativePath);
  }
  return files;
}

const PACKAGED_GROK_FILE_COUNT = regularFilesBelow(join(PRODUCT_ROOT, '.grok')).length;

function syntheticPackage() {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-tree-package-'));
  const executable = join(root, 'bin', 'litgrok.mjs');
  const hookCommand = join(root, '.grok', 'hooks', 'check.mjs');
  mkdirSync(dirname(executable), { recursive: true });
  copyFileSync(join(PRODUCT_ROOT, 'bin', 'status-line-config.mjs'), join(root, 'bin', 'status-line-config.mjs'));
  mkdirSync(join(root, '.grok', 'skills', 'litgrok', 'references'), { recursive: true });
  mkdirSync(join(root, '.grok', 'rules'), { recursive: true });
  mkdirSync(dirname(hookCommand), { recursive: true });
  copyFileSync(join(PRODUCT_ROOT, 'bin', 'litgrok.mjs'), executable);
  copyFileSync(join(PRODUCT_ROOT, '.grok', 'hooks', 'lit-mark.mjs'), join(root, '.grok', 'hooks', 'lit-mark.mjs'));
  writeFileSync(join(root, '.grok', 'skills', 'litgrok', 'SKILL.md'), 'skill\n');
  writeFileSync(join(root, '.grok', 'skills', 'litgrok', 'references', 'guide.md'), 'guide\n');
  writeFileSync(join(root, '.grok', 'rules', '00-litgrok.md'), 'rule\n');
  writeFileSync(join(root, '.grok', 'hooks', 'guard.json'), '{"hooks":{}}\n');
  writeFileSync(hookCommand, '#!/usr/bin/env node\n');
  chmodSync(hookCommand, 0o755);
  return { root, executable };
}

function historicalPackage() {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-historical-pre-manifest-'));
  try {
    restoreHistoricalFixture('pre-manifest', root);
    return { root, executable: join(root, 'bin', 'litgrok.mjs') };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

async function importSyntheticInstaller(executable) {
  return import(`${pathToFileURL(executable).href}?test=${Date.now()}-${Math.random()}`);
}

test('publishes executable litgrok-ai and litgrok installer aliases', () => {
  const packageJson = JSON.parse(readFileSync(join(PRODUCT_ROOT, 'package.json'), 'utf8'));

  assert.deepEqual(packageJson.bin, {
    'litgrok-ai': 'bin/litgrok.mjs',
    litgrok: 'bin/litgrok.mjs',
  });
  assert.equal(packageJson.version, '1.0.12');

  const executable = statSync(join(PRODUCT_ROOT, 'bin', 'litgrok.mjs'));
  assert.ok(executable.isFile(), 'bin/litgrok.mjs must be a regular file');
  assert.notEqual(executable.mode & 0o111, 0, 'bin/litgrok.mjs must be executable');
});

test('dry-run previews the project install without creating .grok state', async () => {
  const home = mkdtempSync(join(tmpdir(), 'litgrok-dry-run-'));

  try {
    const installer = await import('../bin/litgrok.mjs');
    assert.equal(typeof installer.run, 'function', 'installer must export run for verification');

    const io = captureIo();
    const exitCode = await installer.run(['install', '--dry-run'], {
      ...io,
      cwd: home,
      env: { ...process.env, HOME: home },
    });

    assert.equal(exitCode, 0);
    assert.equal(existsSync(join(home, '.grok')), false, 'dry-run must not create .grok');
    assert.match(io.read().stdout, /DRY RUN/);
    assert.match(io.read().stdout, new RegExp(join(home, '.grok', 'skills', 'litgrok', 'SKILL.md').replaceAll('\\', '\\\\')));
    assert.match(io.read().stdout, new RegExp(join(home, '.grok', 'rules', '00-litgrok.md').replaceAll('\\', '\\\\')));
    assert.equal(io.read().stderr, '');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('an older ownership manifest installs new diagram scripts and preserves a later user edit', async () => {
  const project = mkdtempSync(join(tmpdir(), 'litgrok-diagram-old-manifest-project-'));
  const home = mkdtempSync(join(tmpdir(), 'litgrok-diagram-old-manifest-home-'));
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;
  const manifestPath = join(project, '.grok', '.litgrok-install-manifest.json');
  const scriptPaths = [
    'skills/lit-diagram-drawer/scripts/drawio-extract.mjs',
    'skills/lit-diagram-drawer/scripts/mermaid-extract.mjs',
    'skills/lit-diagram-drawer/scripts/excalidraw-extract.mjs',
    'skills/lit-diagram-drawer/scripts/renderer-status.mjs',
  ];

  try {
    mkdirSync(join(project, '.grok'), { recursive: true });
    writeFileSync(manifestPath, `${JSON.stringify({
      schema: 'litgrok.install-manifest/v1', package: 'litgrok-ai', version: '1.0.6', files: {},
    }, null, 2)}\n`);
    const { run } = await import('../bin/litgrok.mjs');
    const installIo = captureIo();
    assert.equal(await run(['install', '--project', '--yes'], { ...installIo, cwd: project, env }), 0, installIo.read().stderr);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const relativePath of scriptPaths) {
      const source = join(PRODUCT_ROOT, '.grok', relativePath);
      const target = join(project, '.grok', relativePath);
      assert.equal(readFileSync(target).compare(readFileSync(source)), 0, relativePath + ' must be installed byte-identically');
      assert.equal(manifest.files[relativePath], createHash('sha256').update(readFileSync(source)).digest('hex'), relativePath + ' must receive an ownership hash');
    }

    const protectedPath = join(project, '.grok', scriptPaths[0]);
    writeFileSync(protectedPath, '// user-owned change\n');
    const conflictIo = captureIo();
    assert.equal(await run(['install', '--project', '--yes'], { ...conflictIo, cwd: project, env }), 1);
    assert.match(conflictIo.read().stderr, /Refusing to overwrite different existing file/);
    assert.equal(readFileSync(protectedPath, 'utf8'), '// user-owned change\n');
  } finally {
    rmSync(project, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test('--no-color is a non-mutating preview', async () => {
  const home = mkdtempSync(join(tmpdir(), 'litgrok-no-color-'));

  try {
    const { run } = await import('../bin/litgrok.mjs');
    const io = captureIo();
    const exitCode = await run(['install', '--no-color'], {
      ...io,
      cwd: home,
      env: { ...process.env, HOME: home },
    });

    assert.equal(exitCode, 0);
    assert.equal(existsSync(join(home, '.grok')), false, '--no-color must not create .grok');
    assert.match(io.read().stdout, /NO COLOR/);
    assert.doesNotMatch(io.read().stdout, /\u001b\[/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('non-interactive invocation does not mutate', async () => {
  const home = mkdtempSync(join(tmpdir(), 'litgrok-non-interactive-'));

  try {
    const { run } = await import('../bin/litgrok.mjs');
    const io = captureIo({ interactive: false });
    const exitCode = await run(['install'], {
      ...io,
      cwd: home,
      env: { ...process.env, HOME: home },
    });

    assert.equal(exitCode, 0);
    assert.equal(existsSync(join(home, '.grok')), false, 'non-interactive mode must not create .grok');
    assert.match(io.read().stdout, /NON-INTERACTIVE/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('--yes writes to a piped, non-TTY stdout', async () => {
  const home = mkdtempSync(join(tmpdir(), 'litgrok-yes-piped-'));
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;

  try {
    const { run } = await import('../bin/litgrok.mjs');
    const io = captureIo({ interactive: false });
    const exitCode = await run(['install', '--user', '--yes'], { ...io, cwd: home, env });

    assert.equal(exitCode, 0, io.read().stderr);
    assert.equal(existsSync(join(home, '.grok', 'skills', 'litgrok', 'SKILL.md')), true, '--yes must write despite a non-TTY stdout');
    assert.doesNotMatch(io.read().stdout, /NON-INTERACTIVE/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('--yes with CI set still stays a no-write preview', async () => {
  const home = mkdtempSync(join(tmpdir(), 'litgrok-yes-ci-'));
  const env = { ...process.env, HOME: home, CI: '1' };
  delete env.NO_COLOR;

  try {
    const { run } = await import('../bin/litgrok.mjs');
    const io = captureIo({ interactive: false });
    const exitCode = await run(['install', '--user', '--yes'], { ...io, cwd: home, env });

    assert.equal(exitCode, 0, io.read().stderr);
    assert.equal(existsSync(join(home, '.grok')), false, 'CI must not be bypassed by --yes');
    assert.match(io.read().stdout, /NON-INTERACTIVE/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('interactive --user installs into HOME and an identical reinstall does not rewrite', async () => {
  const home = mkdtempSync(join(tmpdir(), 'litgrok-live-home-'));
  const skillTarget = join(home, '.grok', 'skills', 'litgrok', 'SKILL.md');
  const ruleTarget = join(home, '.grok', 'rules', '00-litgrok.md');
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;

  try {
    const { run } = await import('../bin/litgrok.mjs');
    const firstIo = captureIo();
    const firstExitCode = await run(['install', '--user'], {
      ...firstIo,
      cwd: home,
      env,
    });

    assert.equal(firstExitCode, 0);
    assert.equal(readFileSync(skillTarget, 'utf8'), readFileSync(join(PRODUCT_ROOT, '.grok', 'skills', 'litgrok', 'SKILL.md'), 'utf8'));
    assert.equal(readFileSync(ruleTarget, 'utf8'), readFileSync(join(PRODUCT_ROOT, '.grok', 'rules', '00-litgrok.md'), 'utf8'));
    assert.match(firstIo.read().stdout, new RegExp(`Written vs already-current: ${PACKAGED_GROK_FILE_COUNT} written · 0 already-current`, 'i'));

    const oldTime = new Date('2000-01-01T00:00:00.000Z');
    utimesSync(skillTarget, oldTime, oldTime);
    const before = statSync(skillTarget).mtimeMs;

    const secondIo = captureIo();
    const secondExitCode = await run(['install', '--user'], {
      ...secondIo,
      cwd: home,
      env,
    });

    assert.equal(secondExitCode, 0);
    assert.equal(statSync(skillTarget).mtimeMs, before, 'identical reinstall must not rewrite the skill');
    assert.match(secondIo.read().stdout, /already current/i);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

const PRE_MANIFEST_UPGRADE_PATHS = [
  'skills/autoconference/references/_canonical-corpus/manifest.json',
  'skills/autoconference/scripts/init_conference.py',
  'skills/autoconference/scripts/verify-canonical-corpus.mjs',
  'skills/autoresearch/references/_canonical-corpus/manifest.json',
  'skills/autoresearch/scripts/init_research.py',
  'skills/autoresearch/scripts/verify-canonical-corpus.mjs',
  'skills/lit-scientific-visualization/SKILL.md',
  'skills/lit-scientific-visualization/scripts/verify-canonical-corpus.mjs',
  'vendor/scientific-visualization/references/_canonical-corpus/manifest.json',
];

const PRE_MANIFEST_LEGACY_PATHS = [
  'skills/lit-scientific-visualization/assets/color_palettes.py',
  'skills/lit-scientific-visualization/assets/nature.mplstyle',
  'skills/lit-scientific-visualization/assets/presentation.mplstyle',
  'skills/lit-scientific-visualization/assets/publication.mplstyle',
  'skills/lit-scientific-visualization/evals/evals.json',
  'skills/lit-scientific-visualization/references/_canonical-corpus/manifest.json',
  'skills/lit-scientific-visualization/references/color_palettes.md',
  'skills/lit-scientific-visualization/references/journal_requirements.md',
  'skills/lit-scientific-visualization/references/matplotlib_examples.md',
  'skills/lit-scientific-visualization/references/mdanalysis_martini_visualization.md',
  'skills/lit-scientific-visualization/references/publication_guidelines.md',
  'skills/lit-scientific-visualization/references/seaborn_for_publications.md',
  'skills/lit-scientific-visualization/scripts/figure_export.py',
  'skills/lit-scientific-visualization/scripts/style_presets.py',
  'skills/lit-scientific-visualization/tests/test_figure_export.py',
  'skills/lit-scientific-visualization/tests/test_style_presets.py',
  'skills/skill-observer/SKILL.md',
  'skills/skill-observer/references/review-contract.md',
  'skills/skill-observer/scripts/curator.mjs',
  'skills/skill-observer/scripts/review.mjs',
  'skills/skill-observer/scripts/skill-loop.mjs',
  'skills/skill-observer/scripts/validate-skills.mjs',
];

test('upgrades a pristine pre-manifest 0.2.5 install and records current ownership', async () => {
  const historical = historicalPackage();
  const home = mkdtempSync(join(tmpdir(), 'litgrok-pre-manifest-upgrade-'));
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;

  try {
    const oldInstaller = await importSyntheticInstaller(historical.executable);
    const oldIo = captureIo();
    assert.equal(await oldInstaller.run(['install', '--user'], { ...oldIo, cwd: home, env }), 0, oldIo.read().stderr);

    const manifestTarget = join(home, '.grok', '.litgrok-install-manifest.json');
    assert.equal(existsSync(manifestTarget), false, 'the historical installer must leave no ownership manifest');

    const currentInstaller = await import('../bin/litgrok.mjs');
    const upgradeIo = captureIo();
    assert.equal(await currentInstaller.run(['install', '--user'], { ...upgradeIo, cwd: home, env }), 0, upgradeIo.read().stderr);
    assert.match(upgradeIo.read().stdout, /owned/u);

    for (const relativePath of PRE_MANIFEST_UPGRADE_PATHS) {
      assert.deepEqual(
        readFileSync(join(home, '.grok', relativePath)),
        readFileSync(join(PRODUCT_ROOT, '.grok', relativePath)),
        `upgrade must replace the legacy ${relativePath}`,
      );
    }
    for (const relativePath of PRE_MANIFEST_LEGACY_PATHS) {
      assert.equal(existsSync(join(home, '.grok', relativePath)), false, `upgrade must remove the legacy ${relativePath}`);
    }

    const manifest = JSON.parse(readFileSync(manifestTarget, 'utf8'));
    assert.equal(manifest.schema, 'litgrok.install-manifest/v1');
    assert.equal(Object.keys(manifest.files).length, PACKAGED_GROK_FILE_COUNT);

    const uninstallIo = captureIo();
    assert.equal(await currentInstaller.run(['uninstall', '--user'], { ...uninstallIo, cwd: home, env }), 0, uninstallIo.read().stderr);
    assert.equal(existsSync(manifestTarget), false, 'uninstall must remove the ownership manifest after payload removal');
    for (const relativePath of PRE_MANIFEST_UPGRADE_PATHS) {
      assert.equal(existsSync(join(home, '.grok', relativePath)), false, `uninstall must remove ${relativePath}`);
    }
    for (const relativePath of PRE_MANIFEST_LEGACY_PATHS) {
      assert.equal(existsSync(join(home, '.grok', relativePath)), false, `uninstall must remove ${relativePath}`);
    }
  } finally {
    rmSync(historical.root, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test('upgrades the published observer payload and removes only its empty retired directories', async () => {
  const previous = mkdtempSync(join(tmpdir(), 'litgrok-published-102-payload-'));
  const project = mkdtempSync(join(tmpdir(), 'litgrok-published-102-project-'));
  const home = mkdtempSync(join(tmpdir(), 'litgrok-published-102-home-'));
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;
  const observerPaths = PRE_MANIFEST_LEGACY_PATHS.filter((path) => path.startsWith('skills/skill-observer/'));
  const skillRoot = join(project, '.grok', 'skills', 'skill-observer');
  const manifestTarget = join(project, '.grok', '.litgrok-install-manifest.json');
  const sentinelPath = join(project, '.grok', 'skills', 'user-owned', 'SKILL.md');

  try {
    restoreHistoricalFixture('before-renames', previous, { payloadOnly: true });
    const previousFiles = {};
    for (const relativePath of observerPaths) {
      const source = join(previous, '.grok', relativePath);
      const target = join(project, '.grok', relativePath);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
      previousFiles[relativePath] = createHash('sha256').update(readFileSync(source)).digest('hex');
    }
    writeFileSync(manifestTarget, `${JSON.stringify({
      schema: 'litgrok.install-manifest/v1',
      package: 'litgrok-ai',
      version: ['1.0', '2'].join('.'),
      files: previousFiles,
    }, null, 2)}\n`);
    mkdirSync(dirname(sentinelPath), { recursive: true });
    writeFileSync(sentinelPath, '# User-owned skill\n');

    const { run } = await import('../bin/litgrok.mjs');
    const upgradeIo = captureIo();
    assert.equal(await run(['install', '--project', '--yes'], { ...upgradeIo, cwd: project, env }), 0, upgradeIo.read().stderr);
    assert.match(upgradeIo.read().stdout, /6 legacy removed/u);
    assert.equal(existsSync(skillRoot), false, 'the fully removed retired skill root must be removed');
    assert.equal(existsSync(join(project, '.grok', 'skills', 'skill-observer', 'references')), false);
    assert.equal(existsSync(join(project, '.grok', 'skills', 'skill-observer', 'scripts')), false);
    assert.deepEqual(readFileSync(sentinelPath), Buffer.from('# User-owned skill\n'));
    const marketSkills = JSON.parse(readFileSync(join(PRODUCT_ROOT, '.grok-plugin', 'plugin.json'), 'utf8')).skills;
    const installedSkills = readdirSync(join(project, '.grok', 'skills'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== 'user-owned')
      .map((entry) => `./.grok/skills/${entry.name}`)
      .sort();
    assert.equal(marketSkills.length, readdirSync(join(PRODUCT_ROOT, '.grok', 'skills'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).length);
    assert.deepEqual(installedSkills, [...marketSkills].sort());

    const secondIo = captureIo();
    assert.equal(await run(['install', '--project', '--yes'], { ...secondIo, cwd: project, env }), 0, secondIo.read().stderr);
    assert.match(secondIo.read().stdout, /Already current/u);
    assert.equal(existsSync(skillRoot), false, 'a repeat upgrade stays clean and must not recreate retired directories');
    assert.deepEqual(readFileSync(sentinelPath), Buffer.from('# User-owned skill\n'));
  } finally {
    rmSync(previous, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test('refuses retired-directory cleanup when a user-owned file remains inside the skill root', async () => {
  const previous = mkdtempSync(join(tmpdir(), 'litgrok-retired-skill-conflict-payload-'));
  const project = mkdtempSync(join(tmpdir(), 'litgrok-retired-skill-conflict-project-'));
  const home = mkdtempSync(join(tmpdir(), 'litgrok-retired-skill-conflict-home-'));
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;
  const observerPaths = PRE_MANIFEST_LEGACY_PATHS.filter((path) => path.startsWith('skills/skill-observer/'));
  const skillRoot = join(project, '.grok', 'skills', 'skill-observer');
  const manifestTarget = join(project, '.grok', '.litgrok-install-manifest.json');
  const userFiles = new Map([
    [join(skillRoot, 'NOTES.md'), Buffer.from('keep these notes\n')],
    [join(skillRoot, 'scripts', 'my-helper.mjs'), Buffer.from('// user-owned\n')],
  ]);

  try {
    restoreHistoricalFixture('before-renames', previous, { payloadOnly: true });
    const previousFiles = {};
    for (const relativePath of observerPaths) {
      const source = join(previous, '.grok', relativePath);
      const target = join(project, '.grok', relativePath);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
      previousFiles[relativePath] = createHash('sha256').update(readFileSync(source)).digest('hex');
    }
    writeFileSync(manifestTarget, `${JSON.stringify({
      schema: 'litgrok.install-manifest/v1',
      package: 'litgrok-ai',
      version: ['1.0', '2'].join('.'),
      files: previousFiles,
    }, null, 2)}\n`);
    for (const [path, bytes] of userFiles) writeFileSync(path, bytes);
    const previousManifest = readFileSync(manifestTarget);
    const previousPayload = new Map(observerPaths.map((path) => [path, readFileSync(join(project, '.grok', path))]));

    const { run } = await import('../bin/litgrok.mjs');
    const io = captureIo();
    assert.equal(await run(['install', '--project', '--yes'], { ...io, cwd: project, env }), 1);
    for (const [path, bytes] of userFiles) {
      assert.ok(io.read().stderr.includes(path), `the refusal must name ${path}`);
      assert.deepEqual(readFileSync(path), bytes, `the user-owned file ${path} must remain byte-identical`);
    }
    assert.match(io.read().stderr, /not package-owned/iu);
    assert.match(io.read().stderr, /is not package-owned\. Move it out of the retired skill directory or remove it yourself, then rerun the install so the directory can be cleaned/iu);
    assert.doesNotMatch(io.read().stdout, /project hooks require trust from a Git project root|hooks-trust|Installer never runs git init/iu);
    for (const [relativePath, bytes] of previousPayload) {
      assert.deepEqual(readFileSync(join(project, '.grok', relativePath)), bytes, `the blocked upgrade must preserve ${relativePath}`);
    }
    assert.deepEqual(readFileSync(manifestTarget), previousManifest, 'a blocked upgrade must preserve its existing ownership receipt');
    assert.equal(existsSync(join(project, '.grok', 'skills', 'litgrok', 'SKILL.md')), false, 'the ownership conflict must block partial writes');
    assert.equal(existsSync(skillRoot), true, 'a non-empty retired skill root must remain');
  } finally {
    rmSync(previous, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test('pre-manifest upgrade refuses a user-modified legacy payload file', async () => {
  const historical = historicalPackage();
  const home = mkdtempSync(join(tmpdir(), 'litgrok-pre-manifest-modified-'));
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;
  const relativePath = PRE_MANIFEST_UPGRADE_PATHS[0];
  const target = join(home, '.grok', relativePath);

  try {
    const oldInstaller = await importSyntheticInstaller(historical.executable);
    assert.equal(await oldInstaller.run(['install', '--user'], { ...captureIo(), cwd: home, env }), 0);
    const modified = Buffer.concat([readFileSync(target), Buffer.from('\nuser edit\n')]);
    writeFileSync(target, modified);

    const currentInstaller = await import('../bin/litgrok.mjs');
    const io = captureIo();
    assert.equal(await currentInstaller.run(['install', '--user'], { ...io, cwd: home, env }), 1);
    assert.deepEqual(readFileSync(target), modified, 'the user-modified file must remain untouched');
    assert.equal(existsSync(join(home, '.grok', '.litgrok-install-manifest.json')), false);
    assert.match(io.read().stderr, /refus(?:e|ing).*manifest\.json/iu);
  } finally {
    rmSync(historical.root, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test('pre-manifest vendor migration refuses a user-modified moved corpus file', async () => {
  const historical = historicalPackage();
  const home = mkdtempSync(join(tmpdir(), 'litgrok-pre-manifest-vendor-modified-'));
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;
  const relativePath = PRE_MANIFEST_LEGACY_PATHS[0];
  const target = join(home, '.grok', relativePath);

  try {
    const oldInstaller = await importSyntheticInstaller(historical.executable);
    assert.equal(await oldInstaller.run(['install', '--user'], { ...captureIo(), cwd: home, env }), 0);
    const modified = Buffer.concat([readFileSync(target), Buffer.from('\nuser edit\n')]);
    writeFileSync(target, modified);

    const currentInstaller = await import('../bin/litgrok.mjs');
    const io = captureIo();
    assert.equal(await currentInstaller.run(['install', '--user'], { ...io, cwd: home, env }), 1);
    assert.deepEqual(readFileSync(target), modified, 'the user-modified moved corpus file must remain untouched');
    assert.equal(existsSync(join(home, '.grok', '.litgrok-install-manifest.json')), false);
    assert.match(io.read().stderr, /skills[\\/]lit-scientific-visualization[\\/]assets[\\/]color_palettes\.py/u);
  } finally {
    rmSync(historical.root, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test('malformed ownership manifest fails closed before payload writes', async () => {
  const home = mkdtempSync(join(tmpdir(), 'litgrok-malformed-manifest-'));
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;
  const manifestTarget = join(home, '.grok', '.litgrok-install-manifest.json');
  const skillTarget = join(home, '.grok', 'skills', 'litgrok', 'SKILL.md');

  try {
    mkdirSync(dirname(manifestTarget), { recursive: true });
    writeFileSync(manifestTarget, '{"schema":"not-litgrok"}\n');
    const { run } = await import('../bin/litgrok.mjs');
    const io = captureIo();
    assert.equal(await run(['install', '--user'], { ...io, cwd: home, env }), 1);
    assert.equal(existsSync(skillTarget), false, 'invalid ownership metadata must block payload writes');
    assert.match(io.read().stderr, /Refusing to use \.litgrok-install-manifest\.json/u);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('a foreign destination refuses the whole install before any file is written', async () => {
  const home = mkdtempSync(join(tmpdir(), 'litgrok-conflict-'));
  const skillTarget = join(home, '.grok', 'skills', 'litgrok', 'SKILL.md');
  const ruleTarget = join(home, '.grok', 'rules', '00-litgrok.md');
  const foreignRule = '# Personal rule\n';
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;

  try {
    mkdirSync(dirname(ruleTarget), { recursive: true });
    writeFileSync(ruleTarget, foreignRule);

    const { run } = await import('../bin/litgrok.mjs');
    const io = captureIo();
    const exitCode = await run(['install', '--user'], { ...io, cwd: home, env });

    assert.equal(exitCode, 1);
    assert.equal(existsSync(skillTarget), false, 'preflight conflict must prevent partial install');
    assert.equal(readFileSync(ruleTarget, 'utf8'), foreignRule, 'foreign rule must remain byte-identical');
    assert.match(io.read().stderr, /refus(?:e|ing).*00-litgrok\.md/i);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('default install writes only to the current project .grok directory', async () => {
  const home = mkdtempSync(join(tmpdir(), 'litgrok-project-home-'));
  const project = mkdtempSync(join(tmpdir(), 'litgrok-project-root-'));
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;

  try {
    const { run } = await import('../bin/litgrok.mjs');
    const io = captureIo();
    const exitCode = await run(['install'], { ...io, cwd: project, env });

    assert.equal(exitCode, 0);
    assert.equal(existsSync(join(project, '.grok', 'skills', 'litgrok', 'SKILL.md')), true);
    assert.equal(existsSync(join(project, '.grok', 'rules', '00-litgrok.md')), true);
    assert.equal(existsSync(join(home, '.grok')), false, 'default project install must not write user-level state');
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

test('the executable runs the install command through its real CLI entrypoint', () => {
  const home = mkdtempSync(join(tmpdir(), 'litgrok-cli-home-'));

  try {
    const result = spawnSync(process.execPath, [join(PRODUCT_ROOT, 'bin', 'litgrok.mjs'), 'install', '--dry-run'], {
      cwd: home,
      encoding: 'utf8',
      env: { ...process.env, HOME: home },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /DRY RUN/);
    assert.match(result.stdout, /NON-INTERACTIVE/);
    assert.equal(existsSync(join(home, '.grok')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('uninstall removes only the exact installed payload', async () => {
  const home = mkdtempSync(join(tmpdir(), 'litgrok-uninstall-'));
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;

  try {
    const { run } = await import('../bin/litgrok.mjs');
    assert.equal(await run(['install', '--user'], { ...captureIo(), cwd: home, env }), 0);

    const io = captureIo();
    const exitCode = await run(['uninstall', '--user'], { ...io, cwd: home, env });

    assert.equal(exitCode, 0);
    assert.equal(existsSync(join(home, '.grok', 'skills', 'litgrok', 'SKILL.md')), false);
    assert.equal(existsSync(join(home, '.grok', 'rules', '00-litgrok.md')), false);
    assert.match(io.read().stdout, /Status:.*Removed/i);
    assert.match(io.read().stdout, /Written vs already-current: 0 written/i);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('uninstall removes emptied payload directories and preserves a user file left in one', async () => {
  const home = mkdtempSync(join(tmpdir(), 'litgrok-uninstall-dirs-'));
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;
  const userFile = join(home, '.grok', 'skills', 'keep-me.md');

  try {
    const { run } = await import('../bin/litgrok.mjs');
    assert.equal(await run(['install', '--user'], { ...captureIo(), cwd: home, env }), 0);
    writeFileSync(userFile, '# not ours\n');

    const exitCode = await run(['uninstall', '--user'], { ...captureIo(), cwd: home, env });

    assert.equal(exitCode, 0);
    assert.equal(existsSync(join(home, '.grok', 'skills', 'litgrok')), false, 'the emptied per-skill directory must be removed');
    assert.equal(existsSync(join(home, '.grok', 'rules')), false, 'the emptied rules directory must be removed');
    assert.equal(existsSync(userFile), true, 'a user file left in a payload directory must survive uninstall');
    assert.equal(readFileSync(userFile, 'utf8'), '# not ours\n');
    assert.equal(existsSync(join(home, '.grok', 'skills')), true, 'the directory holding the user file must not be removed');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('uninstall refuses all removal when one installed file was modified', async () => {
  const home = mkdtempSync(join(tmpdir(), 'litgrok-uninstall-conflict-'));
  const skillTarget = join(home, '.grok', 'skills', 'litgrok', 'SKILL.md');
  const ruleTarget = join(home, '.grok', 'rules', '00-litgrok.md');
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;

  try {
    const { run } = await import('../bin/litgrok.mjs');
    assert.equal(await run(['install', '--user'], { ...captureIo(), cwd: home, env }), 0);
    writeFileSync(ruleTarget, '# User-modified rule\n');

    const io = captureIo();
    const exitCode = await run(['uninstall', '--user'], { ...io, cwd: home, env });

    assert.equal(exitCode, 1);
    assert.equal(existsSync(skillTarget), true, 'preflight conflict must preserve the exact skill too');
    assert.equal(readFileSync(ruleTarget, 'utf8'), '# User-modified rule\n');
    assert.match(io.read().stderr, /refus(?:e|ing).*00-litgrok\.md/i);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('dry-pack preserves runtime and bilingual references while excluding brand and release assets', () => {
  const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: PRODUCT_ROOT,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const [pack] = JSON.parse(result.stdout);
  const paths = pack.files.map((file) => file.path);

  for (const expected of [
    '.grok/rules/00-litgrok.md',
    '.grok/skills/litgrok/SKILL.md',
    'bin/litgrok.mjs',
    'CHANGELOG.md',
    'plugin.json',
    '.grok-plugin/plugin.json',
    'hooks/hooks.json',
    'LICENSE',
    'package.json',
    'README.md',
    'README_ko-KR.md',
    'docs/reference.md',
    'docs/reference_ko-KR.md',
  ]) {
    assert.ok(paths.includes(expected), `packed payload missing ${expected}`);
  }
  assert.deepEqual(
    paths.filter((path) => path.startsWith('.grok/')).sort(),
    regularFilesBelow(join(PRODUCT_ROOT, '.grok'))
      .filter((path) => !/(^|\/)__pycache__\/|\.pyc$/u.test(path))
      .map((path) => `.grok/${path}`)
      .sort(),
    'dry-pack must contain the complete .grok tree',
  );
  assert.equal(paths.some((path) => path.startsWith('test/')), false, 'tests must stay out of the package');
  assert.equal(paths.includes('AGENTS.md'), false, 'agent-only guidance must stay out of the package');
  assert.equal(paths.includes('generate_cover.py'), false, 'cover generator must stay out of the package');
  assert.equal(paths.includes('cover.png'), false, 'the legacy heavy cover must stay out of the package');
  const landing = [
    'docs/assets/cover.webp',
    'docs/assets/cover-motion.webp',
    'docs/assets/cover-motion-still.webp',
    'docs/assets/litgrok-wordmark.svg',
    'docs/assets/litgrok-clay-icon.png',
    'docs/assets/litgrok-ignition-1600.webp',
    'docs/assets/litgrok-continuity-1600.webp',
    'docs/assets/readme/badge-version.svg',
    'docs/assets/readme/badge-license.svg',
    'docs/assets/readme/ascii-readme.svg',
    'docs/assets/readme/lucide-book-open.svg',
    'docs/assets/readme/lucide-play.svg',
    'docs/assets/readme/lucide-shield-check.svg',
    'docs/assets/readme/Lucide-LICENSE.txt',
  ];
  for (const path of landing) assert.equal(paths.includes(path), true, `packed payload missing ${path}`);
  assert.equal(paths.includes('docs/assets/cover.svg'), false, 'vector fallback must stay out of the package');
  assert.deepEqual(
    paths.filter((path) => path.startsWith('docs/assets/readme/')).sort(),
    [
      'docs/assets/readme/Lucide-LICENSE.txt',
      'docs/assets/readme/README.md',
      'docs/assets/readme/ascii-readme.svg',
      'docs/assets/readme/badge-license.svg',
      'docs/assets/readme/badge-version.svg',
      'docs/assets/readme/lucide-book-open.svg',
      'docs/assets/readme/lucide-play.svg',
      'docs/assets/readme/lucide-shield-check.svg',
    ],
  );
  const skillIds = readdirSync(join(PRODUCT_ROOT, '.grok', 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  assert.deepEqual(
    paths.filter((path) => path.startsWith('docs/assets/skills/')).sort(),
    skillIds.map((id) => `docs/assets/skills/${id}.webp`).sort(),
    'the pack carries exactly one README skill snapshot per packaged skill',
  );
  assert.equal(paths.some((path) => /(?:^|\/)(?:RELEASE_CHECKLIST|release-checklist)\.md$/u.test(path)), false, 'release-only checklists must stay out of the package');
  for (const expected of ['bin/litgrok.mjs', ...regularFilesBelow(join(PRODUCT_ROOT, '.grok')).map((path) => `.grok/${path}`)]) {
    const packed = pack.files.find((file) => file.path === expected);
    assert.equal(packed.size, statSync(join(PRODUCT_ROOT, expected)).size, `packed byte length changed for ${expected}`);
  }
});

test('dry-pack leaves Python bytecode out of the packaged skill scripts', () => {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-pack-bytecode-'));
  try {
    const { files } = JSON.parse(readFileSync(join(PRODUCT_ROOT, 'package.json'), 'utf8'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'litgrok-pack-bytecode', version: '0.0.0', files }));
    const scripts = join(root, '.grok', 'skills', 'lit-pptx', 'scripts');
    mkdirSync(join(scripts, '__pycache__'), { recursive: true });
    writeFileSync(join(scripts, 'qa_deck.py'), 'pass\n');
    writeFileSync(join(scripts, '__pycache__', 'qa_deck.cpython-312.pyc'), 'bytecode');
    writeFileSync(join(scripts, 'stray.pyc'), 'bytecode');
    const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const paths = JSON.parse(result.stdout)[0].files.map((entry) => entry.path);
    assert.ok(paths.includes('.grok/skills/lit-pptx/scripts/qa_deck.py'), 'the script source must still pack');
    assert.deepEqual(paths.filter((path) => /(^|\/)__pycache__\/|\.pyc$/u.test(path)), [], 'bytecode must stay out of the package');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('both packed npx aliases execute the non-mutating install path', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'litgrok-packed-npx-'));
  const home = join(temporaryRoot, 'home');
  const packDirectory = join(temporaryRoot, 'pack');
  const npmCache = join(temporaryRoot, 'npm-cache');
  mkdirSync(home, { recursive: true });
  mkdirSync(packDirectory, { recursive: true });

  try {
    const packed = spawnSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', packDirectory], {
      cwd: PRODUCT_ROOT,
      encoding: 'utf8',
    });
    assert.equal(packed.status, 0, packed.stderr);
    const archive = join(packDirectory, JSON.parse(packed.stdout)[0].filename);

    for (const alias of ['litgrok-ai', 'litgrok']) {
      const result = spawnSync('npm', ['exec', '--yes', `--package=${archive}`, '--', alias, 'install', '--dry-run', '--user'], {
        cwd: home,
        encoding: 'utf8',
        env: { ...process.env, HOME: home, npm_config_cache: npmCache },
      });

      assert.equal(result.status, 0, `${alias}: ${result.stderr}`);
      assert.match(result.stdout, /DRY RUN/);
      assert.match(result.stdout, new RegExp(join(home, '.grok', 'skills', 'litgrok', 'SKILL.md').replaceAll('\\', '\\\\')));
      assert.equal(existsSync(join(home, '.grok')), false, `${alias} dry-run must not write user state`);
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('landing docs link the repository cover and retain the complete lifecycle in local references', () => {
  const packageJson = JSON.parse(readFileSync(join(PRODUCT_ROOT, 'package.json'), 'utf8'));
  assert.match(packageJson.description, /installer/i);
  assert.ok(!packageJson.files.includes('cover.png'), 'the heavy cover must not be enrolled in npm');

  const npmPrefix = 'https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.12/';
  for (const [readmeName, prefix] of [['README.md', './'], ['README_ko-KR.md', './'], ['docs/npm/README.md', npmPrefix], ['docs/npm/README_ko-KR.md', npmPrefix]]) {
    const landing = readFileSync(join(PRODUCT_ROOT, readmeName), 'utf8');
    const english = readmeName.endsWith('README.md');
    const referencePath = english ? 'docs/reference.md' : 'docs/reference_ko-KR.md';
    const assets = `${prefix}docs/assets`;
    assert.ok(landing.includes(`<source media="(prefers-reduced-motion: reduce)" srcset="${assets}/cover-motion-still.webp" />`));
    assert.ok(landing.includes(`<source media="(prefers-reduced-motion: no-preference)" srcset="${assets}/cover-motion.webp" />`));
    assert.ok(landing.includes(`${assets}/cover-motion.webp" width="100%"`));
    const heroAlt = landing.match(/<img src="[^"]+cover-motion\.webp" width="100%" alt="([^"]+)" \/>/u)?.[1] ?? '';
    if (english) {
      assert.equal(heroAlt, 'LitFamily motion cover: five armored robots power on one by one, the LitGrok robot wakes with glowing eyes and a lit frame, then LITFAMILY and KEEP THE WORK LIT. light up.');
    } else {
      assert.match(heroAlt, /^LitFamily 모션 커버: .*LitGrok 로봇.*KEEP THE WORK LIT\./u);
    }
    assert.ok(!landing.includes(`${assets}/cover.webp"`), `${readmeName} shows the robot cover once, as the motion cover`);
    assert.equal([...landing.matchAll(/width="100%"/gu)].length, 1, `${readmeName} leads with one full-width picture`);
    const referenceUrl = prefix === './' ? `./${referencePath}` : `https://cdn.jsdelivr.net/npm/@litfamily/litgrok@${packageJson.version}/${referencePath}`;
    assert.ok(landing.includes(referenceUrl), `${readmeName}: the detailed reference must use its repository-relative (GitHub) or packaged npm-safe URL`);
    const readme = `${landing}\n${readFileSync(join(PRODUCT_ROOT, referencePath), 'utf8')}`;
    assert.match(readme, /npm exec --yes --package @litfamily\/litgrok@latest -- litgrok install/);
    assert.match(readme, /npm exec --yes --package @litfamily\/litgrok@latest -- litgrok install --dry-run/);
    assert.match(readme, /npm exec --yes --package @litfamily\/litgrok@latest -- litgrok install --user/);
    assert.match(readme, /npm exec --yes --package @litfamily\/litgrok@latest -- litgrok uninstall/);
    assert.match(readme, /grok inspect/);
    assert.match(readme, /\/skills/);
    assert.match(readme, /does not|하지 않습니다/);
    assert.match(readme, /1\.0\.12/);
    assert.doesNotMatch(readme, /skill-observer|skill-loop|Skill learning loop/i);
    assert.match(readme, /37/);
    assert.match(readme, /\.grok\/rules\/00-litgrok\.md/);
    assert.match(readme, /SessionStart/);
    assert.match(readme, /PreToolUse/);
    assert.match(readme, /eleven hook registrations|(?:hook|훅) 등록 열한 개/);
    assert.match(readme, /\/hooks[^\n]*(?:eleven|열한)[^\n]*hook/i);
    assert.match(readme, /UserPromptSubmit/);
    assert.match(readme, /PostToolUseFailure/);
    assert.match(readme, /StopFailure/);
    assert.match(readme, /SubagentStart/);
    assert.match(readme, /PreCompact/);
    assert.match(readme, /fail-open/i);
    assert.match(readme, /\/hooks-trust/);
    assert.match(readme, /trusted_folders\.toml/);
    if (english) {
      assert.match(readme, /Git project root/i);
      assert.match(readme, /plain folder[^\n]*(?:skills|rules)[^\n]*hooks remain/i);
      assert.match(readme, /git init/);
      assert.match(readme, /grok --trust inspect --json/);
      assert.match(readme, /Grok Build 1\.0\.23/);
    assert.match(readme, /installer (?:never runs|does not run) `?git init`?/i);
    } else {
      assert.match(readme, /Git 프로젝트 루트/);
      assert.match(readme, /일반 폴더[^\n]*(?:skill|rule)[^\n]*hook/i);
      assert.match(readme, /git init/);
      assert.match(readme, /grok --trust inspect --json/);
      assert.match(readme, /Grok Build 1\.0\.23/);
      assert.match(readme, /(?:Installer|설치 프로그램)[^\n]*(?:git init|trust)[^\n]*(?:않|안)/);
    }
    assert.match(readme, /plugin manifest/i);
    assert.match(readme, /LSP server/i);
  }

  const changelog = readFileSync(join(PRODUCT_ROOT, 'CHANGELOG.md'), 'utf8');
  assert.match(changelog, /^## 0\.2\.2 \(pending\)$/m);
  assert.match(changelog, /Publish `0\.2\.1` before `0\.2\.2`/);
  assert.match(changelog, /^## 0\.2\.0$/m);
  assert.match(changelog, /two-file.*full.*payload/i);
  assert.match(changelog, /33 skills/i);
  assert.match(changelog, /SessionStart/);
  assert.match(changelog, /PreToolUse/);
  assert.match(changelog, /UserPromptSubmit/);
  assert.match(changelog, /PostCompact/);
  assert.match(changelog, /undocumented.*schema/i);

  const guidance = readFileSync(join(PRODUCT_ROOT, 'AGENTS.md'), 'utf8');
  assert.match(guidance, /bin\/litgrok\.mjs/);
  assert.doesNotMatch(guidance, /Do not add[\s\S]{0,80}installer code/i);
});

test('repository cover is a self-contained Ignition SVG with a WebP fallback outside the package allowlist', () => {
  const vector = readFileSync(join(PRODUCT_ROOT, 'docs/assets/cover.svg'), 'utf8');
  assert.match(vector, /<svg\b[^>]*viewBox="0 0 1920 960"/);
  assert.match(vector, /<title id="title">LITGROK — Ignition vector cover<\/title>/);
  assert.match(vector, /<path\b/);
  assert.doesNotMatch(vector, /<(?:image|text|script|foreignObject)\b|\b(?:href|on[a-z]+)\s*=|url\s*\(|@import|<!DOCTYPE|<!ENTITY/i);
  for (const color of ['#080D14', '#FF6337', '#D7F75B', '#F2EFDF']) {
    assert.ok(vector.includes(color), `the cover must retain ${color}`);
  }
  const cover = readFileSync(join(PRODUCT_ROOT, 'docs/assets/cover.webp'));
  assert.ok(cover.length > 12);
  assert.equal(cover.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(cover.subarray(8, 12).toString('ascii'), 'WEBP');
  const packageJson = JSON.parse(readFileSync(join(PRODUCT_ROOT, 'package.json'), 'utf8'));
  assert.ok(packageJson.files.includes('docs/assets/cover.webp'));
  const motionCover = readFileSync(join(PRODUCT_ROOT, 'docs/assets/cover-motion.webp'));
  assert.ok(motionCover.length <= 2_621_440, 'motion cover must stay under 2.5 MiB');
  assert.equal(motionCover.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(motionCover.subarray(8, 12).toString('ascii'), 'WEBP');
  assert.ok(packageJson.files.includes('docs/assets/cover-motion.webp'));
  assert.ok(!packageJson.files.some((path) => ['docs', 'docs/assets', 'docs/assets/cover.svg'].includes(path)));
});

test('landing readmes pin their skill count to the packaged directory listing', () => {
  const skillCount = readdirSync(join(PRODUCT_ROOT, '.grok', 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).length;
  const marketplaceSkills = JSON.parse(readFileSync(join(PRODUCT_ROOT, '.grok-plugin', 'plugin.json'), 'utf8')).skills;
  assert.equal(skillCount, marketplaceSkills.length, 'the measured packaged skill directory count must match the current catalog');

  const englishReference = readFileSync(join(PRODUCT_ROOT, 'docs/reference.md'), 'utf8');
  const englishList = englishReference.match(/^- (\d+) Grok-native skill documents/m);
  assert.ok(englishList, 'the linked reference must state its skill-document count');
  assert.equal(Number(englishList[1]), skillCount, 'the reference list must match .grok/skills');
  for (const name of ['README.md', 'docs/npm/README.md']) {
    const englishSummary = readFileSync(join(PRODUCT_ROOT, name), 'utf8').match(/It ships (\d+) skills/);
    assert.ok(englishSummary, `${name} must state its shipped skill count`);
    assert.equal(Number(englishSummary[1]), skillCount, `${name} summary must match .grok/skills`);
  }

  for (const name of ['README_ko-KR.md', 'docs/npm/README_ko-KR.md']) {
    const koreanList = readFileSync(join(PRODUCT_ROOT, name), 'utf8').match(/스킬\s+(\d+)개/);
    assert.ok(koreanList, `${name} must state its skill count`);
    assert.equal(Number(koreanList[1]), skillCount, `${name} must match .grok/skills`);
  }
});

test('landing readmes list the shipped research route', () => {
  for (const name of ['README.md', 'README_ko-KR.md', 'docs/npm/README.md', 'docs/npm/README_ko-KR.md']) {
    const text = readFileSync(join(PRODUCT_ROOT, name), 'utf8');
    assert.match(text, /\|\s*`\/litresearch`\s*\|/u, `${name} must list /litresearch in the first route table`);
    assert.doesNotMatch(text, /not shipped|포함되어 있지 않습니다|litresearch가 없습니다/u, `${name} must not claim research is absent`);
  }
});

test('project install refuses a symlinked .grok ancestor', async () => {
  const project = mkdtempSync(join(tmpdir(), 'litgrok-symlink-project-'));
  const outside = mkdtempSync(join(tmpdir(), 'litgrok-symlink-outside-'));
  const env = { ...process.env, HOME: project };
  delete env.CI;
  delete env.NO_COLOR;

  try {
    symlinkSync(outside, join(project, '.grok'), 'dir');
    const { run } = await import('../bin/litgrok.mjs');
    const io = captureIo();
    const exitCode = await run(['install'], { ...io, cwd: project, env });

    assert.equal(exitCode, 1);
    assert.equal(existsSync(join(outside, 'skills', 'litgrok', 'SKILL.md')), false);
    assert.equal(existsSync(join(outside, 'rules', '00-litgrok.md')), false);
    assert.match(io.read().stderr, /refus(?:e|ing).*symbolic link/i);
  } finally {
    rmSync(project, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('unknown arguments fail with usage and without mutation', async () => {
  const project = mkdtempSync(join(tmpdir(), 'litgrok-invalid-'));

  try {
    const { run } = await import('../bin/litgrok.mjs');
    const io = captureIo();
    const exitCode = await run(['install', '--force'], {
      ...io,
      cwd: project,
      env: { ...process.env, HOME: project },
    });

    assert.equal(exitCode, 1);
    assert.equal(existsSync(join(project, '.grok')), false);
    assert.match(io.read().stderr, /Usage: litgrok/);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('installer discovers and installs every regular file below the packaged .grok tree', async () => {
  const packageFixture = syntheticPackage();
  const project = mkdtempSync(join(tmpdir(), 'litgrok-tree-project-'));
  const env = { ...process.env, HOME: project };
  delete env.CI;
  delete env.NO_COLOR;

  try {
    const { run } = await importSyntheticInstaller(packageFixture.executable);
    const previewIo = captureIo();
    assert.equal(await run(['install', '--dry-run'], { ...previewIo, cwd: project, env }), 0);
    assert.equal(existsSync(join(project, '.grok')), false, 'tree dry-run must not write');
    assert.match(previewIo.read().stdout, /skills[/\\]litgrok[/\\]references[/\\]guide\.md/);
    assert.match(previewIo.read().stdout, /hooks[/\\]guard\.json/);
    assert.match(previewIo.read().stdout, /\/hooks-trust/);
    assert.match(previewIo.read().stdout, /--trust/);
    assert.match(previewIo.read().stdout, /Git project root/);
    assert.match(previewIo.read().stdout, /grok --trust inspect --json/);
    assert.match(previewIo.read().stdout, /never runs git init/);

    const installIo = captureIo();
    assert.equal(await run(['install'], { ...installIo, cwd: project, env }), 0);
    for (const relativePath of [
      ['skills', 'litgrok', 'SKILL.md'],
      ['skills', 'litgrok', 'references', 'guide.md'],
      ['rules', '00-litgrok.md'],
      ['hooks', 'guard.json'],
      ['hooks', 'check.mjs'],
    ]) {
      assert.ok(existsSync(join(project, '.grok', ...relativePath)), `missing installed ${relativePath.join('/')}`);
    }
    assert.match(installIo.read().stdout, /Written vs already-current: 6 written · 0 already-current/i);
    assert.match(installIo.read().stdout, /\/hooks-trust/);
    assert.match(installIo.read().stdout, /Git project root/);
    assert.match(installIo.read().stdout, /grok --trust inspect --json/);
  } finally {
    rmSync(packageFixture.root, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

test('a foreign file at a discovered payload path refuses the whole tree install', async () => {
  const packageFixture = syntheticPackage();
  const project = mkdtempSync(join(tmpdir(), 'litgrok-tree-conflict-'));
  const foreignHook = join(project, '.grok', 'hooks', 'guard.json');
  const env = { ...process.env, HOME: project };
  delete env.CI;
  delete env.NO_COLOR;

  try {
    mkdirSync(dirname(foreignHook), { recursive: true });
    writeFileSync(foreignHook, 'foreign\n');
    const { run } = await importSyntheticInstaller(packageFixture.executable);
    const io = captureIo();
    assert.equal(await run(['install'], { ...io, cwd: project, env }), 1);
    assert.equal(existsSync(join(project, '.grok', 'skills', 'litgrok', 'SKILL.md')), false);
    assert.equal(readFileSync(foreignHook, 'utf8'), 'foreign\n');
    assert.match(io.read().stderr, /refus(?:e|ing).*guard\.json/i);
    assert.match(io.read().stdout, /hooks-trust/u, 'non-legacy payload conflicts keep the existing hook-trust guidance');
  } finally {
    rmSync(packageFixture.root, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

test('tree uninstall refuses wholesale when one discovered payload file changed', async () => {
  const packageFixture = syntheticPackage();
  const project = mkdtempSync(join(tmpdir(), 'litgrok-tree-uninstall-'));
  const skillTarget = join(project, '.grok', 'skills', 'litgrok', 'SKILL.md');
  const hookTarget = join(project, '.grok', 'hooks', 'guard.json');
  const env = { ...process.env, HOME: project };
  delete env.CI;
  delete env.NO_COLOR;

  try {
    const { run } = await importSyntheticInstaller(packageFixture.executable);
    assert.equal(await run(['install'], { ...captureIo(), cwd: project, env }), 0);
    writeFileSync(hookTarget, 'modified\n');

    const io = captureIo();
    assert.equal(await run(['uninstall'], { ...io, cwd: project, env }), 1);
    assert.equal(readFileSync(skillTarget, 'utf8'), 'skill\n');
    assert.equal(readFileSync(hookTarget, 'utf8'), 'modified\n');
    assert.match(io.read().stderr, /refus(?:e|ing).*guard\.json/i);
  } finally {
    rmSync(packageFixture.root, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

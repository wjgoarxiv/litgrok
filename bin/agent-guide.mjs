// The text of `litgrok install --agent`: how a coding agent installs LitGrok for its user, in steps the user can read
// too. It only prints. test/agent-guide.test.mjs holds it, the parser's flags and both README prompts together.

export const COMMAND = 'npm exec --yes --package @litfamily/litgrok@latest -- litgrok';
export const AGENT_COMMAND = `${COMMAND} install --agent`;
export const AGENT_POINTER = `Agent? See ${AGENT_COMMAND}.`;
// Under the cards the short form stands in where the whole command does not fit.
export const AGENT_HINTS = Object.freeze([AGENT_POINTER, 'Agent? See litgrok install --agent.']);

// A CI variable in the agent's shell would turn the install into a preview, so the lines clear it themselves.
const RUN = `env -u CI ${COMMAND}`;
export const STEPS = Object.freeze({
  preview: `${COMMAND} install --dry-run --round`,
  install: `${RUN} install --yes --round`,
  windows: `cmd /c "set CI=&& ${COMMAND} install --yes --round"`,
  surface: `${RUN} install --yes --round --user --status-line`,
  doctor: `${COMMAND} doctor`,
});

export const QUESTIONS = Object.freeze([
  { ask: 'Where should it go?', standard: "this project's .grok folder", flags: ['--user'], other: 'in ~/.grok, for every project' },
  { ask: 'Show the LIT status row at the bottom of Grok Build?', standard: 'no', flags: ['--user', '--status-line'], other: 'yes; it copies LitGrok into ~/.grok and adds the row to ~/.grok/config.toml after a backup. The row is where the rounded ends show' },
  { ask: 'Send a terminal notification when a turn finishes?', standard: 'no', flags: ['--user', '--notify'], other: 'yes' },
  { ask: 'Add the short LitGrok ground rules to the LitGrok rule file?', standard: 'yes', flags: ['--no-ground'], other: 'no' },
  { ask: 'Which ends should the status row draw?', standard: 'auto, or the choice saved earlier', flags: ['--glyphs'], other: 'round, square or auto after the flag' },
]);

function questionLine({ ask, standard, flags, other }) {
  return `   - ${ask} Default: ${standard}. ${flags.join(' ')}: ${other}.`;
}

export function agentGuide() {
  return [
    'LitGrok install guide for coding agents',
    '',
    'If you are a coding agent and your user asked you to install LitGrok, follow these steps. They are written for your user to read too.',
    "Run every command in the project's folder.",
    '',
    '1. Preview. It writes nothing:',
    `   ${STEPS.preview}`,
    '   Show your user what it would change.',
    '',
    '2. Ask your user. One answer is enough for all of it:',
    '   - Keep every default? Then the command in step 4 stays as it is. Any other answer adds its flags to the end of that command.',
    ...QUESTIONS.map(questionLine),
    `   - Automatic handoff starts off; your user can choose it later with ${COMMAND} auto-handoff on <percent>.`,
    '   - Icon font: --round adds SymbolsNerdFontMono-Regular.ttf and its license to ~/Library/Fonts (macOS) or ${XDG_DATA_HOME:-~/.local/share}/fonts (Linux), only when no icon font is here. On Windows it adds no font.',
    '',
    "3. Wait for your user's yes. Use only this package; add no other source, and do not approve hooks, trust or sign-in for your user.",
    '',
    '4. Install:',
    `   ${STEPS.install}`,
    '   With the status row it is:',
    `   ${STEPS.surface}`,
    '   In Windows PowerShell or cmd, with any other flags before the last quote:',
    `   ${STEPS.windows}`,
    '',
    '5. Update, later: the same command again, with the flags of the first install. The saved choice of ends stays.',
    `   ${STEPS.install}`,
    '',
    '6. Check. The install says "Status: Ready" or "Status: Already current" and prints one ROUND_ENDS: line. Then run:',
    `   ${STEPS.doctor}`,
    '   It passes when it exits 0 and prints "litgrok" with the version and one ROUND_ENDS: line.',
    '   If a step fails, show your user the lines and stop.',
    '',
    '7. Rounded ends. Show your user this and ask if both ends are round:  LIT ',
    '   - Round: run the install line again with --glyphs round added. The choice is saved. Undo it with --glyphs auto.',
    "   - Boxes: run the install line again with --glyphs square added. Round ends then need the terminal's own font to be a full Nerd Font,",
    '     or the symbols font as its fallback (iTerm2 Non-ASCII Font, VS Code terminal.integrated.fontFamily, kitty symbol_map). Terminal.app has no fallback setting, so it needs a full Nerd Font.',
    '   - Over SSH or on a phone, when your user cannot tell: leave it. --glyphs auto is the default.',
    '',
    '8. Only your user can:',
    "   - restart Grok Build from the project's Git root (a plain folder needs git init, which is theirs to run);",
    '   - review and trust the project hooks with /hooks-trust, or with grok --trust inspect --json on Grok Build 1.0.13;',
    '   - sign in to Grok Build.',
    '',
  ].join('\n');
}

// Whether LitGrok's pills, gauges and buttons end in round caps (U+E0B6, U+E0B4). Every surface asks here, so one
// terminal shows one shape.
//
// The user's LITGROK_HUD_GLYPHS decides first, then the choice `litgrok install --glyphs` saved. Otherwise they are
// round in a terminal known to draw the caps itself, or when a font on this machine has them, told by font file names
// alone. Over SSH the fonts here are not the ones on screen.

import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

const FONT_FILE = /\.(?:ttf|otf|ttc)$/iu;
const ICON_FONT = /[Nn]erd[ _-]?[Ff]ont|[A-Za-z0-9 _-]NF[MP]?[ _.-]/u;
// Font folders hold hundreds of files; a folder with more than this is not searched to its end.
const MAX_NAMES = 4000;
const MAX_DEPTH = 3;
const OWN_CAPS = new Set(['vscode', 'wezterm', 'ghostty']);
const MAX_SETTINGS_BYTES = 4096;
const SETTING_WORDS = Object.freeze({ auto: 'auto', round: 'round', nerd: 'round', square: 'square', basic: 'square', ascii: 'square' });

export const GLYPH_CHOICES = Object.freeze(['auto', 'round', 'square']);
export const HUD_SETTINGS_SCHEMA = 'litgrok.hud/v1';

export function hudSettingsPath(env = process.env) {
  return join(env.HOME || env.USERPROFILE || homedir(), '.grok', 'litgrok-hud.json');
}

/** What the installer saved for the status row. A missing or unreadable file reads as auto. */
export function readHudSettings(env = process.env) {
  const settings = { glyphs: 'auto', fontCheckedAt: null };
  try {
    const path = hudSettingsPath(env);
    const status = lstatSync(path);
    if (!status.isFile() || status.size > MAX_SETTINGS_BYTES) return settings;
    const saved = JSON.parse(readFileSync(path, 'utf8'));
    if (saved?.schema !== HUD_SETTINGS_SCHEMA) return settings;
    if (GLYPH_CHOICES.includes(saved.glyphs)) settings.glyphs = saved.glyphs;
    if (Number.isFinite(Date.parse(saved.fontCheckedAt))) settings.fontCheckedAt = saved.fontCheckedAt;
  } catch {
    return { glyphs: 'auto', fontCheckedAt: null };
  }
  return settings;
}

function fontFolders(env, platform) {
  const home = env.HOME || env.USERPROFILE || homedir();
  if (platform === 'darwin') return [join(home, 'Library', 'Fonts'), '/Library/Fonts'];
  if (platform === 'win32') {
    return [[env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts'], [env.WINDIR, 'Fonts']].flatMap(([base, ...rest]) => (base ? [join(base, ...rest)] : []));
  }
  return [join(isAbsolute(env.XDG_DATA_HOME ?? '') ? env.XDG_DATA_HOME : join(home, '.local', 'share'), 'fonts'), join(home, '.fonts'), '/usr/local/share/fonts', '/usr/share/fonts'];
}

/** Whether a font file named like an icon font is installed. No link is followed and no font is opened. */
export function hasIconFont(env = process.env, { platform = process.platform, folders = fontFolders(env, platform), limit = MAX_NAMES } = {}) {
  let left = limit;
  let level = folders;
  for (let depth = 0; depth <= MAX_DEPTH && level.length > 0; depth += 1) {
    const below = [];
    for (const folder of level) {
      let entries;
      try {
        entries = readdirSync(folder, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (left <= 0) return false;
        left -= 1;
        if (entry.isDirectory()) below.push(join(folder, entry.name));
        else if (entry.isFile() && FONT_FILE.test(entry.name) && ICON_FONT.test(entry.name)) return true;
      }
    }
    level = below;
  }
  return false;
}

/** The choice in force and where it comes from: 'environment', 'saved' or 'auto'. */
export function glyphChoice(env = process.env) {
  const setting = env.LITGROK_HUD_GLYPHS;
  if (Object.hasOwn(SETTING_WORDS, setting ?? '')) return { choice: SETTING_WORDS[setting], from: 'environment' };
  const { glyphs } = readHudSettings(env);
  return { choice: glyphs, from: glyphs === 'auto' ? 'auto' : 'saved' };
}

/** A terminal known to draw the round ends itself, whatever its font. */
export function drawsOwnCaps(env = process.env) {
  return Boolean(env.WT_SESSION) || OWN_CAPS.has((env.TERM_PROGRAM ?? '').toLowerCase())
    || env.TERM === 'xterm-kitty' || Boolean(env.KITTY_WINDOW_ID);
}

export function drawsRoundCaps(env = process.env, iconFont = () => hasIconFont(env)) {
  const { choice } = glyphChoice(env);
  if (choice !== 'auto') return choice === 'round';
  if (drawsOwnCaps(env)) return true;
  return !env.SSH_CONNECTION && iconFont();
}

// Whether LitGrok's pills, gauges and buttons end in round caps (U+E0B6, U+E0B4). Every surface asks here, so one
// terminal shows one shape.
//
// The user's LITGROK_HUD_GLYPHS decides first. Otherwise they are round in a terminal known to draw the caps
// itself, or when a font on this machine has them, told by font file names alone. Over SSH the fonts here are not
// the ones on screen.

import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const FONT_FILE = /\.(?:ttf|otf|ttc)$/iu;
const ICON_FONT = /[Nn]erd[ _-]?[Ff]ont|[A-Za-z0-9 _-]NF[MP]?[ _.-]/u;
// Font folders hold hundreds of files; a folder with more than this is not searched to its end.
const MAX_NAMES = 4000;
const MAX_DEPTH = 3;
const OWN_CAPS = new Set(['vscode', 'wezterm', 'ghostty']);

function fontFolders(env, platform) {
  const home = env.HOME || env.USERPROFILE || homedir();
  if (platform === 'darwin') return [join(home, 'Library', 'Fonts'), '/Library/Fonts'];
  if (platform === 'win32') {
    return [[env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts'], [env.WINDIR, 'Fonts']].flatMap(([base, ...rest]) => (base ? [join(base, ...rest)] : []));
  }
  return [join(env.XDG_DATA_HOME || join(home, '.local', 'share'), 'fonts'), join(home, '.fonts'), '/usr/local/share/fonts', '/usr/share/fonts'];
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

export function drawsRoundCaps(env = process.env, iconFont = () => hasIconFont(env)) {
  const setting = env.LITGROK_HUD_GLYPHS;
  if (setting === 'nerd' || setting === 'round') return true;
  if (setting === 'basic' || setting === 'ascii') return false;
  if (env.WT_SESSION || OWN_CAPS.has((env.TERM_PROGRAM ?? '').toLowerCase())) return true;
  if (env.TERM === 'xterm-kitty' || env.KITTY_WINDOW_ID) return true;
  return !env.SSH_CONNECTION && iconFont();
}

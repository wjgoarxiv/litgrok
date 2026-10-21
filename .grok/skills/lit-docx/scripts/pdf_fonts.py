"""Fonts a PDF profile asks XeLaTeX for, checked before the real compile starts.

Standard library only, so a missing font is reported even where the office venv is not built.
"""
from __future__ import annotations

import re
import tempfile
from pathlib import Path
from typing import Callable

DEFAULT_MAIN_FONT = "Times New Roman"
DEFAULT_CJK_FONT = "Pretendard"
MARKER = "LITGROK-MISSING-FONT:"
# A family name goes into a TeX argument, so only plain names are probed.
SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ._+-]*$")

INSTALL_HINTS = {
    "Pretendard": "install the OFL fonts from https://github.com/orioncactus/pretendard/releases (the Pretendard OTF files), then reopen the terminal",
    "Times New Roman": "it ships with Windows and macOS; on Linux install ttf-mscorefonts-installer or Liberation Serif and set the profile's body font to it",
    "Arial": "it ships with Windows and macOS; on Linux install ttf-mscorefonts-installer or Liberation Sans and set the profile's body font to it",
}


def families(publisher: dict, locale: str = "en") -> list[str]:
    """The Latin body font, then the CJK main font when the text has Korean."""
    body = ((publisher.get("docx") or {}).get("font") or {}).get("body") or {}
    cjk = (publisher.get("latex") or {}).get("cjk") or {}
    found = [str(body.get("family") or DEFAULT_MAIN_FONT)]
    if locale in {"ko", "mixed"}:
        found.append(str(cjk.get("main_font") or DEFAULT_CJK_FONT))
    return found


def probe_source(fonts: list[str]) -> str:
    lines = [r"\documentclass{article}", r"\usepackage{fontspec}", r"\begin{document}"]
    for font in fonts:
        lines.append(rf"\IfFontExistsTF{{{font}}}{{}}{{\typeout{{{MARKER} {font}}}}}")
    lines.append(r"\end{document}")
    return "\n".join(lines) + "\n"


def missing_fonts(fonts: list[str], run: Callable[..., object]) -> list[str]:
    """Fonts XeLaTeX cannot find. A probe that fails for another reason raises with the compiler output."""
    probeable = [font for font in dict.fromkeys(fonts) if SAFE_NAME.match(font)]
    if not probeable:
        return []
    with tempfile.TemporaryDirectory() as tmpdir:
        workdir = Path(tmpdir)
        (workdir / "fonts.tex").write_text(probe_source(probeable), encoding="utf-8")
        result = run(["xelatex", "-interaction=nonstopmode", "-halt-on-error", "fonts.tex"], workdir)
    output = f"{result.stdout}\n{result.stderr}"
    if result.returncode != 0:
        raise SystemExit(f"Error: the XeLaTeX font probe failed (exit {result.returncode}):\n{output.strip()}")
    return [line.split(MARKER, 1)[1].strip() for line in output.splitlines() if MARKER in line]


def blocked_message(missing: list[str], publisher_name: str) -> str:
    lines = [f"BLOCKED_MISSING_FONT: the '{publisher_name}' PDF profile needs {', '.join(missing)}, which XeLaTeX cannot find."]
    for font in missing:
        lines.append(f"  {font}: {INSTALL_HINTS.get(font, 'install the font system-wide (or into a TeX fonts folder), then run the conversion again')}")
    lines.append("Nothing was compiled. A DOCX output does not need these fonts.")
    return "\n".join(lines)

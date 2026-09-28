"""Deterministic slide craft checks, measured from python-pptx and OOXML."""
from __future__ import annotations

import colorsys
import math
import re

from pptx.enum.shapes import MSO_AUTO_SHAPE_TYPE, MSO_SHAPE_TYPE
from pptx.enum.text import PP_ALIGN

EMU = 914400
LIMITS = {
    "full_bleed": .92, "accent_saturation": .12, "accent_light_min": .12,
    "accent_light_max": .93, "hue_band": 20, "latin_chars": 90,
    "cjk_chars": 38, "narrow_chars": 10, "group_ratio": 2,
    "symmetric_inset": .06, "radius_tolerance": .02,
    "empty_high": .35, "empty_medium": .25,
}


def _box(shape):
    return tuple(float(getattr(shape, key)) / EMU for key in ("left", "top", "width", "height"))


def _distance(a, b):
    return math.hypot(max(0, a[0] - b[0] - b[2], b[0] - a[0] - a[2]),
                      max(0, a[1] - b[1] - b[3], b[1] - a[1] - a[3]))


def _hue(shape):
    try:
        rgb = shape.fill.fore_color.rgb
        if rgb is None:
            return None
        vals = tuple(int(str(rgb)[i:i + 2], 16) / 255 for i in (0, 2, 4))
        hue, sat, light = colorsys.rgb_to_hls(*vals)
        if sat < LIMITS["accent_saturation"] or not LIMITS["accent_light_min"] <= light <= LIMITS["accent_light_max"]:
            return None
        return hue * 360
    except (AttributeError, TypeError, ValueError):
        return None


def _display(slide):
    text = [s for s in slide.shapes if getattr(s, "has_text_frame", False) and s.text.strip()]
    if len(text) > 2 or sum(len(s.text.strip()) for s in text) > 80 or any(
        getattr(s, "has_table", False) or s.shape_type in (MSO_SHAPE_TYPE.CHART, MSO_SHAPE_TYPE.AUTO_SHAPE)
        for s in slide.shapes
    ):
        return False
    sizes = [r.font.size.pt for s in text for p in s.text_frame.paragraphs for r in p.runs if r.font.size]
    return bool(sizes and max(sizes) >= 30)


def _round_radius(shape):
    if shape.shape_type != MSO_SHAPE_TYPE.AUTO_SHAPE or shape.auto_shape_type != MSO_AUTO_SHAPE_TYPE.ROUNDED_RECTANGLE:
        return None
    match = re.search(r'<a:gd[^>]*name="adj"[^>]*fmla="val\s+(\d+)"', shape._element.xml)
    adj = int(match.group(1)) / 100000 if match else .16667
    return adj * min(_box(shape)[2:])


def assess(prs):
    findings = []

    def add(rule, severity, slide, value, threshold, tier="measured", note=""):
        findings.append({"rule": rule, "severity": severity, "slide": slide,
                         "tier": tier, "value": value, "threshold": threshold, "note": note})

    W, H = prs.slide_width / EMU, prs.slide_height / EMU
    for number, slide in enumerate(prs.slides, 1):
        shapes = list(slide.shapes)
        display = _display(slide)
        hue_families = []
        for shape in shapes:
            box = _box(shape)
            if box[2] * box[3] >= LIMITS["full_bleed"] * W * H:
                continue
            hue = _hue(shape)
            if hue is not None and not any(min(abs(hue - old), 360 - abs(hue - old)) <= LIMITS["hue_band"] for old in hue_families):
                hue_families.append(hue)
        count = len(hue_families)
        high = 4 if display else 3
        medium = 3 if display else 2
        if count >= medium:
            add("OF-101", "HIGH" if count >= high else "MEDIUM", number, count, {"medium": medium, "high": high})

        text_shapes = [s for s in shapes if getattr(s, "has_text_frame", False) and s.text.strip()]
        title = min(text_shapes, key=lambda s: _box(s)[1]) if text_shapes else None
        for shape in text_shapes:
            if shape is title:
                continue
            sizes = [r.font.size.pt for p in shape.text_frame.paragraphs for r in p.runs if r.font.size]
            pt = max(sizes) if sizes else 18
            if not 10.5 < pt < 30:
                continue
            content = shape.text.strip()
            capacity = max(1, shape.width / EMU * 72 / (pt * .55))
            lines = max(content.count("\n") + 1, math.ceil(len(content) / capacity))
            if lines < 2:
                continue
            cjk = sum("\uac00" <= c <= "\ud7af" for c in content) >= .5 * len(content)
            measure = len(content) / lines
            ceiling = LIMITS["cjk_chars"] if cjk else LIMITS["latin_chars"]
            if measure > ceiling:
                add("OF-102", "HIGH", number, round(measure, 1), ceiling, "derived", shape.name)
            elif lines >= 3 and measure < LIMITS["narrow_chars"]:
                add("OF-102", "MEDIUM", number, round(measure, 1), LIMITS["narrow_chars"], "derived", shape.name)

        for shape in shapes:
            if not getattr(shape, "has_table", False):
                continue
            table = shape.table
            if len(table.rows) < 3:
                continue
            for col in range(len(table.columns)):
                cells = [table.cell(row, col) for row in range(1, len(table.rows))]
                numeric = [c for c in cells if re.fullmatch(r"[\d.,%+\-±()$€£¥▲▼\s]+", c.text.strip()) and re.search(r"\d", c.text)]
                if len(numeric) / len(cells) < .7:
                    continue
                for cell in numeric:
                    for paragraph in cell.text_frame.paragraphs:
                        if paragraph.alignment is None:
                            add("OF-103", "MEDIUM", number, cell.text, "right alignment", "derived", "inherited table alignment")
                        elif paragraph.alignment != PP_ALIGN.RIGHT:
                            add("OF-103", "HIGH", number, cell.text, "right alignment")

        rounded = [(s, _box(s), _round_radius(s)) for s in shapes]
        rounded = [(s, b, r) for s, b, r in rounded if r is not None]
        for outer, ob, outer_r in rounded:
            for inner, ib, inner_r in rounded:
                if inner is outer:
                    continue
                insets = [ib[0] - ob[0], ib[1] - ob[1], ob[0] + ob[2] - ib[0] - ib[2], ob[1] + ob[3] - ib[1] - ib[3]]
                if min(insets) < 0 or max(insets) - min(insets) > LIMITS["symmetric_inset"]:
                    continue
                expected = max(0, outer_r - sum(insets) / 4)
                if outer_r > .04 and abs(inner_r - expected) > LIMITS["radius_tolerance"]:
                    add("OF-104", "HIGH", number, round(inner_r, 3), round(expected, 3), note=f"{outer.name}/{inner.name}")

        cards = [s for s in shapes if s.shape_type == MSO_SHAPE_TYPE.AUTO_SHAPE and .04 * W * H < _box(s)[2] * _box(s)[3] < LIMITS["full_bleed"] * W * H and _hue(s) is not None]
        groups = []
        for card in cards:
            x, y, w, h = _box(card)
            children = [s for s in shapes if s is not card and x <= _box(s)[0] and y <= _box(s)[1] and _box(s)[0] + _box(s)[2] <= x + w and _box(s)[1] + _box(s)[3] <= y + h]
            if len(children) >= 2:
                groups.append((card, children))
        if len(groups) >= 2:
            intra = [_distance(_box(a), _box(b)) for _, children in groups for i, a in enumerate(children) for b in children[i + 1:]]
            inter = [_distance(_box(a), _box(b)) for i, (a, _) in enumerate(groups) for b, _ in groups[i + 1:]]
            if intra and inter and min(inter) < LIMITS["group_ratio"] * max(intra):
                add("OF-105", "MEDIUM", number, round(min(inter), 3), round(LIMITS["group_ratio"] * max(intra), 3))

        for shape in shapes:
            xml = shape._element.xml
            if shape._element.xpath('.//a:rPr/a:gradFill'):
                add("OF-106", "HIGH", number, shape.name, "no gradient text")
            if "<a:glow" in xml:
                add("OF-107", "HIGH", number, shape.name, "no glow")
            for char in re.findall(r'<a:buChar[^>]*char="([^"]+)"', xml):
                if any(0x1F000 <= ord(c) <= 0x1FAFF or 0x2600 <= ord(c) <= 0x27BF for c in char):
                    add("OF-108", "HIGH", number, char, "no emoji bullet")

        if not display and number > 1 and text_shapes:
            title_bottom = _box(title)[1] + _box(title)[3] if title else H * .18
            top, bottom = title_bottom + .1, H - .55
            region = sorted((_box(s)[1], _box(s)[1] + _box(s)[3]) for s in shapes if s is not title and (getattr(s, "has_table", False) or getattr(s, "has_text_frame", False) and s.text.strip()) and _box(s)[1] >= top and _box(s)[1] < bottom)
            if region and bottom > top:
                rows = []
                for start, end in region:
                    if rows and abs(start - rows[-1][0]) <= .08:
                        rows[-1][1] = min(rows[-1][1], end)
                    else:
                        rows.append([start, end])
                cursor = top
                gaps = []
                for start, end in rows:
                    gaps.append(max(0, start - cursor))
                    cursor = max(cursor, end)
                gaps.append(max(0, bottom - cursor))
                fraction = max(gaps) / (bottom - top)
                if fraction >= LIMITS["empty_medium"]:
                    add("OF-109", "HIGH" if fraction > LIMITS["empty_high"] else "MEDIUM", number, round(fraction, 3), LIMITS["empty_high"])

    return {"pass": not any(f["severity"] == "HIGH" for f in findings), "findings": findings[:100]}

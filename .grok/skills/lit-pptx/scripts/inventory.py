#!/usr/bin/env python3
"""Report slide geometry from the packaged deck, including text and pictures."""
import json
import math
import sys
from pathlib import Path

from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE


def inspect(path):
    deck = Presentation(path)
    result = {}
    for slide_no, slide in enumerate(deck.slides, 1):
        shapes = {}
        items = list(slide.shapes)
        for index, shape in enumerate(items, 1):
            if not (shape.has_text_frame or shape.shape_type == MSO_SHAPE_TYPE.PICTURE):
                continue
            left, top, width, height = (int(shape.left), int(shape.top), int(shape.width), int(shape.height))
            issue = {}
            overflow = {}
            if left < 0 or top < 0 or left + width > deck.slide_width or top + height > deck.slide_height:
                visible_width = max(0, min(left + width, int(deck.slide_width)) - max(0, left))
                visible_height = max(0, min(top + height, int(deck.slide_height)) - max(0, top))
                visible_fraction = visible_width * visible_height / max(1, width * height)
                if (shape.shape_type == MSO_SHAPE_TYPE.PICTURE
                        and slide_no == 1
                        and width >= deck.slide_width * .3
                        and height >= deck.slide_height * .5
                        and visible_fraction >= .5):
                    issue['review'] = {'picture_bleed_off_slide': round(1 - visible_fraction, 4)}
                else:
                    overflow['slide'] = True
            if shape.has_text_frame and shape.text.strip() and width > 0 and height > 0:
                margins = shape.text_frame
                available_width = max(1, width - int(margins.margin_left) - int(margins.margin_right))
                available_height = max(1, height - int(margins.margin_top) - int(margins.margin_bottom))
                estimated_height = 0
                for paragraph in shape.text_frame.paragraphs:
                    font_sizes = [int(run.font.size) for run in paragraph.runs if run.font.size]
                    points = max(font_sizes, default=int(paragraph.font.size or 18 * 12700))
                    chars_per_line = max(1, available_width / max(1, points * .55))
                    estimated_height += math.ceil(max(1, len(paragraph.text)) / chars_per_line) * points * 1.15
                if estimated_height > available_height * 1.25:
                    overflow['frame'] = True
            if overflow:
                issue['overflow'] = overflow
            overlapping = []
            for other_index, other in enumerate(items, 1):
                if other_index == index or not (other.has_text_frame or other.shape_type == MSO_SHAPE_TYPE.PICTURE):
                    continue
                x = min(left + width, int(other.left + other.width)) - max(left, int(other.left))
                y = min(top + height, int(other.top + other.height)) - max(top, int(other.top))
                if x > 0 and y > 0:
                    overlapping.append(other_index)
            if overlapping:
                issue['overlap'] = {'overlapping_shapes': overlapping}
            if issue:
                shapes[str(index)] = issue
        if shapes:
            result[str(slide_no)] = shapes
    return result


if __name__ == '__main__':
    if len(sys.argv) < 3 or not Path(sys.argv[1]).is_file():
        raise SystemExit('usage: inventory.py input.pptx output.json [--issues-only]')
    Path(sys.argv[2]).write_text(json.dumps(inspect(sys.argv[1]), ensure_ascii=False), encoding='utf-8')

import json
import sys

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.oxml.xmlchemy import OxmlElement
from pptx.util import Inches, Pt

sys.path.insert(0, sys.argv[1])
from craft_extras import assess

deck = Presentation()
first = deck.slides.add_slide(deck.slide_layouts[6])
for i, rgb in enumerate(('D6336C', '2F9E44', '1971C2')):
    shape = first.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(.5 + i), Inches(.5), Inches(.6), Inches(.6))
    shape.fill.solid()
    shape.fill.fore_color.rgb = RGBColor.from_string(rgb)
table = first.shapes.add_table(3, 1, Inches(.5), Inches(2), Inches(1), Inches(1)).table
for row, value in enumerate(('Year', '120', '130')):
    table.cell(row, 0).text = value
for row in (1, 2):
    table.cell(row, 0).text_frame.paragraphs[0].alignment = PP_ALIGN.LEFT

slide = deck.slides.add_slide(deck.slide_layouts[6])
title = slide.shapes.add_textbox(Inches(.5), Inches(.2), Inches(7), Inches(.5))
title.text = 'Reading view'
title.text_frame.paragraphs[0].runs[0].font.size = Pt(34)
# A 9 in frame at 14 pt sets about 53 Hangul glyphs a line, well past the 38-glyph measure.
body = slide.shapes.add_textbox(Inches(.5), Inches(1), Inches(9), Inches(1))
body.text = '가' * 160
body.text_frame.paragraphs[0].runs[0].font.size = Pt(14)
body.text_frame.paragraphs[0].runs[0]._r.get_or_add_rPr().append(OxmlElement('a:gradFill'))
outer = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(8), Inches(2), Inches(4), Inches(3))
inner = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(8.1), Inches(2.1), Inches(3.8), Inches(2.8))
effect = OxmlElement('a:effectLst')
effect.append(OxmlElement('a:glow'))
outer._element.spPr.append(effect)
bullet = body.text_frame.add_paragraph()
bullet.text = 'Additional item'
mark = OxmlElement('a:buChar')
mark.set('char', '🚀')
bullet._p.get_or_add_pPr().append(mark)

grouped = deck.slides.add_slide(deck.slide_layouts[6])
for x, rgb in ((.5, 'D6336C'), (3.8, '1971C2')):
    card = grouped.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(1), Inches(3), Inches(3))
    card.fill.solid()
    card.fill.fore_color.rgb = RGBColor.from_string(rgb)
    for y in (1.3, 2.3):
        label = grouped.shapes.add_textbox(Inches(x + .2), Inches(y), Inches(2), Inches(.4))
        label.text = 'Metric'

result = assess(deck)
print(json.dumps(result))

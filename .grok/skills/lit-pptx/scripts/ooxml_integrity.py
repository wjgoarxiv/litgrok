#!/usr/bin/env python3
"""Check a PPTX zip and reopen it after font embedding."""
import sys
import zipfile
from pathlib import PurePosixPath
from xml.etree import ElementTree

from pptx import Presentation


def check(path):
    with zipfile.ZipFile(path) as archive:
        if archive.testzip() is not None:
            raise ValueError('damaged zip member')
        names = set(archive.namelist())
        required = {'[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml'}
        if not required <= names:
            raise ValueError('missing required OOXML part')
        if any(name.startswith('/') or '..' in PurePosixPath(name).parts for name in names):
            raise ValueError('unsafe OOXML part path')
        content_types = ElementTree.fromstring(archive.read('[Content_Types].xml'))
        defaults = {element.attrib.get('Extension') for element in content_types if element.tag.endswith('Default')}
        if not {'xml', 'rels'} <= defaults:
            raise ValueError('missing OOXML content types')
        for name in names:
            if name.endswith(('.xml', '.rels')):
                ElementTree.fromstring(archive.read(name))
        if any(name.endswith('.fntdata') for name in names) and 'fntdata' not in defaults:
            raise ValueError('embedded font content type missing')
    Presentation(path)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: ooxml_integrity.py deck.pptx')
    check(sys.argv[1])
    print('OOXML integrity PASS')

#!/usr/bin/env python3
"""Bundle the communication doc and media index into content.js.

Usage:
    python3 tools/build_content.py [path/to/doc.md]

The doc is the Google Docs "File > Download > Markdown (.md)" export of the
10 MIN BUILD communication doc. Without an argument, source/doc.md is used.
A copy of the given file is saved to source/doc.md so the repo keeps the
version the dashboard was built from.
"""
import datetime
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def repair_emoji(text):
    """Undo UTF-8 emoji that were decoded as Latin-1 (seen in Drive API text exports)."""
    def fix(m):
        try:
            return m.group(0).encode('latin-1').decode('utf-8')
        except UnicodeError:
            return m.group(0)
    return re.sub(r'ð[\x80-\xbf]{3}', fix, text)


def main():
    src = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'source' / 'doc.md'
    doc = repair_emoji(src.read_text(encoding='utf-8'))
    if src.resolve() != (ROOT / 'source' / 'doc.md').resolve():
        (ROOT / 'source' / 'doc.md').write_text(doc, encoding='utf-8')
    media = json.loads((ROOT / 'source' / 'media.json').read_text(encoding='utf-8'))
    payload = {
        'doc': doc,
        'media': media,
        'builtAt': datetime.date.today().isoformat(),
    }
    out = ROOT / 'content.js'
    out.write_text('window.COMMS_SOURCE = ' + json.dumps(payload, ensure_ascii=False) + ';\n', encoding='utf-8')
    print(f'Wrote {out} ({len(doc):,} chars of doc, {len(media)} media entries)')


if __name__ == '__main__':
    main()

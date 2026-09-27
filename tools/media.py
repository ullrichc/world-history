"""Pictures for the documentary series, from Wikimedia Commons, with their licences.

Usage (inside the .venv, which has Pillow):
    python tools/media.py search "Lake Turkana" [limit]      # candidates with licence, size, author, description
    python tools/media.py page "File:Some_file.jpg"           # the parsed record of one file
    python tools/media.py fetch [episode-id]                  # download everything listed in content/series/media/*.json

`fetch` reads the manifest of an episode (a list of {"id", "file", "role", "note"}), checks that the file carries a
licence this project accepts (public domain, CC0, CC BY or CC BY-SA of any version), downloads the original,
scales it to at most 1920 pixels on the long side, saves it as media/<episode>/<id>.jpg and writes data/media.js
(window.LD_MEDIA) with width, height, author, licence, source page and description for the credits.

Commons file pages are read as HTML (the API is rate-limited for this environment); requests are spaced out and
cached in tools/raw/media-cache/. A descriptive user agent identifies the project, as Wikimedia asks.
"""
import hashlib
import html
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', 'raw', 'media-cache')
UA = 'BeforeBronze/0.1 (https://github.com/ullrichc/world-history; documentary media pipeline)'
COMMONS = 'https://commons.wikimedia.org'
MAX_SIDE = 1920
THUMB_SIZES = [2560, 1920, 1280, 1000, 500, 250]   # widths the Wikimedia thumbnail service serves without complaint
JPEG_QUALITY = 84
ACCEPTED = re.compile(r'^(Public domain|CC0(?: 1\.0)?|CC BY(?:-SA)?(?: \d\.\d)?(?: [a-z]{2})?|CC-BY(?:-SA)?[- ]\d\.\d|Copyrighted free use|No restrictions)$', re.I)
_last = 0.0


def get(url, binary=False, pause=1.6):
    """Fetch a URL with the project user agent, at most one request per second, cached on disk."""
    global _last
    os.makedirs(CACHE, exist_ok=True)
    key = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest()[:20] + ('.bin' if binary else '.html'))
    if os.path.exists(key):
        return open(key, 'rb').read() if binary else open(key, encoding='utf-8').read()
    wait = pause - (time.time() - _last)
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            break
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 3:
                time.sleep(30 * (attempt + 1))
                continue
            raise
    _last = time.time()
    with open(key, 'wb') as f:
        f.write(data)
    return data if binary else data.decode('utf-8', 'replace')


def strip(x):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', x)).strip()


def search(query, limit=12):
    url = f'{COMMONS}/w/index.php?search={urllib.parse.quote(query)}&ns6=1&fulltext=1&limit={limit}'
    page = get(url)
    titles = []
    for m in re.finditer(r'<a href="/wiki/(File:[^"]+)" title="(File:[^"]+)"', page):
        t = html.unescape(m.group(2))
        if t not in titles and re.search(r'\.(jpe?g|png|tiff?|gif|webp)$', t, re.I):
            titles.append(t)
    return titles[:limit]


def file_page(title):
    """Parse a Commons file page: licences, author, description, date, size, original URL."""
    url = f'{COMMONS}/wiki/{urllib.parse.quote(title.replace(" ", "_"))}'
    s = html.unescape(get(url))
    rec = {'file': title, 'page': url}
    m = re.search(r'fullImageLink" id="file"><a href="([^"?]+)', s)
    rec['original'] = m.group(1) if m else None
    m = re.search(r'\((\d[\d,]*) × (\d[\d,]*) pixels', s)
    rec['width'], rec['height'] = (int(m.group(1).replace(',', '')), int(m.group(2).replace(',', ''))) if m else (0, 0)
    shorts = [strip(x) for x in re.findall(r'class="[^"]*licensetpl_short[^"]*"[^>]*>(.*?)</(?:span|td|div)>', s, re.S)]
    rec['licences'] = [x for x in shorts if x]
    ok = [x for x in rec['licences'] if ACCEPTED.match(x)]
    # Prefer the most permissive accepted licence for the credit line
    order = lambda x: (0 if x.lower().startswith('public') else 1 if x.upper().startswith('CC0') else 2 if 'SA' not in x.upper() else 3)
    rec['licence'] = sorted(ok, key=order)[0] if ok else None
    for key, name in [('fileinfotpl_aut', 'author'), ('fileinfotpl_desc', 'description'), ('fileinfotpl_date', 'date'), ('fileinfotpl_src', 'source'), ('fileinfotpl_credit', 'credit')]:
        m = re.search(r'id="%s"[^>]*>.*?</td>\s*<td[^>]*>(.*?)</td>' % key, s, re.S)
        rec[name] = strip(m.group(1))[:300] if m else ''
    # Artwork templates put the creator elsewhere
    if not rec['author']:
        m = re.search(r'id="fileinfotpl_art_artist"[^>]*>.*?</td>\s*<td[^>]*>(.*?)</td>', s, re.S)
        rec['author'] = strip(m.group(1))[:200] if m else ''
    if not rec['description']:
        m = re.search(r'id="fileinfotpl_art_title"[^>]*>.*?</td>\s*<td[^>]*>(.*?)</td>', s, re.S)
        rec['description'] = strip(m.group(1))[:300] if m else ''
    return rec


def show(rec):
    lic = rec['licence'] or ('REJECTED ' + ' | '.join(rec['licences']))
    print(f"{rec['file']}\n    {rec['width']}x{rec['height']}  {lic}\n    by {rec['author'][:80]}\n    {rec['description'][:160]}")


def fetch(episode=None):
    from PIL import Image, ImageOps
    mdir = os.path.join(ROOT, 'content', 'series', 'media')
    out_js = os.path.join(ROOT, 'data', 'media.js')
    manifest = {}
    if os.path.exists(out_js):
        txt = open(out_js, encoding='utf-8').read()
        manifest = json.loads(txt[txt.index('=') + 1:txt.index(';\n')])
    for f in sorted(os.listdir(mdir)):
        if not f.endswith('.json'):
            continue
        ep = f[:-5]
        if episode and ep != episode:
            continue
        items = json.load(open(os.path.join(mdir, f), encoding='utf-8'))
        epman = manifest.setdefault(ep, {})
        for it in items:
            dest = os.path.join(ROOT, 'media', ep, it['id'] + '.jpg')
            prev = epman.get(it['id'])
            if prev and prev.get('file') == it['file'] and os.path.exists(dest):
                continue
            try:
                rec = file_page(it['file'])
            except urllib.error.HTTPError as ex:
                print(f"SKIP {it['id']}: file page {it['file']!r} returned HTTP {ex.code}")
                continue
            if not rec['licence']:
                print(f"SKIP {it['id']}: licence not accepted: {rec['licences']}")
                continue
            if not rec['original']:
                print(f"SKIP {it['id']}: no original URL")
                continue
            data = download(rec)
            if data is None:
                print(f"SKIP {it['id']}: download failed")
                continue
            img = Image.open(io.BytesIO(data))
            img = ImageOps.exif_transpose(img)
            if img.mode in ('RGBA', 'LA', 'P'):
                bg = Image.new('RGB', img.size, (15, 14, 12))
                bg.paste(img.convert('RGBA'), mask=img.convert('RGBA').split()[-1])
                img = bg
            else:
                img = img.convert('RGB')
            if it.get('crop'):
                l, t, r, b = it['crop']  # fractions of width and height
                w, h = img.size
                img = img.crop((int(l * w), int(t * h), int(r * w), int(b * h)))
            scale = min(1.0, MAX_SIDE / max(img.size))
            if scale < 1:
                img = img.resize((round(img.size[0] * scale), round(img.size[1] * scale)), Image.LANCZOS)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            img.save(dest, 'JPEG', quality=JPEG_QUALITY, optimize=True, progressive=True)
            epman[it['id']] = {
                'src': f'media/{ep}/{it["id"]}.jpg', 'w': img.size[0], 'h': img.size[1], 'file': it['file'],
                'author': rec['author'], 'licence': rec['licence'], 'page': rec['page'],
                'description': rec['description'], 'role': it.get('role', 'photo'), 'note': it.get('note', ''),
            }
            print(f"{it['id']}: {img.size[0]}x{img.size[1]} {rec['licence']} by {rec['author'][:50]}")
            write(out_js, manifest)
    write(out_js, manifest)


def download(rec):
    """Try the standard thumbnail widths from the largest useful one down, then the original."""
    for url in download_urls(rec):
        try:
            return get(url, binary=True)
        except urllib.error.HTTPError as ex:
            if ex.code in (400, 404, 429):
                continue
            raise
    return None


def download_urls(rec):
    orig = rec['original']
    width = rec['width'] or 0
    m = re.match(r'(https://upload\.wikimedia\.org/wikipedia/commons)/(\w/\w\w)/(.+)$', orig)
    if not m or width <= 1000:
        return [orig]   # small originals are served without throttling; a thumbnail would only lose pixels
    name = m.group(3)
    suffix = name if re.search(r'\.(jpe?g|png|gif|webp)$', name, re.I) else name + ('.png' if name.lower().endswith('.svg') else '.jpg')
    urls = [f'{m.group(1)}/thumb/{m.group(2)}/{name}/{w}px-{suffix}' for w in THUMB_SIZES if w < width and w <= MAX_SIDE]
    return urls + [orig]


def download_url(rec):
    """Wikimedia asks for thumbnails in standard sizes rather than originals: the largest standard width below
    the original's width and our maximum, or the original when it is small."""
    orig = rec['original']
    width = rec['width'] or 0
    m = re.match(r'(https://upload\.wikimedia\.org/wikipedia/commons)/(\w/\w\w)/(.+)$', orig)
    if not m or width <= 320:
        return orig
    size = next((w for w in THUMB_SIZES if w < width and w <= MAX_SIDE), None)
    if size is None:
        return orig
    name = m.group(3)
    suffix = name if re.search(r'\.(jpe?g|png|gif|webp)$', name, re.I) else name + ('.png' if name.lower().endswith('.svg') else '.jpg')
    return f'{m.group(1)}/thumb/{m.group(2)}/{name}/{size}px-{suffix}'


def write(path, manifest):
    with open(path, 'w', encoding='utf-8') as f:
        f.write('// Generated by tools/media.py from content/series/media/. Pictures in media/, with credits.\n')
        f.write('window.LD_MEDIA=' + json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + ';\n')


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'help'
    if cmd == 'search':
        limit = int(sys.argv[3]) if len(sys.argv) > 3 else 8
        for t in search(sys.argv[2], limit):
            try:
                show(file_page(t))
            except Exception as e:  # noqa: BLE001
                print(f'{t}: {e}')
    elif cmd == 'page':
        show(file_page(sys.argv[2]))
    elif cmd == 'fetch':
        fetch(sys.argv[2] if len(sys.argv) > 2 else None)
    else:
        print(__doc__)


if __name__ == '__main__':
    main()

"""Render the chapter narration to MP3 with Kokoro (an open neural text-to-speech model) and write sentence timings.

Setup (one time):
    python3 -m venv .venv && . .venv/bin/activate
    pip install kokoro-onnx soundfile lameenc
    # model files from https://github.com/thewh1teagle/kokoro-onnx/releases (model-files-v1.0)
    curl -LO .../kokoro-v1.0.onnx && curl -LO .../voices-v1.0.bin   (place them in tools/raw/)

Usage:
    node tools/build-content.mjs          # writes tools/raw/narration-script.json
    python tools/narrate.py [chapter-id ...]
    python tools/narrate.py --check       # print the phonemes of every sentence that uses the lexicon

Chapters whose text, voice and lexicon are unchanged are skipped. Output: audio/<id>.mp3 and data/narration.js.
Names the phonemizer gets wrong are listed with their IPA in tools/lexicon.json.

To use a human narrator instead: record each chapter as audio/<id>.mp3 and write the sentence start and end times
(in seconds) into data/narration.js in the same format.
"""
import hashlib
import json
import os
import re
import sys
import time

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'tools', 'raw')
VOICE = os.environ.get('NARRATOR_VOICE', 'af_heart')
LANG = 'en-us'
SPEED = float(os.environ.get('NARRATOR_SPEED', '0.96'))
SR = 24000
PAUSE_SENTENCE = 0.42
PAUSE_PARAGRAPH = 0.95
BITRATE = 56

LEXICON_PATH = os.path.join(ROOT, 'tools', 'lexicon.json')


def load_lexicon():
    """IPA for names the phonemizer gets wrong (see tools/lexicon.json)."""
    with open(LEXICON_PATH, encoding='utf-8') as f:
        lex = json.load(f)
    return {k: v for k, v in lex.items() if not k.startswith('_')}


def load_script():
    with open(os.path.join(RAW, 'narration-script.json'), encoding='utf-8') as f:
        return json.load(f)


ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split()
TENS = 'twenty thirty forty fifty sixty seventy eighty ninety'.split()


def words99(n):
    if n < 20:
        return ONES[n]
    return TENS[n // 10 - 2] + ('' if n % 10 == 0 else '-' + ONES[n % 10])


def say_year(m):
    """Years and BCE dates the way people say them: 1836 as eighteen thirty-six, 2300 BCE as twenty-three hundred, 2015 as twenty fifteen."""
    n, era = int(m.group(1)), m.group(2) or ''
    hi, lo = divmod(n, 100)
    if era and n % 1000 == 0:
        spoken = words99(n // 1000) + ' thousand'
    elif not era and n >= 2100:
        return m.group(0)
    elif not era and n >= 2000:
        spoken = 'twenty ' + words99(lo) if lo >= 10 else 'two thousand' + (' ' + ONES[lo] if lo else '')
    elif lo == 0:
        spoken = words99(hi) + ' hundred'
    else:
        spoken = words99(hi) + (' oh ' + ONES[lo] if lo < 10 else ' ' + words99(lo))
    return spoken + era


def say_decade(m):
    hi, lo = divmod(int(m.group(1)), 100)
    if lo == 0:
        return words99(hi) + ' hundreds'
    return words99(hi) + ' ' + words99(lo)[:-1] + 'ies'


def plain(text):
    # Typographic punctuation the phonemizer does not need, and numbers it reads badly
    text = text.replace('’', "'").replace('‘', "'").replace('–', ' to ')
    # The phonemizer splits 1.8 at its point as if it ended a sentence, so decimals are spelled out
    text = re.sub(r'(\d)\.(\d+)', lambda m: m.group(1) + ' point ' + ' '.join(m.group(2)), text)
    text = re.sub(r'(?<![\d,.])(1[1-9]\d0|20[0-9]0)s\b', say_decade, text)
    return re.sub(r'(?<![\d,.])([1-9]\d{3})(?![\d,]|\.\d)( BCE| CE)?', say_year, text)


def possessive(ipa):
    last = ipa.rstrip('ː')[-1:]
    if last in 'szʃʒ':
        return ipa + 'ɪz'
    if last in 'ptkfθ':
        return ipa + 's'
    return ipa + 'z'


class Phonemizer:
    """Phonemizes a sentence with espeak-ng, splicing in lexicon IPA for listed names.

    Hyphenated respellings make the model stress every syllable, so hard names are given as IPA and the
    rest of the sentence is phonemized around them."""

    def __init__(self, tokenizer, lexicon):
        self.tok = tokenizer
        self.lex = lexicon
        keys = sorted(lexicon, key=len, reverse=True)
        self.pattern = re.compile(r"(?<![\w’'])(" + '|'.join(map(re.escape, keys)) + r")(’s|'s)?(?![\w])")
        bad = {k: v for k, v in lexicon.items() if tokenizer.known(v) != v}
        if bad:
            raise SystemExit(f'lexicon entries with symbols outside the model vocabulary: {bad}')

    def __call__(self, sentence, lang=LANG):
        pieces, pos = [], 0  # (phonemes, preceded by a space in the text)
        for m in self.pattern.finditer(sentence):
            pieces.append(self.text_piece(sentence[pos:m.start()], lang))
            ipa = self.lex[m.group(1)]
            pieces.append((possessive(ipa) if m.group(2) else ipa, m.start() == 0 or sentence[m.start() - 1].isspace()))
            pos = m.end()
        pieces.append(self.text_piece(sentence[pos:], lang))
        out = ''
        for ph, space in pieces:
            if ph:
                out += (' ' if space and out else '') + ph
        return out

    def text_piece(self, text, lang=LANG):
        # Leading punctuation (a comma after a spliced name) is passed through as is: the phonemizer misaligns its
        # punctuation when a text starts with it, which garbles decimals such as 1.8 later in the sentence.
        lead = re.match(r'[\s,.;:!?)”’]*', text).group(0)
        punct = ''.join(c for c in lead if not c.isspace())
        body = text[len(lead):].strip()
        ph = self.tok.phonemize(plain(body), lang) if body else ''
        out = punct + (' ' if punct and ph else '') + ph
        return out, text[:1].isspace()


def trim(samples, thresh=0.004):
    idx = np.where(np.abs(samples) > thresh)[0]
    if not len(idx):
        return samples
    a = max(0, idx[0] - int(0.02 * SR))
    b = min(len(samples), idx[-1] + int(0.06 * SR))
    return samples[a:b]


def encode_mp3(samples, path):
    import lameenc
    enc = lameenc.Encoder()
    enc.set_bit_rate(BITRATE)
    enc.set_in_sample_rate(SR)
    enc.set_channels(1)
    enc.set_quality(2)
    pcm = (np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes()
    data = enc.encode(pcm) + enc.flush()
    with open(path, 'wb') as f:
        f.write(data)


def main():
    from kokoro_onnx import Kokoro
    model = os.environ.get('KOKORO_MODEL', os.path.join(RAW, 'kokoro-v1.0.onnx'))
    voices = os.environ.get('KOKORO_VOICES', os.path.join(RAW, 'voices-v1.0.bin'))
    kokoro = Kokoro(model, voices)
    lexicon = load_lexicon()
    phonemize = Phonemizer(kokoro.tokenizer, lexicon)

    script = load_script()
    if '--check' in sys.argv:
        for ch in script:
            for sentence in ch['sentences']:
                if phonemize.pattern.search(sentence):
                    print(f"{ch['id']}: {sentence}\n    {phonemize(sentence)}")
        return
    only = set(sys.argv[1:])
    out_js = os.path.join(ROOT, 'data', 'narration.js')
    existing = {}
    if os.path.exists(out_js):
        txt = open(out_js, encoding='utf-8').read()
        m = re.search(r'window\.LD_NARRATION=(\{.*?\});\n', txt, re.S)
        if m:
            existing = json.loads(m.group(1))
    os.makedirs(os.path.join(ROOT, 'audio'), exist_ok=True)
    result = {}
    for ch in script:
        cid = ch['id']
        digest = hashlib.sha1(json.dumps([ch['sentences'], ch['paragraphs'], VOICE, SPEED, sorted(lexicon.items())], ensure_ascii=False).encode()).hexdigest()[:12]
        mp3 = os.path.join(ROOT, 'audio', f'{cid}.mp3')
        prev = existing.get(cid)
        if (only and cid not in only) or (prev and prev.get('hash') == digest and os.path.exists(mp3)):
            if prev:
                result[cid] = prev
            continue
        t0 = time.time()
        # Which sentences end a paragraph
        ends, n = set(), 0
        for k in ch['paragraphs']:
            n += k
            ends.add(n - 1)
        chunks, timings, pos = [], [], 0.0
        for i, sentence in enumerate(ch['sentences']):
            samples, sr = kokoro.create(phonemize(sentence), voice=VOICE, speed=SPEED, is_phonemes=True)
            assert sr == SR
            samples = trim(np.asarray(samples, dtype=np.float32))
            start = pos
            chunks.append(samples)
            pos += len(samples) / SR
            timings.append([round(start, 2), round(pos, 2)])
            gap = PAUSE_PARAGRAPH if i in ends else PAUSE_SENTENCE
            if i < len(ch['sentences']) - 1:
                chunks.append(np.zeros(int(gap * SR), dtype=np.float32))
                pos += gap
        audio = np.concatenate(chunks + [np.zeros(int(0.4 * SR), dtype=np.float32)])
        peak = float(np.max(np.abs(audio))) or 1.0
        audio = audio * (0.89 / peak)
        encode_mp3(audio, mp3)
        result[cid] = {'file': f'audio/{cid}.mp3', 'duration': round(len(audio) / SR, 2), 'sentences': timings, 'hash': digest}
        print(f'{cid}: {len(ch["sentences"])} sentences, {len(audio) / SR:.0f}s audio in {time.time() - t0:.0f}s', flush=True)
        write(out_js, result, existing)
    write(out_js, result, existing)


def write(path, result, existing):
    merged = dict(existing)
    merged.update(result)
    meta = {'voice': VOICE, 'model': 'Kokoro-82M v1.0 (kokoro-onnx)', 'speed': SPEED}
    with open(path, 'w', encoding='utf-8') as f:
        f.write('// Generated by tools/narrate.py. Sentence timings in seconds for audio/<chapter>.mp3.\n')
        f.write('window.LD_NARRATION=' + json.dumps(merged, ensure_ascii=False, separators=(',', ':')) + ';\n')
        f.write('window.LD_NARRATION_META=' + json.dumps(meta) + ';\n')


if __name__ == '__main__':
    main()

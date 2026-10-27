#!/usr/bin/env python3
"""Bounded, non-executing, commit-pinned upstream skill acquisition."""
from __future__ import annotations
import concurrent.futures
import datetime
import gzip
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import tarfile
import time
import urllib.parse
import urllib.request

ROOT = Path('/Users/ocean/code/pdoom').resolve()
CACHE = ROOT / '.game-dev-build/phaser-gamedev'
MAX_FILE = 8 * 1024 * 1024
MAX_TOTAL = 64 * 1024 * 1024
MAX_ARCHIVE = 16 * 1024 * 1024
MAX_ENTRIES = 4096
SOURCES = [
    dict(name='phaser', repo='phaserjs/phaser', branch='master', commit='02d8931b626d9764c133cbb3fbf99966c03c757c', tree='6d36c90fe18bd4f21561060dbaabe71fe8a7337b', skill_tree='e33a36cec0cc2348ce4db5362457c51e6a1d7aff'),
    dict(name='gamedev', repo='gamedev-skills/awesome-gamedev-agent-skills', branch='main', commit='184b72be02884f782a0058f2eeae2ce4277453e4', tree='2192031cb6ba0c232362fb5e418fee646fbedca3'),
]
ALLOWED_HOSTS = {'api.github.com', 'raw.githubusercontent.com', 'codeload.github.com'}

class RestrictedRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        u = urllib.parse.urlsplit(newurl)
        if u.scheme != 'https' or u.hostname not in ALLOWED_HOSTS:
            raise ValueError(f'Unexpected redirect: {newurl}')
        return super().redirect_request(req, fp, code, msg, headers, newurl)

OPENER = urllib.request.build_opener(RestrictedRedirect())

def fetch(url: str, maximum: int = MAX_FILE) -> bytes:
    u = urllib.parse.urlsplit(url)
    assert u.scheme == 'https' and u.hostname in ALLOWED_HOSTS
    start = time.monotonic()
    req = urllib.request.Request(url, headers={'User-Agent': 'DSH-source-audit/1.0', 'Accept': 'application/vnd.github+json' if u.hostname == 'api.github.com' else '*/*'})
    with OPENER.open(req, timeout=30) as res:
        length = res.headers.get('Content-Length')
        if length and int(length) > maximum:
            raise ValueError(f'Download too large: {url}')
        out = bytearray()
        while True:
            if time.monotonic() - start > 120:
                raise TimeoutError(f'Download deadline exceeded: {url}')
            chunk = res.read(min(65536, maximum + 1 - len(out)))
            if not chunk:
                break
            out.extend(chunk)
            if len(out) > maximum:
                raise ValueError(f'Download limit exceeded: {url}')
        return bytes(out)

def safe_rel(s: str) -> PurePosixPath:
    p = PurePosixPath(s)
    if not s or '\\' in s or '\x00' in s or p.is_absolute() or '..' in p.parts or ':' in p.parts[0] or str(p) != s.rstrip('/'):
        raise ValueError(f'Unsafe path: {s!r}')
    return p

def target_path(base: Path, rel: str) -> Path:
    p = base.joinpath(*safe_rel(rel).parts)
    if not p.resolve().is_relative_to(base.resolve()):
        raise ValueError(f'Escaping destination: {p}')
    for ancestor in [p, *p.parents]:
        if ancestor.is_symlink():
            raise ValueError(f'Symlink in destination: {ancestor}')
        if ancestor == ROOT:
            break
    return p

def save(base: Path, rel: str, data: bytes):
    p = target_path(base, rel)
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.exists():
        if p.read_bytes() != data:
            raise ValueError(f'Refusing to replace existing content: {p}')
        return
    with p.open('xb') as f:
        f.write(data)
    p.chmod(0o644)

def save_json(base: Path, rel: str, data):
    save(base, rel, (json.dumps(data, indent=2, ensure_ascii=False) + '\n').encode())

def api(repo: str, endpoint: str):
    data = fetch(f'https://api.github.com/repos/{repo}/{endpoint}')
    return json.loads(data)

def verify_blob(item, data):
    if len(data) != item['size']:
        raise ValueError(f'Wrong size: {item["path"]}')
    sha = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    if sha != item['sha']:
        raise ValueError(f'Git blob mismatch: {item["path"]}')

def acquire(source):
    repo, name, commit = source['repo'], source['name'], source['commit']
    dest = ROOT / 'dsh-game-dev-bundle/vendor' / name
    target_path(ROOT, str(dest.relative_to(ROOT)))
    metadata = api(repo, f'git/commits/{commit}')
    assert metadata['sha'] == commit and metadata['tree']['sha'] == source['tree']
    save_json(CACHE, f'{name}/commit.json', metadata)
    root = api(repo, f'git/trees/{source["tree"]}')
    assert not root['truncated']
    save_json(CACHE, f'{name}/root-tree.json', root)
    if name == 'phaser':
        tree = api(repo, f'git/trees/{source["skill_tree"]}?recursive=1')
        assert not tree['truncated']
        items = [dict(item, path='skills/' + item['path']) for item in tree['tree']]
        items += [i for i in root['tree'] if re.match(r'^(LICENSE|NOTICE|COPYING|COPYRIGHT)(\.|$)', i['path'], re.I)]
        for audit_path in ['package.json', 'README.md']:
            item = next(i for i in root['tree'] if i['path'] == audit_path)
            data = fetch(f'https://raw.githubusercontent.com/{repo}/{commit}/{audit_path}')
            verify_blob(item, data)
            save(CACHE, f'phaser/root-audit/{audit_path}', data)
    else:
        tree = api(repo, f'git/trees/{source["tree"]}?recursive=1')
        assert not tree['truncated']
        items = tree['tree']
    assert len(items) <= MAX_ENTRIES
    save_json(CACHE, f'{name}/selected-tree.json', items)
    files = {}
    case_paths = set()
    total = 0
    for item in items:
        rel = item['path']
        safe_rel(rel)
        folded = rel.casefold()
        if folded in case_paths:
            raise ValueError(f'Case-insensitive path collision: {rel}')
        case_paths.add(folded)
        if item['type'] == 'tree':
            assert item['mode'] == '040000'
            continue
        if item['type'] != 'blob' or item['mode'] not in {'100644', '100755'}:
            raise ValueError(f'Nonregular source object: {item}')
        if item['size'] < 0 or item['size'] > MAX_FILE:
            raise ValueError(f'Invalid size: {rel}')
        total += item['size']
        files[rel] = item
    assert total <= MAX_TOTAL
    print(f'{name}: pinned {commit}; {len(files)} selected files, {total} bytes', flush=True)
    if name == 'phaser':
        def one(item):
            rel = item['path']
            quoted = urllib.parse.quote(rel, safe='/')
            data = fetch(f'https://raw.githubusercontent.com/{repo}/{commit}/{quoted}', min(MAX_FILE, item['size'] + 1))
            verify_blob(item, data)
            return rel, data
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            contents = dict(pool.map(one, files.values()))
        download = {'method': 'Git tree + raw commit-pinned blobs', 'archiveUsed': False}
    else:
        url = f'https://codeload.github.com/{repo}/tar.gz/{commit}'
        compressed = fetch(url, MAX_ARCHIVE)
        save(CACHE, 'gamedev/source.tar.gz', compressed)
        out = bytearray()
        with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as gz:
            while True:
                chunk = gz.read(min(65536, MAX_TOTAL + 1 - len(out)))
                if not chunk:
                    break
                out.extend(chunk)
                if len(out) > MAX_TOTAL:
                    raise ValueError('Decompressed archive exceeds cap')
        save(CACHE, 'gamedev/source.tar', bytes(out))
        prefix = repo.split('/')[1] + '-' + commit
        contents = {}
        with tarfile.open(fileobj=io.BytesIO(out), mode='r:') as tf:
            seen = set()
            for index, member in enumerate(tf):
                if index >= MAX_ENTRIES:
                    raise ValueError('Archive entry cap exceeded')
                p = safe_rel(member.name)
                if p.parts[0] != prefix:
                    raise ValueError('Unexpected archive root')
                if len(p.parts) == 1:
                    if not member.isdir():
                        raise ValueError('Archive root is not directory')
                    continue
                rel = '/'.join(p.parts[1:])
                if rel in seen:
                    raise ValueError(f'Duplicate archive entry: {rel}')
                seen.add(rel)
                if member.isdir():
                    continue
                if not member.isreg() or member.size > MAX_FILE or member.size < 0 or rel not in files:
                    raise ValueError(f'Unapproved archive member: {rel}')
                with tf.extractfile(member) as fh:
                    data = fh.read(MAX_FILE + 1)
                verify_blob(files[rel], data)
                contents[rel] = data
        if set(contents) != set(files):
            raise ValueError(f'Archive/tree file-set mismatch: {set(files) ^ set(contents)}')
        download = {'method': 'Bounded codeload gzip/tar with Git blob verification', 'archiveUsed': True, 'url': url, 'archiveSha256': hashlib.sha256(compressed).hexdigest(), 'compressedBytes': len(compressed), 'uncompressedTarBytes': len(out)}
    manifest = []
    for rel, data in sorted(contents.items()):
        save(dest, rel, data)
        manifest.append({'path': rel, 'bytes': len(data), 'gitBlobSha1': files[rel]['sha'], 'sha256': hashlib.sha256(data).hexdigest(), 'upstreamMode': files[rel]['mode'], 'localMode': '0644'})
    report = {
        'schemaVersion': 1, 'repository': f'https://github.com/{repo}', 'requestedRef': source['branch'],
        'commit': commit, 'tree': source['tree'], 'fetchedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'commitVerificationReportedByGitHub': metadata.get('verification'),
        'selectedPaths': ['skills/**', 'LICENSE.md'] if name == 'phaser' else ['** (complete upstream tree, including hidden files)'],
        'upstreamFileCount': len(manifest), 'skillCount': sum(p.endswith('/SKILL.md') or p == 'SKILL.md' for p in contents),
        'upstreamBytes': total, 'licenseFiles': [p for p in contents if re.match(r'^(LICENSE|NOTICE|COPYING|COPYRIGHT)(\.|$)', p, re.I)],
        'download': download,
        'limits': {'perFileBytes': MAX_FILE, 'totalSourceBytes': MAX_TOTAL, 'compressedArchiveBytes': MAX_ARCHIVE, 'decompressedTarBytes': MAX_TOTAL, 'entryCount': MAX_ENTRIES, 'requestTimeoutSeconds': 30, 'requestDeadlineSeconds': 120, 'parallelRequests': 6},
        'safety': {'scriptsExecuted': False, 'packagesInstalled': False, 'symlinksAllowed': False, 'hardlinksAllowed': False, 'specialFilesAllowed': False, 'relativeLayoutPreserved': True, 'allFileContentGitBlobVerified': True, 'upstreamContentModified': False, 'executableBitsCleared': True},
        'files': manifest,
    }
    save_json(dest, 'SOURCE_METADATA.json', report)
    print(f'{name}: wrote {len(manifest)} upstream files + SOURCE_METADATA.json; {report["skillCount"]} skills', flush=True)

if __name__ == '__main__':
    CACHE.mkdir(parents=True, exist_ok=True)
    for source in SOURCES:
        acquire(source)
    print('Acquisition completed; no upstream code executed.', flush=True)

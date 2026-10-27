"""Download pinned upstream and npm archives as inert audit data; execute no package code."""
import base64
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import tarfile
import urllib.request

ROOT = Path('/Users/ocean/code/pdoom/.game-dev-build/aseprite').resolve()
PIN = 'a32a2a58e76b06fc9ad7b29b12abd003ec769665'

def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'DSH-source-audit'}), timeout=60) as response:
        return response.read()

def extract(data, destination):
    if destination.exists():
        raise RuntimeError(f'Refuse to overwrite {destination}')
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        members = archive.getmembers()
        for member in members:
            relative = PurePosixPath(member.name)
            if relative.is_absolute() or '..' in relative.parts or not (member.isfile() or member.isdir()):
                raise RuntimeError(f'Unsafe archive member: {member.name}')
        destination.mkdir()
        for member in members:
            relative = PurePosixPath(member.name)
            stripped = Path(*relative.parts[1:])
            if not stripped.parts:
                continue
            target = destination / stripped
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as source:
                    target.write_bytes(source.read())
        return sum(member.isfile() for member in members)

metadata = json.loads(fetch('https://registry.npmjs.org/@pebbly%2faseprite-ai-artist/latest'))
assert metadata['name'] == '@pebbly/aseprite-ai-artist'
assert metadata['version'] == '0.8.2', 'latest changed; re-audit before continuing'
(ROOT / 'npm-latest.json').write_text(json.dumps(metadata, indent=2) + '\n')
npm_archive = fetch(metadata['dist']['tarball'])
actual_integrity = 'sha512-' + base64.b64encode(hashlib.sha512(npm_archive).digest()).decode()
assert actual_integrity == metadata['dist']['integrity']
assert hashlib.sha1(npm_archive).hexdigest() == metadata['dist']['shasum']
(ROOT / 'aseprite-ai-artist-0.8.2.tgz').write_bytes(npm_archive)
source_url = f'https://codeload.github.com/with-pebbly/aseprite-ai-artist/tar.gz/{PIN}'
source_archive = fetch(source_url)
(ROOT / f'upstream-{PIN}.tar.gz').write_bytes(source_archive)
summary = {
    'commit': PIN,
    'sourceUrl': source_url,
    'sourceArchiveSha256': hashlib.sha256(source_archive).hexdigest(),
    'sourceFiles': extract(source_archive, ROOT / 'upstream'),
    'npmVersion': metadata['version'],
    'npmGitHead': metadata.get('gitHead'),
    'npmIntegrity': actual_integrity,
    'npmFiles': extract(npm_archive, ROOT / 'npm-package'),
}
(ROOT / 'download-audit.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))

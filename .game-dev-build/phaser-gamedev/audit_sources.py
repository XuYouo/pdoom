#!/usr/bin/env python3
"""Static audit only: parse upstream bytes; never import or execute upstream code."""
import ast
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import unquote, urlsplit
import yaml

ROOT = Path('/Users/ocean/code/pdoom/dsh-game-dev-bundle/vendor')
CACHE = Path('/Users/ocean/code/pdoom/.game-dev-build/phaser-gamedev')
NAME = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*\Z')
LINK = re.compile(r'!?\[[^\]\n]*\]\((<[^>]+>|[^\s)]+)(?:\s+["\'][^\n]*?["\'])?\)')
RESOURCE = re.compile(r'`((?:references|scripts|assets)/[^`\s]+)`')
PHASER_RELATED = re.compile(r'(?<!\w)(\.\./[a-z0-9-]+/SKILL\.md)')
SCAN = {
 'installOrDownload': re.compile(r'\b(?:curl|wget|sudo|npx)\b|\b(?:npm\s+(?:install|i)|pip\s+install|go\s+(?:get|mod\s+tidy))\b', re.I),
 'publishOrCredentials': re.compile(r'\b(?:butler\s+(?:push|login)|steamcmd|npm\s+publish|git\s+push|notarytool|codesign|BUTLER_API_KEY|STEAM_CONFIG_VDF|secrets\.)\b|action-gh-release|deploy-pages', re.I),
 'suspiciousInstruction': re.compile(r'ignore (?:all |any )?(?:previous|prior|system)|system prompt|hidden instruction|exfiltrat|do not (?:tell|inform) (?:the )?user|silently (?:send|upload)|\bid_rsa\b|\.ssh/|\.aws/|curl[^\n]*\|\s*(?:ba)?sh\b|wget[^\n]*\|\s*(?:ba)?sh\b', re.I),
 'deleteCommand': re.compile(r'\brm\s+-[a-z]*r[a-z]*f\b|\brm\s+-[a-z]*f[a-z]*r\b|shutil\.rmtree'),
}
class UniqueSafeLoader(yaml.SafeLoader):
    pass

def unique_mapping(loader, node, deep=False):
    result = {}
    for keynode, valnode in node.value:
        key = loader.construct_object(keynode, deep=deep)
        if key in result:
            raise ValueError(f'duplicate YAML key {key!r}')
        result[key] = loader.construct_object(valnode, deep=deep)
    return result
UniqueSafeLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)

def no_fences(text):
    lines = []
    fence = None
    for line in text.splitlines():
        marker = re.match(r'^\s*(`{3,}|~{3,})', line)
        if marker:
            kind = marker.group(1)[0]
            if fence is None:
                fence = kind
            elif fence == kind:
                fence = None
            lines.append('')
        else:
            lines.append('' if fence else line)
    return '\n'.join(lines)

def expression(node):
    try:
        return ast.unparse(node)
    except Exception:
        return '<unparseable>'

def skill_base(path):
    if path.parts[0] == 'router':
        return Path('router')
    if path.parts[0] == 'skills' and len(path.parts) > 3:
        return Path(*path.parts[:3])
    return path.parent

def analyze(source):
    root = ROOT / source
    metadata = json.loads((root / 'SOURCE_METADATA.json').read_text())
    result = {
      'schemaVersion': 1, 'source': source, 'commit': metadata['commit'],
      'method': 'Static UTF-8/YAML/JSON/Python-AST inspection and hash/path checks; no upstream script or template executed.',
      'upstreamFiles': len(metadata['files']), 'integrityErrors': [], 'frontmatterErrors': [],
      'skills': [], 'localLinks': [], 'bundledResourceReferences': [], 'pythonFiles': [],
      'commandFindings': {key: [] for key in SCAN}, 'jsonErrors': [], 'agentYamlErrors': [],
      'fileExtensions': {}, 'runtimeTestsExecuted': False,
    }
    texts = {}
    extensions = Counter()
    for item in metadata['files']:
        rel = item['path']
        path = root / rel
        data = path.read_bytes()
        if path.is_symlink() or not path.is_file():
            result['integrityErrors'].append({'path': rel, 'error': 'not regular non-symlink file'})
        if hashlib.sha256(data).hexdigest() != item['sha256'] or len(data) != item['bytes']:
            result['integrityErrors'].append({'path': rel, 'error': 'sha256/size mismatch'})
        blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        if blob != item['gitBlobSha1']:
            result['integrityErrors'].append({'path': rel, 'error': 'git blob hash mismatch'})
        if path.stat().st_mode & 0o111:
            result['integrityErrors'].append({'path': rel, 'error': 'unexpected execute mode'})
        extensions[path.suffix or '<none>'] += 1
        try:
            text = data.decode('utf-8')
        except UnicodeDecodeError:
            continue
        texts[rel] = text
        for number, line in enumerate(text.splitlines(), 1):
            for kind, pattern in SCAN.items():
                if pattern.search(line):
                    result['commandFindings'][kind].append({'path': rel, 'line': number, 'text': line.strip()[:500]})
        if path.suffix == '.json':
            try:
                json.loads(text)
            except Exception as exc:
                result['jsonErrors'].append({'path': rel, 'error': str(exc)})
        if path.name == 'openai.yaml':
            try:
                yaml.load(text, Loader=UniqueSafeLoader)
            except Exception as exc:
                result['agentYamlErrors'].append({'path': rel, 'error': str(exc)})
        if path.name == 'SKILL.md':
            try:
                if not text.startswith('---\n'):
                    raise ValueError('missing opening YAML boundary')
                end = text.find('\n---\n', 4)
                if end < 0 or end > 16384:
                    raise ValueError('missing or oversized frontmatter')
                fields = yaml.load(text[4:end], Loader=UniqueSafeLoader)
                if not isinstance(fields, dict):
                    raise ValueError('frontmatter must be a mapping')
                name, description = fields.get('name'), fields.get('description')
                if not isinstance(name, str) or not NAME.fullmatch(name) or not 1 <= len(name) <= 64:
                    raise ValueError(f'invalid skill name {name!r}')
                if name != path.parent.name:
                    raise ValueError('name differs from containing directory')
                if not isinstance(description, str) or not 1 <= len(description.strip()) <= 1024:
                    raise ValueError('description must be nonempty string <=1024 characters')
                result['skills'].append({'name': name, 'path': rel, 'description': description.strip(), 'fields': sorted(fields), 'lines': len(text.splitlines())})
            except Exception as exc:
                result['frontmatterErrors'].append({'path': rel, 'error': str(exc)})
        if path.suffix == '.py':
            item = {'path': rel, 'imports': [], 'interestingCalls': [], 'syntaxError': None}
            try:
                tree = ast.parse(text, filename=rel)
                for node in ast.walk(tree):
                    if isinstance(node, (ast.Import, ast.ImportFrom)):
                        item['imports'].append(expression(node))
                    if isinstance(node, ast.Call):
                        function = expression(node.func)
                        if re.search(r'(?:subprocess|\beval\b|\bexec\b|__import__|\.system$|\.popen$|urlopen|requests|socket|\.write|\.save$|\.mkdir$|makedirs|\.copy|\.rmtree$|\.remove$|\.unlink$|\.rename$|\.replace$|\.chmod$|\.open$|^open$|\.ZipFile$|\.extract)', function):
                            item['interestingCalls'].append({'line': node.lineno, 'call': expression(node)[:700]})
            except Exception as exc:
                item['syntaxError'] = str(exc)
            result['pythonFiles'].append(item)
    result['fileExtensions'] = dict(sorted(extensions.items()))
    for rel, text in texts.items():
        if not rel.endswith('.md'):
            continue
        path = root / rel
        prose = no_fences(text)
        for match in LINK.finditer(prose):
            raw = match.group(1).strip('<>')
            url = urlsplit(raw)
            if url.scheme or url.netloc or not url.path:
                continue
            target = (path.parent / unquote(url.path)).resolve()
            result['localLinks'].append({'path': rel, 'line': prose.count('\n', 0, match.start()) + 1, 'reference': raw, 'resolved': str(target.relative_to(root)) if target.is_relative_to(root) else str(target), 'insideSource': target.is_relative_to(root), 'exists': target.exists()})
        candidates = list(RESOURCE.finditer(prose))
        if source == 'phaser':
            candidates += list(PHASER_RELATED.finditer(prose))
        for match in candidates:
            raw = match.group(1).rstrip('.,;')
            # A wildcard, illustrative placeholder, or directory-only label is not a bundled file assertion.
            if any(c in raw for c in '<>{}*') or raw.endswith('/'):
                continue
            owner = root / skill_base(Path(rel)) if source == 'gamedev' else path.parent
            target = (owner / raw).resolve()
            result['bundledResourceReferences'].append({'path': rel, 'line': prose.count('\n', 0, match.start()) + 1, 'reference': raw, 'resolved': str(target.relative_to(root)) if target.is_relative_to(root) else str(target), 'insideSource': target.is_relative_to(root), 'exists': target.exists()})
    if source == 'gamedev':
        marketplace = json.loads(texts['.claude-plugin/marketplace.json'])
        result['marketplaceSkillPaths'] = [{'plugin': p['name'], 'path': s, 'exists': (root / s / 'SKILL.md').is_file()} for p in marketplace['plugins'] for s in p.get('skills', [])]
        routing_names = re.findall(r'^\| `([a-z0-9-]+)` \|', texts['router/references/routing-table.md'], re.M)
        names = {s['name'] for s in result['skills']} - {'router'}
        result['routerTable'] = {'count': len(routing_names), 'duplicates': [n for n, count in Counter(routing_names).items() if count > 1], 'unknownNames': sorted(set(routing_names) - names), 'missingSkillNames': sorted(names - set(routing_names))}
    result['summary'] = {
      'skillCount': len(result['skills']), 'frontmatterErrors': len(result['frontmatterErrors']),
      'integrityErrors': len(result['integrityErrors']), 'pythonFileCount': len(result['pythonFiles']),
      'pythonSyntaxErrors': sum(bool(p['syntaxError']) for p in result['pythonFiles']),
      'markdownLinkCount': len(result['localLinks']), 'missingMarkdownLinks': [p for p in result['localLinks'] if not p['exists']],
      'resourceReferenceCount': len(result['bundledResourceReferences']), 'missingResourceCandidates': [p for p in result['bundledResourceReferences'] if not p['exists']],
      'suspiciousInstructionCandidates': len(result['commandFindings']['suspiciousInstruction']),
    }
    return result

results = [analyze(source) for source in ('phaser', 'gamedev')]
names = defaultdict(list)
for result in results:
    for item in result['skills']:
        names[item['name']].append(result['source'] + '/' + item['path'])
duplicates = {name: locations for name, locations in names.items() if len(locations) > 1}
report = {'sources': results, 'crossSourceDuplicateNames': duplicates, 'skillCount': sum(len(r['skills']) for r in results)}
(CACHE / 'static-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
(CACHE / 'skill-index.json').write_text(json.dumps([dict(source=r['source'], **s) for r in results for s in r['skills']], ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'skillCount': report['skillCount'], 'duplicateNames': duplicates, 'sources': [{'source': r['source'], 'summary': r['summary'], 'fileExtensions': r['fileExtensions'], 'routerTable': r.get('routerTable')} for r in results]}, ensure_ascii=False, indent=2))
raise SystemExit(1 if duplicates or any(r['integrityErrors'] or r['frontmatterErrors'] or r['summary']['pythonSyntaxErrors'] for r in results) else 0)

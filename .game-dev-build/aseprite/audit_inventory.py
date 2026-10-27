from pathlib import Path
import hashlib, json, re
root=Path('/Users/ocean/code/pdoom/.game-dev-build/aseprite')
up=root/'upstream'
np=root/'npm-package'
h=lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
uf={p.relative_to(up).as_posix():p for p in up.rglob('*') if p.is_file()}
nf={p.relative_to(np).as_posix():p for p in np.rglob('*') if p.is_file()}
common=set(uf)&set(nf)
changed=[p for p in sorted(common) if h(uf[p])!=h(nf[p])]
identical=[p for p in sorted(common) if h(uf[p])==h(nf[p])]
missing=[]
for p in sorted((up/'skills').rglob('*.md'))+sorted((up/'agents').rglob('*.md')):
    text=p.read_text()
    for kind,name in re.findall(r'(rules|skill)://([A-Za-z0-9_-]+)',text):
        target=up/'rules'/f'{name}.md' if kind=='rules' else up/'skills'/name/'SKILL.md'
        if name=='index': continue
        if not target.is_file(): missing.append({'file':p.relative_to(up).as_posix(),'reference':f'{kind}://{name}'})
tools=[]
for p in sorted((np/'dist/tools').glob('*.js')):
    for name in re.findall(r'\.registerTool\(\s*[\"\']([^\"\']+)',p.read_text()):
        tools.append({'name':name,'file':p.relative_to(np).as_posix()})
lock=json.loads((up/'package-lock.json').read_text())
result={
 'files':{'source':len(uf),'npm':len(nf),'common':len(common),'identical':len(identical),'changed':changed,'npmOnly':sorted(set(nf)-set(uf))},
 'counts':{'skills':len(list((up/'skills').glob('*/SKILL.md'))),'skillFiles':len(list((up/'skills').rglob('*.*'))),'agents':len(list((up/'agents').glob('*.md'))),'rules':len(list((up/'rules').glob('*.md')))-1},
 'tools':tools,'missingResourceReferences':missing,
 'upstreamLockDirectVersions':{n:lock['packages']['node_modules/'+n]['version'] for n in ['@modelcontextprotocol/sdk','ws','zod']},
 'upstreamLockInstallScripts':[{'name':n,'version':v.get('version'),'dev':v.get('dev',False),'optional':v.get('optional',False)} for n,v in lock['packages'].items() if v.get('hasInstallScript')],
 'npmHasMain':(np/'dist/index.js').exists(),
 'npmFileHashes': [{'path':k,'bytes':v.stat().st_size,'sha256':h(v)} for k,v in sorted(nf.items())]
}
(root/'inventory-audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='npmFileHashes'},indent=2))

"""Build the public data catalogue from the original workspace, without modifying it."""
import argparse
import hashlib
import json
import pathlib
import re
import math

def array_after(text, label):
    match = re.search(label + r'[^\n\[]*', text, re.I)
    if not match:
        return []
    start = text.find('[', match.end())
    if start < 0:
        return []
    depth = 0
    for i in range(start, len(text)):
        depth += (text[i] == '[') - (text[i] == ']')
        if depth == 0:
            try:
                return json.loads(text[start:i + 1])
            except ValueError:
                return []
    return []

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('workspace', type=pathlib.Path)
    args = parser.parse_args()
    site = pathlib.Path(__file__).resolve().parents[1]
    root = args.workspace.resolve()
    inventory, datasets, seen = [], [], {}
    for p in sorted(root.rglob('*.json')):
        if site in p.parents or '.git' in p.parts or 'tmp' in p.parts:
            continue
        raw = p.read_bytes()
        d = json.loads(raw.decode('utf-8-sig'))
        sha = hashlib.sha256(raw).hexdigest()
        rel = p.relative_to(root).as_posix()
        item = dict(path=rel, bytes=len(raw), sha256=sha, type=type(d).__name__, count=len(d),
                    keys=list(d) if isinstance(d, dict) else sorted(set().union(*(x.keys() for x in d if isinstance(x,dict)))))
        item['above_10MB'] = len(raw) > 10_000_000
        item['above_10MiB'] = len(raw) > 10 * 1024 * 1024
        if sha in seen:
            item['duplicate_of'] = seen[sha]
        else:
            seen[sha] = rel
        inventory.append(item)
        # Include the below-threshold NoCoT partner so paired variants remain accessible.
        if not isinstance(d,list) or not (item['above_10MB'] or 'NoCoT' in p.name) or 'duplicate_of' in item:
            continue
        for row in d:
            assert all(isinstance(row.get(k),str) for k in ['instruction','input','output']), rel
        slug = ('mining' if 'MiningCoT' in rel else 'peng') + ('-s3' if 'Trajectory3' in rel else '-s2' if 'Scenario2' in rel else '-s1') + ('-nocot' if 'NoCoT' in p.name else '')
        samples = []
        for index in [0, len(d)//4, len(d)//2, 3*len(d)//4, len(d)-1]:
            row=d[index]
            lane=array_after(row['input'],r'(?:Current )?Lane Centerline:')
            history=array_after(row['input'],r'(?:Historical Trajectory:|Historical position[^\n:]*:)')
            trajectory=array_after(row['output'],r'Trajectory:')
            assert len(trajectory)==4 and all(len(v)==2 and all(isinstance(x,(float,int)) and math.isfinite(x) for x in v) for v in trajectory), (rel,index)
            samples.append(dict(index=index, **row, lane=lane, history=history, trajectory=trajectory))
        samples_file=f'data/{slug}.json'
        (site/samples_file).write_text(json.dumps(samples,ensure_ascii=False),encoding='utf-8')
        datasets.append(dict(**item, id=slug, samples=samples_file, asset=f'{slug}.json',
                             label=('MiningCoT' if slug.startswith('mining') else 'PengCoT')+' / '+slug.split('-')[1].upper()+(' / NoCoT' if 'nocot' in slug else ''),
                             scenario=slug.split('-')[1].upper(), variant='NoCoT' if 'nocot' in slug else 'CoT'))
    catalog=dict(threshold_bytes=10_000_000, threshold_note='MB = 1,000,000 bytes; MiB = 1,048,576 bytes.',
                 inventory=inventory,datasets=datasets,records_across_variants=sum(d['count'] for d in datasets),
                 provenance='Workspace supplementary trajectory instruction data. Not identified as the original 15-hour MiningNav sensor dataset. Counts across variants are not counts of distinct driving scenes.')
    (site/'data/catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(dict(files=len(inventory),above_10MB=sum(x['above_10MB'] for x in inventory),bundles=len(datasets),records=catalog['records_across_variants']),ensure_ascii=False))

if __name__=='__main__':
    main()

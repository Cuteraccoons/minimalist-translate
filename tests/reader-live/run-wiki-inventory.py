"""Read-only structure survey through an existing native-extension Playwright CLI session."""
import argparse
from datetime import datetime
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--session', default='releasefix')
parser.add_argument('--output', default='docs/handoff/wiki-inventory-2026-09-24.json')
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
wrapper = Path.home() / '.codex/skills/playwright/scripts/playwright_cli.sh'
cases = [('en', "Queen%27s_Pawn_Game"), ('en', 'Germany'), ('en', 'Climate_of_London'), ('en', 'Anthropology'), ('en', 'Solar_System'), ('en', 'Pythagorean_theorem'), ('en', 'Water'), ('en', 'Python_(programming_language)'), ('en', 'Symphony_No._5_(Beethoven)'), ('en', 'Timeline_of_the_French_Revolution'), ('en', 'List_of_countries_and_dependencies_by_population'), ('en', 'Periodic_table'), ('zh', '北京'), ('ja', '日本語'), ('de', 'Berlin'), ('en', 'Human_heart')]
output = root / args.output
output.parent.mkdir(parents=True, exist_ok=True)
results = []
for lang, title in cases:
    url = f'https://{lang}.wikipedia.org/wiki/{title}'
    code = (root / 'tests/reader-live/wiki-inventory.js').read_text().replace('__URL__', json.dumps(url))
    try:
        run = subprocess.run([str(wrapper), '-s=' + args.session, 'run-code', code], capture_output=True, text=True, timeout=110)
        text = run.stdout + run.stderr
        if '### Result\n' not in text:
            raise RuntimeError(text[:1600])
        result = json.loads(text.split('### Result\n', 1)[1].split('\n###', 1)[0])
        results.append(result)
        print(title, 'OK', 'headings', len(result['source']['headings']), 'candidates', len(result['missingHeadingCandidates']), flush=True)
    except Exception as error:
        results.append({'requestedUrl': url, 'error': str(error)})
        print(title, 'ERROR', str(error)[:140], flush=True)
    output.write_text(json.dumps({'date': datetime.now().astimezone().isoformat(timespec='seconds'), 'method': 'Native extension DOM survey; no screenshots or translation services; overlapping structural selectors, not template instance counts.', 'results': results}, ensure_ascii=False, indent=2) + '\n')

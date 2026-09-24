"""Collect Baidu article structure; use an already opened native-extension CLI session."""
import argparse
from datetime import datetime
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--session', default='releasefix')
parser.add_argument('--output', default='docs/handoff/baike-inventory-2026-09-23.json')
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
wrapper = Path.home() / '.codex/skills/playwright/scripts/playwright_cli.sh'
names = ['周杰伦/129156', '杭州市/200167', '水/34133', '秦始皇', '中华人民共和国', '故宫博物院', '大熊猫', '光合作用', '三体', '清华大学', '2022年北京冬季奥运会', '中华人民共和国民法典', '马云', '中国共产党', '长征', '苹果公司']
output = root / args.output
output.parent.mkdir(parents=True, exist_ok=True)
results = []
for name in names:
    url = 'https://baike.baidu.com/item/' + name
    code = (root / 'tests/reader-live/baike-inventory.js').read_text().replace('__URL__', json.dumps(url))
    try:
        run = subprocess.run([str(wrapper), '-s=' + args.session, 'run-code', code], capture_output=True, text=True, timeout=100)
        text = run.stdout + run.stderr
        if '### Result\n' not in text:
            raise RuntimeError(text[:1600])
        result = json.loads(text.split('### Result\n', 1)[1].split('\n###', 1)[0])
        results.append(result)
        print(name, 'headings', len(result['source']['headings']), 'missing', len(result['missingHeadings']), 'modules', result['source']['modules'], flush=True)
    except Exception as error:
        results.append({'requestedUrl': url, 'error': str(error)})
        print(name, 'ERROR', str(error)[:180], flush=True)
    output.write_text(json.dumps({'date': datetime.now().astimezone().isoformat(timespec='seconds'), 'method': 'Native extension; no screenshots or translation calls. Source counts before warm-up; reader content-image counts exclude buttons and extension assets. Counts do not prove completeness.', 'results': results}, ensure_ascii=False, indent=2) + '\n')

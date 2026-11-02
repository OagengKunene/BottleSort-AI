"""Prepare BottleSort Lab at a Hugging Face Static Space's root."""
from pathlib import Path
from html.parser import HTMLParser
from zipfile import ZipFile
import argparse
import json
import shutil


class RelativeAssets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = set()

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in {'href', 'src'} and value and value.startswith('./'):
                self.paths.add(value.split('#', 1)[0].split('?', 1)[0])


def prepare(output):
    root = Path(__file__).resolve().parents[1]
    source = root / 'dist'
    card = root / 'huggingface' / 'README.md'
    output = Path(output).resolve()
    if output.is_relative_to(root):
        raise ValueError('Use a separate, empty output directory outside the repository.')
    if output.exists() and any(output.iterdir()):
        raise ValueError('The output directory must be empty.')
    required = [
        'index.html', 'app.js', 'engine.js', 'model.json', 'style.css',
        'favicon.svg', 'PROJECT_REPORT.md', 'train_model.ipynb',
        'bottlesort-project.zip',
    ]
    for name in required:
        if not (source / name).is_file():
            raise FileNotFoundError(f'Missing application file: {name}')
    metadata = card.read_text(encoding='utf-8')
    if not metadata.startswith('---\n') or '\nsdk: static\n' not in metadata or '\napp_file: index.html\n' not in metadata:
        raise ValueError('The Space card must configure sdk: static and app_file: index.html.')
    output.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, output, dirs_exist_ok=True)
    shutil.copyfile(card, output / 'README.md')
    assets = RelativeAssets()
    assets.feed((output / 'index.html').read_text(encoding='utf-8'))
    for asset in assets.paths:
        target = (output / asset).resolve()
        if not target.is_relative_to(output) or not target.is_file():
            raise FileNotFoundError(f'Unresolved relative application asset: {asset}')
    json.loads((output / 'model.json').read_text(encoding='utf-8'))
    notebook = json.loads((output / 'train_model.ipynb').read_text(encoding='utf-8'))
    if notebook.get('nbformat') != 4:
        raise ValueError('The downloadable notebook must use nbformat 4.')
    with ZipFile(output / 'bottlesort-project.zip') as archive:
        if archive.testzip() is not None:
            raise ValueError('The downloadable project ZIP has a corrupt member.')
    files = [p for p in output.rglob('*') if p.is_file()]
    return {'output': str(output), 'sdk': 'static', 'files': len(files),
            'bytes': sum(p.stat().st_size for p in files),
            'relative_assets_verified': len(assets.paths)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, help='Separate empty directory outside the repository.')
    args = parser.parse_args()
    print(json.dumps(prepare(args.output), indent=2))

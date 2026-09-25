"""Create the Store build input with explicit, checked build configuration."""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
required = ['package.json', 'package-lock.json', 'index.html', 'vite.config.js',
            'STORE-BUILD.md', 'README.md', 'WINDOWS-TEST.md']
files = [root / name for name in required]
for folder in ['src', 'electron', 'resources', 'public', 'scripts', 'tests']:
    files.extend(p for p in (root / folder).rglob('*')
                 if p.is_file() and p.name != '.DS_Store' and '__pycache__' not in p.parts)
assert all(p.is_file() for p in files)
output = root / 'release' / 'Kontor-Store-Build.zip'
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(files):
        archive.write(file, Path('Kontor-Windows') / file.relative_to(root))
print(output)

#!/usr/bin/env python3
"""Bouw alles in isolatie; publiceer alleen na een volledige, geslaagde controle."""
from pathlib import Path
import os
import shutil
import subprocess
import sys
import tempfile
from common import SOURCE_ROOT

STEPS = ['harvest.py', 'build_data.py', 'fetch_partijen_lr.py', 'build_gebieden.py',
         'fetch_basemap.py', 'build_basemap_lite.py', 'fetch_offline.py', 'validate_data.py']


def publish(staging, target):
    """Bij een schrijffout de vorige data en libraries herstellen."""
    with tempfile.TemporaryDirectory(prefix='pino-backup-', dir=target.parent) as backup_dir:
        backup = Path(backup_dir)
        changed = []
        try:
            for name in ('data', 'vendor'):
                if (target / name).exists():
                    os.replace(target / name, backup / name)
                changed.append(name)
                os.replace(staging / name, target / name)
        except BaseException:
            for name in reversed(changed):
                if (target / name).exists():
                    shutil.rmtree(target / name)
                if (backup / name).exists():
                    os.replace(backup / name, target / name)
            raise


def main():
    with tempfile.TemporaryDirectory(prefix='.pino-build-', dir=SOURCE_ROOT.parent) as temporary:
        staging = Path(temporary)
        for name in ('data', 'vendor'):
            shutil.copytree(SOURCE_ROOT / name, staging / name)
        env = {**os.environ, 'PINO_OUTPUT_ROOT': str(staging), 'PINO_RAW_DIR': str(staging / 'raw')}
        for i, script in enumerate(STEPS, 1):
            print(f'[{i}/{len(STEPS)}] {script}', flush=True)
            subprocess.run([sys.executable, str(SOURCE_ROOT / 'scripts' / script)], env=env, check=True)
        publish(staging, SOURCE_ROOT)
    print('Alle stappen geslaagd; data en libraries vervangen. Herlaad de pagina.')


if __name__ == '__main__':
    main()

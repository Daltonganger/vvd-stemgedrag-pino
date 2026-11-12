"""Regressies: verlies geen bestaande data bij ontbrekende bronnen of slechte totalen."""
import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import build_data
import harvest
import update_all
from common import SOURCE_ROOT, load_locations, read_js


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.locations = load_locations()
        self.row = {'naam': 'Stembureau ' + self.locations[0]['naam'] + ' (postcode ' + self.locations[0]['postcode'] + ')',
                    'soort': 'GR', 'jaar': 2026, 'vvd': 5, 'geldig': 20, 'uitgebracht': 21, 'kiesg': 40,
                    'partijen': {'VVD': 5, 'Andere partij': 15}, 'vk': {'1': 5}}

    def test_stable_ids_and_manual_location_survive_reordering(self):
        a = build_data.build([self.row], self.locations, {}, {}, {'GR2026'})
        b = build_data.build([self.row], list(reversed(self.locations)), {}, {}, {'GR2026'})
        self.assertEqual(a[1], b[1])
        self.assertEqual(a[0][0]['id'], self.locations[0]['id'])
        self.assertEqual(a[0][0]['lat'], self.locations[0]['lat'])

    def test_build_control_text_describes_totals_not_source_verification(self):
        output = build_data.build([self.row], self.locations, {}, {'GR2026': {'vvd': 5, 'geldig': 20}}, {'GR2026'})
        self.assertEqual(output[3]['controle'], 'ok (1/1 totalen kloppen)')

    def test_unknown_location_stops_build(self):
        with self.assertRaisesRegex(ValueError, 'Onbekende locatie'):
            build_data.build([{**self.row, 'naam': 'Een onbekend gebouw'}], self.locations, {}, {}, {'GR2026'})

    def test_incomplete_election_set_stops_build(self):
        with self.assertRaisesRegex(ValueError, 'Onvolledige'):
            build_data.build([self.row], self.locations, {}, {}, {'GR2026', 'TK2025'})

    def test_bad_reference_stops_build(self):
        with self.assertRaisesRegex(ValueError, 'Integriteitscheck'):
            build_data.build([self.row], self.locations, {}, {'GR2026': {'vvd': 6, 'geldig': 20}}, {'GR2026'})

    def test_missing_turnout_does_not_become_zero(self):
        result = build_data.build([{**self.row, 'uitgebracht': 0}], self.locations, {}, {}, {'GR2026'})
        self.assertIsNone(result[1][0]['uitgebracht'])

    def test_download_encoding_preserves_query_and_existing_escapes(self):
        response = io.BytesIO(b'archive')
        with patch.object(harvest.urllib.request, 'urlopen', return_value=response) as request:
            self.assertEqual(harvest.fetch_url('https://example.org/a%20b.zip?download=1'), b'archive')
        self.assertEqual(request.call_args.args[0].full_url, 'https://example.org/a%20b.zip?download=1')

    def test_retry_count_is_per_unique_url(self):
        with patch.object(harvest.urllib.request, 'urlopen', side_effect=OSError('offline')) as request, \
             patch.object(harvest.time, 'sleep'), contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(OSError):
                harvest.fetch_url('https://example.org/archive.zip', tries_per_url=2)
        self.assertEqual(request.call_count, 2)

    def test_harvest_failure_preserves_raw_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            for name in ('all_rows', 'kandidaten', 'totalen'):
                (directory / (name + '.json')).write_text('oude data')
            with patch.object(harvest, 'RAW_DIR', directory), patch.object(harvest, 'DATASETS', [('test', 'GR', 2026)]), \
                 patch.object(harvest, 'candidate_zips', side_effect=OSError('bron niet beschikbaar')), \
                 contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit):
                    harvest.main()
            self.assertTrue(all(p.read_text() == 'oude data' for p in directory.iterdir()))

    def test_missing_turnout_and_unnamed_list_in_xml(self):
        xml = b'''<Root><ReportingUnitVotes><ReportingUnitIdentifier>Test</ReportingUnitIdentifier>
        <Cast>30</Cast><Selection><AffiliationIdentifier Id="1"><RegisteredName>VVD</RegisteredName></AffiliationIdentifier><ValidVotes>5</ValidVotes></Selection>
        <Selection><AffiliationIdentifier Id="2"/><ValidVotes>2</ValidVotes></Selection></ReportingUnitVotes></Root>'''
        row = harvest.parse_telling(xml, 'TK', 2010)[0]
        self.assertIsNone(row['uitgebracht'])
        self.assertEqual(sum(row['partijen'].values()), row['geldig'])

    def test_merge_bad_reference_preserves_all_output(self):
        import os
        import subprocess
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); (root / 'data').mkdir(); (root / 'raw').mkdir()
            for file in ('stembureaus', 'uitslagen', 'kandidaten', 'meta'):
                (root / 'data' / (file + '.js')).write_bytes((SOURCE_ROOT / 'data' / (file + '.js')).read_bytes())
            before = {p.name: p.read_bytes() for p in (root / 'data').iterdir()}
            for name, value in [('all_rows', [self.row]), ('kandidaten', {}), ('totalen', {'GR2026': {'vvd': 99, 'geldig': 20}})]:
                (root / 'raw' / (name + '.json')).write_text(json.dumps(value))
            result = subprocess.run([sys.executable, str(SOURCE_ROOT / 'scripts/merge_election.py'), 'GR', '2026'],
                                    env={**os.environ, 'PINO_OUTPUT_ROOT': str(root), 'PINO_RAW_DIR': str(root / 'raw')}, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(before, {p.name: p.read_bytes() for p in (root / 'data').iterdir()})

    def test_successful_merge_writes_cautious_control_text(self):
        import os
        import subprocess
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); (root / 'data').mkdir(); (root / 'raw').mkdir()
            for file in ('stembureaus', 'uitslagen', 'kandidaten', 'meta'):
                (root / 'data' / (file + '.js')).write_bytes((SOURCE_ROOT / 'data' / (file + '.js')).read_bytes())
            for name, value in [('all_rows', [self.row]), ('kandidaten', {}), ('totalen', {'GR2026': {'vvd': 5, 'geldig': 20}})]:
                (root / 'raw' / (name + '.json')).write_text(json.dumps(value))
            result = subprocess.run([sys.executable, str(SOURCE_ROOT / 'scripts/merge_election.py'), 'GR', '2026'],
                                    env={**os.environ, 'PINO_OUTPUT_ROOT': str(root), 'PINO_RAW_DIR': str(root / 'raw')}, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            meta = read_js(root / 'data/meta.js', 'META')
            self.assertEqual(meta['controle'], 'ok (16/17 totalen kloppen)')

    def test_publish_failure_rolls_back_both_directories(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); target = root / 'target'; stage = root / 'stage'
            for directory, text in [(target, 'oud'), (stage, 'nieuw')]:
                for name in ('data', 'vendor'):
                    (directory / name).mkdir(parents=True)
                    (directory / name / 'test').write_text(text)
            replace = update_all.os.replace
            def fail_vendor(source, destination):
                if Path(source) == stage / 'vendor':
                    raise OSError('gesimuleerde schrijffout')
                return replace(source, destination)
            with patch.object(update_all.os, 'replace', side_effect=fail_vendor):
                with self.assertRaises(OSError):
                    update_all.publish(stage, target)
            for name in ('data', 'vendor'):
                self.assertEqual((target / name / 'test').read_text(), 'oud')


if __name__ == '__main__':
    unittest.main()

"""Run: python -m unittest discover -s tests/learning -v"""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / 'skills/soren-learning-loop/scripts/learning.py'
spec = importlib.util.spec_from_file_location('learning', SCRIPT)
learning = importlib.util.module_from_spec(spec)
spec.loader.exec_module(learning)


class LearningTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.store = self.root / 'store'
        self.source = self.root / 'source.py'
        self.source.write_text("print('LEARNING_CHECK_PASS')\n", encoding='utf-8')
        self.payload = {
            'id': 'fixture-scoped-recall', 'title': 'Recall a scoped lesson', 'kind': 'procedure',
            'project': str(self.root), 'problem': 'A different project leaked into recall',
            'solution': 'Filter by exact project identity', 'steps': ['Resolve project', 'Filter records'],
            'dead_ends': ['Unscoped lookup returned a different project'],
            'sources': ['Synthetic test fixture, not a production lesson'],
        }

    def record(self):
        return learning.record(self.store, dict(self.payload))

    def verify(self):
        return learning.verify(self.store, self.payload['id'], [sys.executable, str(self.source)],
                               self.root, [str(self.source)], 'LEARNING_CHECK_PASS')

    def test_persists_across_independent_processes_and_scopes(self):
        source = self.root / 'input.json'
        source.write_text(json.dumps(self.payload), encoding='utf-8')
        base = [sys.executable, str(SCRIPT), '--store', str(self.store)]
        subprocess.run(base + ['record', str(source)], check=True, capture_output=True)
        output = subprocess.run(base + ['recall', 'scoped lesson', '--project', str(self.root)],
                                check=True, capture_output=True, text=True)
        self.assertEqual(json.loads(output.stdout)['lessons'][0]['verification'], 'unverified')
        self.assertEqual(learning.recall(self.store, 'lesson', self.root / 'other')['lessons'], [])
        self.payload.update(id='fixture-portable-fact', kind='fact', project='*')
        self.record()
        self.assertEqual(len(learning.recall(self.store, 'lesson', self.root / 'other')['lessons']), 1)

    def test_unverified_and_facts_cannot_generate_skills(self):
        self.record()
        with self.assertRaises(ValueError):
            learning.candidate(self.store, self.payload['id'])
        self.payload.update(id='fixture-fact', kind='fact')
        self.record()
        self.verify()
        with self.assertRaises(ValueError):
            learning.candidate(self.store, self.payload['id'])

    def test_passing_evidence_generates_inactive_skill_and_never_overwrites(self):
        self.record()
        self.assertTrue(self.verify()['passed'])
        target = Path(learning.candidate(self.store, self.payload['id']))
        self.assertTrue(target.is_relative_to(self.store / 'candidates'))
        self.assertIn('INACTIVE CANDIDATE', target.read_text(encoding='utf-8'))
        self.assertTrue(target.with_name('evidence.json').exists())
        with self.assertRaises(FileExistsError):
            learning.candidate(self.store, self.payload['id'])
        with self.assertRaises(FileExistsError):
            self.record()

    def test_stale_source_or_lesson_cannot_generate_skill(self):
        entry = self.record()
        self.verify()
        self.source.write_text("print('changed')", encoding='utf-8')
        with self.assertRaises(ValueError):
            learning.candidate(self.store, self.payload['id'])
        self.source.write_text("print('LEARNING_CHECK_PASS')\n", encoding='utf-8')
        entry['solution'] = 'Changed after verification'
        (self.store / 'lessons' / (entry['id'] + '.json')).write_text(json.dumps(entry), encoding='utf-8')
        with self.assertRaises(ValueError):
            learning.candidate(self.store, self.payload['id'])

    def test_failed_check_and_missing_marker_block_candidate(self):
        self.record()
        self.verify()
        failed = learning.verify(self.store, self.payload['id'], [sys.executable, '-c', 'raise SystemExit(1)'],
                                 self.root, [str(self.source)], 'LEARNING_CHECK_PASS')
        self.assertFalse(failed['passed'])
        with self.assertRaises(ValueError):
            learning.candidate(self.store, self.payload['id'])
        missing = learning.verify(self.store, self.payload['id'], [sys.executable, '-c', "print('other')"],
                                  self.root, [str(self.source)], 'LEARNING_CHECK_PASS')
        self.assertFalse(missing['passed'])

    def test_named_dead_end_and_duplicate_skill_gate(self):
        self.payload['dead_ends'] = []
        self.record(); self.verify()
        with self.assertRaises(ValueError):
            learning.candidate(self.store, self.payload['id'])
        self.payload.update(id='fixture-existing-skill', dead_ends=['Actual failed approach'])
        self.record(); self.verify()
        existing = self.root / '.agents/skills/fixture-existing-skill/SKILL.md'
        existing.parent.mkdir(parents=True)
        existing.write_text('Trusted original', encoding='utf-8')
        with self.assertRaises(ValueError):
            learning.candidate(self.store, self.payload['id'])
        self.assertEqual(existing.read_text(encoding='utf-8'), 'Trusted original')

    def test_validation_and_secret_rejection_without_echo(self):
        for value in ['../escape', 'Bad_Name', '-leading']:
            self.payload['id'] = value
            with self.assertRaises(ValueError):
                self.record()
        self.payload['id'] = 'fixture-safe-id'
        for value in ['password=example-value', 'Bearer ' + 'a' * 30,
                      'https://person:example@example.com', 'ghp_' + 'z' * 30]:
            self.payload['solution'] = value
            with self.assertRaises(ValueError):
                self.record()
        self.assertFalse(self.store.exists())

    def test_cli_verification_and_raw_output_never_stored(self):
        self.record()
        command = [sys.executable, str(SCRIPT), '--store', str(self.store), 'verify',
                   '--cwd', str(self.root), '--file', str(self.source), '--expect', 'LEARNING_CHECK_PASS',
                   self.payload['id'], '--', sys.executable, str(self.source)]
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        self.assertTrue(json.loads(result.stdout)['passed'])
        receipt = json.loads(next((self.store / 'evidence' / self.payload['id']).glob('*.json')).read_text())
        self.assertNotIn('stdout', receipt)
        self.assertNotIn('stderr', receipt)


if __name__ == '__main__':
    unittest.main()

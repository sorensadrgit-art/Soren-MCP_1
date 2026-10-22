"""Stop capture protocol tests; live Codex trust/dispatch is a separate acceptance gate."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / 'skills/soren-learning-loop/scripts/learning.py'
spec = importlib.util.spec_from_file_location('stop_learning', SCRIPT)
learning = importlib.util.module_from_spec(spec)
spec.loader.exec_module(learning)


class StopCaptureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.store = self.root / 'store'
        self.source = self.root / 'check.py'
        self.source.write_text("print('STOP_TEST_PASS')\n", encoding='utf-8')
        self.event = dict(hook_event_name='Stop', session_id='fixture-session', turn_id='fixture-turn',
                          cwd=str(self.root), stop_hook_active=False,
                          last_assistant_message='PRIVATE_TRANSCRIPT_CANARY not for persistence')
        self.payload = dict(id='fixture-stop-procedure', title='Verified fixture procedure', kind='procedure',
                            project=str(self.root), problem='A known failure', solution='A checked solution',
                            steps=['Run the checked procedure'], dead_ends=['An actual rejected approach'],
                            sources=['Synthetic local acceptance fixture'])

    def request(self):
        response = learning.stop_event(self.store, self.event)
        self.assertEqual(response.get('decision'), 'block')

    def stage(self, **updates):
        source = self.root / 'input.json'
        source.write_text(json.dumps(self.payload), encoding='utf-8')
        args = dict(session=self.event['session_id'], turn=self.event['turn_id'], input=source, skip=None,
                    cwd=self.root, file=[str(self.source)], expect='STOP_TEST_PASS',
                    command=[sys.executable, str(self.source)])
        args.update(updates)
        return learning.stage(self.store, argparse.Namespace(**args))

    def complete(self, **updates):
        event = dict(self.event, stop_hook_active=True)
        event.update(updates)
        return learning.stop_event(self.store, event)

    def test_verified_packet_is_written_only_by_stop_and_candidate_stays_inactive(self):
        self.request(); self.stage()
        self.assertFalse((self.store / 'lessons').exists())
        self.complete()
        entry = learning.lesson(self.store, self.payload['id'])
        self.assertIsNotNone(learning.evidence(self.store, entry))
        candidate = self.store / 'candidates' / self.payload['id'] / 'SKILL.md'
        self.assertIn('INACTIVE CANDIDATE', candidate.read_text())
        all_json = ''.join(p.read_text() for p in self.store.rglob('*.json'))
        self.assertNotIn('PRIVATE_TRANSCRIPT_CANARY', all_json)
        self.assertNotIn('PRIVATE_TRANSCRIPT_CANARY', (self.store / 'hook-events.jsonl').read_text())

    def test_same_session_turn_is_idempotent_and_new_continuation_id_is_bound(self):
        self.request(); self.stage(); self.complete(turn_id='continued-turn')
        files = sorted(str(p) for p in self.store.rglob('*') if p.is_file() and p.suffix != '.jsonl')
        self.assertEqual(self.complete(), {})
        self.assertEqual(self.complete(turn_id='continued-turn'), {})
        self.assertEqual(files, sorted(str(p) for p in self.store.rglob('*') if p.is_file() and p.suffix != '.jsonl'))

    def test_no_packet_continues_only_once_then_records_skip(self):
        self.request()
        result = self.complete()
        self.assertNotIn('decision', result)
        self.assertIn('capture_packet_not_prepared', result['systemMessage'])
        self.assertEqual(self.complete(), {})

    def test_explicit_skip_never_records_a_lesson(self):
        self.request(); self.stage(input=None, skip='no_verified_outcome')
        self.assertIn('no_verified_outcome', self.complete()['systemMessage'])
        self.assertFalse((self.store / 'lessons').exists())

    def test_failed_check_or_secret_cannot_be_staged(self):
        self.request()
        with self.assertRaises(ValueError):
            self.stage(command=[sys.executable, '-c', 'raise SystemExit(1)'])
        self.payload['solution'] = 'password=not-a-real-password'
        with self.assertRaises(ValueError):
            self.stage()
        self.assertFalse((self.store / 'lessons').exists())

    def test_stale_evidence_is_rejected_before_recording(self):
        self.request(); self.stage()
        self.source.write_text('changed', encoding='utf-8')
        with self.assertRaises(ValueError):
            self.complete()
        self.assertFalse((self.store / 'lessons').exists())

    def test_duplicate_knowledge_in_another_turn_is_explicitly_skipped(self):
        self.request(); self.stage(); self.complete()
        self.event.update(session_id='another-session', turn_id='another-turn')
        self.payload['id'] = 'different-id-same-knowledge'
        self.request(); self.stage()
        self.assertIn('duplicate_lesson', self.complete()['systemMessage'])
        self.assertEqual(len(list((self.store / 'lessons').glob('*.json'))), 1)

    def test_interrupted_persistence_can_resume_without_double_record(self):
        self.request(); self.stage()
        key = learning.turn_key(self.event['session_id'], self.event['turn_id'])
        packet = learning.read(self.store / 'pending' / (key + '.json'))
        learning.write_new(self.store / 'lessons' / (self.payload['id'] + '.json'), packet['entry'])
        self.assertIn('captured', self.complete()['systemMessage'])
        self.assertEqual(len(list((self.store / 'lessons').glob('*.json'))), 1)

    def test_unverified_packet_cannot_promote_and_failure_is_logged(self):
        result = subprocess.run([sys.executable, str(SCRIPT), '--store', str(self.store), 'stop-hook'],
                                input='not-json PRIVATE_TRANSCRIPT_CANARY', capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn('systemMessage', json.loads(result.stdout))
        log = (self.store / 'hook-events.jsonl').read_text()
        self.assertIn('failed', log)
        self.assertNotIn('PRIVATE_TRANSCRIPT_CANARY', log)

    def test_relative_source_paths_resolve_under_check_cwd(self):
        self.request()
        self.stage(file=['check.py'])
        self.assertIn('captured', self.complete()['systemMessage'])

    def test_real_python_stdin_protocol_records_and_does_not_recurse(self):
        base = [sys.executable, str(SCRIPT), '--store', str(self.store)]
        first = subprocess.run(base + ['stop-hook'], input=json.dumps(self.event),
                               capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(first.stdout)['decision'], 'block')
        self.stage()
        event = dict(self.event, stop_hook_active=True, turn_id='new-continuation-id')
        second = subprocess.run(base + ['stop-hook'], input=json.dumps(event),
                                capture_output=True, text=True, check=True)
        self.assertNotIn('decision', json.loads(second.stdout))
        self.assertIn('captured', json.loads(second.stdout)['systemMessage'])
        self.assertFalse((self.store / 'capture.lock').exists())

    def test_stage_failure_is_logged_and_failed_packet_is_not_written(self):
        self.request()
        source = self.root / 'input.json'
        source.write_text(json.dumps(self.payload))
        result = subprocess.run([sys.executable, str(SCRIPT), '--store', str(self.store), 'stage',
                                 '--session', self.event['session_id'], '--turn', self.event['turn_id'],
                                 '--input', str(source), '--cwd', str(self.root), '--file', str(self.source),
                                 '--expect', 'STOP_TEST_PASS', '--', sys.executable, '-c', 'raise SystemExit(1)'],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn('stage_failed', (self.store / 'hook-events.jsonl').read_text())
        self.assertFalse((self.store / 'pending').exists())


if __name__ == '__main__':
    unittest.main()

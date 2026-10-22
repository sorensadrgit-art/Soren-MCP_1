#!/usr/bin/env python3
"""Validate research data only; no network, installation, execution or deployment.
Requires Python 3.9+ and jsonschema. Run from any working directory.
"""
from pathlib import Path
from collections import Counter
from copy import deepcopy
from urllib.parse import urlparse
import json
import sys
try:
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError:
    sys.exit('Missing validator dependency: jsonschema. No checks ran; nothing was installed.')
ROOT = Path(__file__).resolve().parent
load = lambda name: json.loads((ROOT / name).read_text(encoding='utf-8'))
schema = load('catalog.schema.json')
Draft202012Validator.check_schema(schema)
validator = Draft202012Validator(schema, format_checker=FormatChecker())

def validate(catalog, sources, recipes, evaluation):
    validator.validate(catalog)
    records = catalog['records']
    ids = [r['id'] for r in records]
    assert len(ids) == len(set(ids)), 'Duplicate entity identity'
    source_ids = [s['id'] for s in sources['sources']]
    assert len(source_ids) == len(set(source_ids)), 'Duplicate source identity'
    assert all(urlparse(s['url']).scheme == 'https' for s in sources['sources']), 'Non-HTTPS evidence source'
    coverage = set()
    for r in records:
        coverage.update(r['domains'])
        assert set(r['sourceIds']) <= set(source_ids), 'Unresolved source reference'
        assert set(r['alternatives']) <= set(ids) - {r['id']}, 'Unresolved/self alternative'
        if r['kind'] == 'software_library':
            assert r['delivery'] == 'authorized_host_runtime', 'Library falsely exposed as native MCP'
        if r['kind'] == 'workflow_runtime':
            assert r['delivery'] == 'authorized_workflow_platform', 'Workflow lacks explicit execution owner'
        if r['kind'] == 'mcp_server':
            assert r['requires'], 'MCP record missing target connection precondition'
    assert coverage == set(catalog['domains']), 'Incomplete domain coverage'
    assert recipes['status'] == 'proposed_recipes_not_registered_workflows'
    assert recipes['policy']['responseContract']['executionAuthorized'] is False
    assert recipes['policy']['responseContract']['planOnly'] is True
    assert {w['domain'] for w in recipes['workflows']} == coverage
    assert len({w['id'] for w in recipes['workflows']}) == len(recipes['workflows'])
    for w in recipes['workflows']:
        seen = set()
        for s in w['steps']:
            assert s['id'] not in seen, 'Duplicate step'
            assert set(s['dependsOn']) <= seen, 'Unordered/cyclic/unresolved workflow dependency'
            assert set(s['candidateIds']) <= set(ids), 'Unresolved step capability'
            assert all(s[k] for k in ['role', 'action', 'expectedOutput', 'authorizationGate', 'onFailure'])
            seen.add(s['id'])
        assert w['successEvidence'] and w['ownership']
    assert evaluation['status'] == 'SPECIFICATION_ONLY_NOT_A_ROUTING_BENCHMARK'
    cases = evaluation['cases']
    assert len({x['id'] for x in cases}) == len(cases)
    for case in cases:
        assert case['domain'] in coverage
        assert set(case['expectedCandidateIds']) <= set(ids)
        assert case['expectedStatus'] in recipes['policy']['statusVocabulary']
        assert case['mustNot']

catalog, sources, recipes, evaluation = map(load, ['catalog.json', 'sources.json', 'workflows.json', 'evaluation-cases.json'])
validate(catalog, sources, recipes, evaluation)
mutations = [
    ('execution permission injection', lambda c,s,w,e: c['records'][0].update(executionAuthorized=True)),
    ('unresolved source', lambda c,s,w,e: c['records'][0].update(sourceIds=['S99'])),
    ('unknown domain', lambda c,s,w,e: c['records'][0].update(domains=['invented'])),
    ('missing alternative', lambda c,s,w,e: c['records'][0].update(alternatives=['service.missing'])),
    ('library/MCP confusion', lambda c,s,w,e: next(r for r in c['records'] if r['kind']=='software_library').update(delivery='native_mcp_if_available')),
    ('cyclic step dependency', lambda c,s,w,e: w['workflows'][0]['steps'][0].update(dependsOn=['handoff'])),
    ('unresolved workflow capability', lambda c,s,w,e: w['workflows'][0]['steps'][0].update(candidateIds=['service.missing'])),
    ('false routing benchmark result', lambda c,s,w,e: e.update(status='ALL_ROUTING_TESTS_PASSED')),
]
rejected = []
for name, mutate in mutations:
    copies = deepcopy([catalog, sources, recipes, evaluation]); mutate(*copies)
    try:
        validate(*copies)
    except Exception as error:
        if isinstance(error, (AssertionError,)) or error.__class__.__module__.startswith('jsonschema'):
            rejected.append(name)
        else:
            raise
    else:
        raise AssertionError('Negative fixture incorrectly accepted: ' + name)
report = {
    'scope': 'research_data_schema_references_workflow_dags_and_negative_fixtures',
    'result': 'PASS', 'catalogEntries': len(catalog['records']),
    'entityKinds': dict(Counter(r['kind'] for r in catalog['records'])),
    'inventoryStates': dict(Counter(r['inventoryState'] for r in catalog['records'])),
    'sourceRecords': len(sources['sources']), 'domainsCovered': len(catalog['domains']),
    'workflowRecipes': len(recipes['workflows']), 'evaluationSpecifications': len(evaluation['cases']),
    'negativeFixturesRejected': rejected,
    'liveConnectionsTested': False, 'routingAccuracyMeasured': False,
    'thirdPartyPackagesInstalled': False, 'runtimeWiredToCatalog': False, 'productionModified': False,
}
print(json.dumps(report, indent=2))

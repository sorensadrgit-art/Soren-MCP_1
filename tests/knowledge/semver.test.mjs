import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVersion,satisfies,isPrerelease,coerceVersion} from '../../lib/v3/semver.mjs';

test('parses release and prerelease versions',()=>{
  assert.deepEqual(parseVersion('9.8.2'),{major:9,minor:8,patch:2,prerelease:[]});
  assert.deepEqual(parseVersion('10.0.0-alpha.6').prerelease,['alpha','6']);
  assert.equal(parseVersion('not-a-version'),null);
  assert.ok(isPrerelease('10.0.0-alpha.6'));
  assert.ok(!isPrerelease('9.8.2'));
});

test('coerces lockfile and package.json specs to a concrete version',()=>{
  assert.equal(coerceVersion('^9.8.2'),'9.8.2');
  assert.equal(coerceVersion('~0.186.1'),'0.186.1');
  assert.equal(coerceVersion('19'),'19.0.0');
  assert.equal(coerceVersion('workspace:*'),null);
  assert.equal(coerceVersion('latest'),null);
});

test('evaluates comparator ranges with OR sets and excludes prereleases unless the range opts in',()=>{
  assert.ok(satisfies('9.8.2','>=9.0.0 <10.0.0'));
  assert.ok(!satisfies('10.0.0','>=9.0.0 <10.0.0'));
  assert.ok(!satisfies('10.0.0-alpha.6','>=9.0.0 <10.0.0'));
  assert.ok(satisfies('10.0.0-alpha.6','>=10.0.0-alpha.0 <11.0.0'));
  assert.ok(satisfies('18.3.1','>=18.0.0 <19.0.0 || >=19.0.0 <20.0.0'));
  assert.ok(satisfies('16.4.2','>=16.0.0'));
  assert.ok(satisfies('0.186.1','>=0.170.0 <1.0.0'));
  assert.ok(!satisfies('0.150.0','>=0.170.0 <1.0.0'));
  assert.equal(satisfies('garbage','>=1.0.0'),false);
});

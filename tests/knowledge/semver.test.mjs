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

test('handles edge cases for coerceVersion',()=>{
  // Invalid, falsy or non-string inputs
  assert.equal(coerceVersion(null), null);
  assert.equal(coerceVersion(undefined), null);
  assert.equal(coerceVersion(''), null);
  assert.equal(coerceVersion('   '), null);

  // Malformed version strings
  assert.equal(coerceVersion('v.1'), null);
  assert.equal(coerceVersion('1.0.0.0.0'), null);
  assert.equal(coerceVersion('v'), null);
  assert.equal(coerceVersion('1.'), null);
  assert.equal(coerceVersion('.1'), null);
  assert.equal(coerceVersion('abc'), null);

  // Partial versions and wildcards
  assert.equal(coerceVersion('v1'), '1.0.0');
  assert.equal(coerceVersion('1.x'), '1.0.0');
  assert.equal(coerceVersion('1.*'), '1.0.0');
  assert.equal(coerceVersion('1.2.x'), '1.2.0');
  assert.equal(coerceVersion('1.2.*'), '1.2.0');

  // Prefix operators and whitespace
  assert.equal(coerceVersion('>= 2.0.0'), '2.0.0');
  assert.equal(coerceVersion('<=1.5.0'), '1.5.0');
  assert.equal(coerceVersion('>1.0.0'), '1.0.0');
  assert.equal(coerceVersion('<3.0.0'), '3.0.0');
  assert.equal(coerceVersion('=1.2.3'), '1.2.3');

  // Prerelease tags
  assert.equal(coerceVersion('^1.2.3-beta.1'), '1.2.3-beta.1');
  assert.equal(coerceVersion('~2.0.0-rc.0'), '2.0.0-rc.0');
  assert.equal(coerceVersion('1.0.0-0'), '1.0.0-0');

  // Protocols and dist-tags
  assert.equal(coerceVersion('git+https://github.com/foo/bar.git'), null);
  assert.equal(coerceVersion('file:../foo'), null);
  assert.equal(coerceVersion('next'), null);
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

import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ajv = new Ajv2020({allErrors: true, strict: false});
addFormats(ajv);
const schema = JSON.parse(fs.readFileSync(new URL('../../docs/implementation/contracts/verification-evidence.schema.json', import.meta.url), 'utf8'));
const validate = ajv.compile(schema);

export function validateEvidence(value) {
  if (!validate(value)) throw new Error('Invalid evidence: ' + ajv.errorsText(validate.errors));
  if (value.status === 'PASS') {
    if (!/^[a-f0-9]{40}$/.test(value.sourceRevision) || !/^[a-f0-9]{64}$/.test(value.lockfileSha256 || '')) throw new Error('PASS requires source revision and lockfile digest');
    if (Date.parse(value.finishedAt) < Date.parse(value.startedAt)) throw new Error('Evidence time order is invalid');
    if (!Object.keys(value.observed).length) throw new Error('PASS requires observations');
  }
  if (['BLOCKED', 'NOT_APPLICABLE'].includes(value.status) && !value.reason?.trim()) throw new Error('Evidence requires a reason');
  return value;
}

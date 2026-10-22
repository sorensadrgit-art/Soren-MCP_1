import {inspectActivationConfiguration, ACTIVATION_COMPONENTS} from '../lib/operations/activation-preflight.mjs';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log(`Usage: node scripts/activation-preflight.mjs [--component ${ACTIVATION_COMPONENTS.join('|')}|all]\nRead-only configuration inspection. Does not load .env files, contact services, read trust files, or activate anything.\nExit 2 means activation remains gated, including when configuration is ready for live probes.`);
} else if (args.length !== 0 && !(args.length === 2 && args[0] === '--component' && [...ACTIVATION_COMPONENTS, 'all'].includes(args[1]))) {
  console.error(JSON.stringify({status: 'BLOCKED', reason: 'invalid_preflight_arguments', productionModified: false}));
  process.exitCode = 64;
} else {
  const result = inspectActivationConfiguration();
  if (args[1] && args[1] !== 'all') result.components = {[args[1]]: result.components[args[1]]};
  console.log(JSON.stringify(result, null, 2));
  // Configuration shape is never a release authorization or evidence of health.
  process.exitCode = 2;
}

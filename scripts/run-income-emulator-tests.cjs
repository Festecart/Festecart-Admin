const { spawnSync } = require('node:child_process')

const firebaseCli = require.resolve('firebase-tools/lib/bin/firebase.js')
const result = spawnSync(process.execPath, [
  firebaseCli,
  'emulators:exec',
  '--project',
  'demo-income-test',
  '--only',
  'auth,firestore,functions,storage',
  'node scripts/test-income-emulator.cjs',
], {
  env: {
    ...process.env,
    FUNCTIONS_DISCOVERY_TIMEOUT: process.env.FUNCTIONS_DISCOVERY_TIMEOUT || '60000',
  },
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exitCode = result.status ?? 1

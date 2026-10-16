import childProcess from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import process from 'node:process';

// Exercise the real release script without contacting GitHub or publishing assets.
childProcess.execFileSync = (command, arguments_) => {
  if (command !== 'gh' || !process.env.WEBRAD_RELEASE_TEST_CALLS)
    throw new Error('Unexpected release test subprocess.');
  appendFileSync(process.env.WEBRAD_RELEASE_TEST_CALLS, `${JSON.stringify(arguments_)}\n`, 'utf8');
  if (arguments_[0] === 'api') {
    return arguments_[1].endsWith('/releases?per_page=100')
      ? '[]'
      : JSON.stringify({ private: process.env.WEBRAD_RELEASE_TEST_PRIVATE === 'true' });
  }
  if (arguments_[0] === 'release' && arguments_[1] === 'view')
    throw new Error('Release does not exist yet.');
  if (arguments_[0] === 'release' && ['create', 'upload', 'edit'].includes(arguments_[1]))
    return '';
  throw new Error('Unexpected GitHub CLI command.');
};
syncBuiltinESMExports();

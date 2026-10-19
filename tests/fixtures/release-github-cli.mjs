import childProcess from 'node:child_process';
import { appendFileSync, realpathSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import process from 'node:process';

// POSIX subprocesses report the physical cwd. Exercise that behavior on Windows too.
process.chdir(realpathSync(process.cwd()));

// Exercise the real release script without contacting GitHub or publishing assets.
childProcess.execFileSync = (command, arguments_) => {
  if (command !== 'gh' || !process.env.WEBRAD_RELEASE_TEST_CALLS)
    throw new Error('Unexpected release test subprocess.');
  appendFileSync(process.env.WEBRAD_RELEASE_TEST_CALLS, `${JSON.stringify(arguments_)}\n`, 'utf8');
  if (arguments_[0] === 'api') {
    if (arguments_[1].includes('/compare/'))
      return JSON.stringify({
        status: process.env.WEBRAD_RELEASE_TEST_ANCESTRY || 'identical',
        base_commit: {
          sha: process.env.WEBRAD_RELEASE_TEST_TAG_SHA || process.env.GITHUB_SHA,
        },
      });
    if (arguments_[1].includes('/actions/workflows/release.yml/runs?')) {
      if (process.env.WEBRAD_RELEASE_TEST_RUNS_FAILURE) throw new Error('Actions API failed.');
      return (
        process.env.WEBRAD_RELEASE_TEST_RUNS ||
        JSON.stringify([
          {
            workflow_runs: [
              {
                id: 12345,
                status: 'completed',
                conclusion: 'success',
                head_sha: process.env.GITHUB_SHA,
                event: 'push',
                head_branch: 'main',
              },
            ],
          },
        ])
      );
    }
    return arguments_[1].endsWith('/releases?per_page=100')
      ? process.env.WEBRAD_RELEASE_TEST_RELEASES || '[[]]'
      : JSON.stringify({ private: process.env.WEBRAD_RELEASE_TEST_PRIVATE === 'true' });
  }
  if (arguments_[0] === 'release' && arguments_[1] === 'view') {
    if (process.env.WEBRAD_RELEASE_TEST_EXISTING)
      return JSON.stringify({ isDraft: process.env.WEBRAD_RELEASE_TEST_EXISTING === 'draft' });
    throw new Error('Release does not exist yet.');
  }
  if (
    arguments_[0] === 'release' &&
    arguments_[1] === 'upload' &&
    process.env.WEBRAD_RELEASE_TEST_UPLOAD_FAILURE
  )
    throw new Error('Upload failed.');
  if (arguments_[0] === 'release' && ['create', 'upload', 'edit'].includes(arguments_[1]))
    return '';
  throw new Error('Unexpected GitHub CLI command.');
};
syncBuiltinESMExports();

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Buffer } from 'node:buffer';

// Used only by a macOS Actions runner. No signing secrets are embedded in the app.
const run = (arguments_) =>
  execFileSync('/usr/bin/security', arguments_, { stdio: ['ignore', 'pipe', 'pipe'] });
const keychain = path.join(process.env.RUNNER_TEMP, 'webrad-signing.keychain-db');
const certificate = path.join(process.env.RUNNER_TEMP, 'webrad-signing.p12');
try {
  if (process.argv[2] === 'cleanup') {
    await fs.rm(certificate, { force: true });
    try {
      run(['delete-keychain', keychain]);
    } catch {
      /* No imported keychain on unsigned builds. */
    }
  } else if (process.env.APPLE_CERTIFICATE_BASE64) {
    for (const name of [
      'APPLE_CERTIFICATE_PASSWORD',
      'APPLE_SIGNING_IDENTITY',
      'APPLE_ID',
      'APPLE_APP_SPECIFIC_PASSWORD',
      'APPLE_TEAM_ID',
    ]) {
      if (!process.env[name]) throw new Error(`Configure ${name} before enabling macOS signing.`);
    }
    const password = randomBytes(32).toString('hex');
    await fs.writeFile(certificate, Buffer.from(process.env.APPLE_CERTIFICATE_BASE64, 'base64'), {
      mode: 0o600,
    });
    run(['create-keychain', '-p', password, keychain]);
    run(['set-keychain-settings', '-lut', '21600', keychain]);
    run(['unlock-keychain', '-p', password, keychain]);
    run([
      'import',
      certificate,
      '-P',
      process.env.APPLE_CERTIFICATE_PASSWORD,
      '-A',
      '-t',
      'cert',
      '-f',
      'pkcs12',
      '-k',
      keychain,
    ]);
    run([
      'set-key-partition-list',
      '-S',
      'apple-tool:,apple:,codesign:',
      '-s',
      '-k',
      password,
      keychain,
    ]);
    await fs.appendFile(
      process.env.GITHUB_ENV,
      `WEBRAD_MAC_KEYCHAIN=${keychain}\nWEBRAD_MAC_SIGNED=true\n`,
    );
    await fs.rm(certificate, { force: true });
  } else {
    await fs.appendFile(process.env.GITHUB_ENV, 'WEBRAD_MAC_SIGNED=false\n');
    process.stdout.write(
      'Building an unsigned macOS ZIP. Automatic macOS installation requires Developer ID signing.\n',
    );
  }
} catch (error) {
  process.stderr.write(
    `[IDE] macOS signing setup failed${error instanceof Error && !('status' in error) ? `: ${error.message}` : '. Check the certificate and signing credentials.'}\n`,
  );
  process.exitCode = 1;
}

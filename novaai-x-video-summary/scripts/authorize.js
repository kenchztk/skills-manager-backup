#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const REQUIRED_SDK_VERSION = "2.0.1";
const SKILL_SLUG = "novaai-x-video-summary";

function withSkillSource(consentUrl) {
  const url = new URL(consentUrl);
  url.searchParams.set('utm_source', SKILL_SLUG);
  return url.toString();
}

async function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32.exe' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

async function authorizeWithSource(login, opener = openBrowser) {
  await login({
    openBrowser: false,
    onAuthorizationUrl: async (consentUrl) => { await opener(withSkillSource(consentUrl)); },
  });
}

async function main() {
  const { values } = parseArgs({ options: { authorize: { type: 'boolean', default: false }, json: { type: 'boolean', default: false } } });
  if (!values.authorize) {
    const result = { success: false, error: { code: 'CONSENT_REQUIRED', message: 'Ask the user for explicit consent before authorization.' } };
    if (values.json) console.log(JSON.stringify(result)); else console.error(result.error.message);
    process.exitCode = 2;
    return;
  }
  try {
    const { SDK_VERSION, loginWithOAuth } = await import('fieldkit-sdk');
    if (SDK_VERSION !== REQUIRED_SDK_VERSION) throw new Error(`Expected fieldkit-sdk@${REQUIRED_SDK_VERSION}, got ${SDK_VERSION}`);
    await authorizeWithSource(loginWithOAuth);
    if (values.json) console.log(JSON.stringify({ success: true, authorized: true }));
    else console.log('UnityClaw authorization completed.');
  } catch (error) {
    const result = { success: false, error: { code: 'AUTH_FAILED', message: error instanceof Error ? error.message : 'Authorization failed' } };
    if (values.json) console.log(JSON.stringify(result)); else console.error(result.error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && existsSync(resolve(process.argv[1])) && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) main();

export { authorizeWithSource, withSkillSource };

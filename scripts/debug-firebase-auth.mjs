import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

async function main() {
  try {
    // Try to find firebase-tools in npx cache
    console.log('Searching for firebase-tools...');
    const npxCacheBase = path.join(os.homedir(), 'AppData/Local/npm-cache/_npx');
    const items = execSync(`dir "${npxCacheBase}" /b`, { encoding: 'utf8' }).split('\n').map(s => s.trim()).filter(Boolean);
    
    let firetoolsPath = null;
    for (const item of items) {
       const p = path.join(npxCacheBase, item, 'node_modules/firebase-tools');
       try {
           execSync(`dir "${p}"`, { stdio: 'ignore' });
           firetoolsPath = p;
           console.log('Found firetools at:', p);
           break;
       } catch (e) {}
    }

    if (!firetoolsPath) {
       console.error('Could not find firebase-tools in npx cache.');
       process.exit(1);
    }

    const fireauth = require(firetoolsPath + '/lib/auth.js');
    const account = fireauth.getGlobalDefaultAccount();
    const accessToken = account?.tokens?.access_token;
    
    if (accessToken) {
      console.log('SUCCESS: Found access token for', account.user.email);
      console.log('TOKEN:', accessToken.substring(0, 10) + '...');
    } else {
      console.error('No access token found in account.');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();

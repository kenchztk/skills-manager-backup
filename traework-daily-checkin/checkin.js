const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const HP = 16, q8_AES128 = 16, WP = HP, rh = 64, Rv = 32, VP = 64, Em = 6;
const ure = Uint8Array.from([82,9,106,213,48,54,165,56,191,64,163,158,129,243,215,251,124,227,57,130,155,47,255,135,52,142,67,68,196,222,233,203,84,123,148,50,166,194,35,61,238,76,149,11,66,250,195,78,8,46,161,102,40,217,36,178,118,91,162,73,109,139,209,37]);
const dre = Uint8Array.from([31,221,168,51,136,7,199,49,177,18,16,89,39,128,236,95,96,81,127,169,25,181,74,13,45,229,122,159,147,201,156,239,160,224,59,77,174,42,245,176,200,235,187,60,131,83,153,97,23,43,4,126,186,119,214,38,225,105,20,99,85,33,12,125]);

// 签到接口要求携带来源标识，否则返回 code 9004（参数不正确）
const REQ_SOURCE = 1; // 1=Trae CN IDE；2=SOLO/企业版（同账号积分互通，用 1 即可）

async function sha512(data) {
  const h = await crypto.subtle.digest('SHA-512', data);
  return new Uint8Array(h);
}
function xorArrays(a, b, n) {
  const r = new Uint8Array(n);
  for (let i = 0; i < n; i++) r[i] = a[i] ^ b[i];
  return r;
}

async function decrypt(b64) {
  const t = new Uint8Array(Buffer.from(b64, 'base64'));
  const key = t.slice(Em, Em + Rv);
  const sha = await sha512(key);
  const xor = xorArrays(ure, dre, VP);
  const comb = new Uint8Array(rh + VP);
  comb.set(sha, 0);
  comb.set(xor, rh);
  const hash = await sha512(comb);
  const aesKey = hash.slice(0, q8_AES128);
  const iv = hash.slice(q8_AES128, q8_AES128 + WP);
  const ct = t.slice(Rv + Em);
  const ck = await crypto.subtle.importKey('raw', aesKey, { name: 'AES-CBC' }, false, ['decrypt']);
  const dec = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, ck, ct));
  return new TextDecoder().decode(dec.slice(rh));
}

// 跨平台定位 TraeWork 应用数据目录：Windows 用 %APPDATA%，macOS 用 ~/Library/Application Support
function resolveAppDir() {
  if (process.env.APPDATA) return path.join(process.env.APPDATA, 'TRAE SOLO CN');
  return path.join(os.homedir(), 'Library', 'Application Support', 'TRAE SOLO CN');
}

// 设备 ID：优先读 ahanet 配置，其次从客户端日志提取
function loadDeviceId(appDir) {
  try {
    const cfg = path.join(appDir, 'ahanet', 'tt_net_config.config');
    const m = fs.readFileSync(cfg, 'utf8').match(/device_id&#\*(\d+)/);
    if (m) return m[1];
  } catch (e) {}
  try {
    const logsDir = path.join(appDir, 'logs');
    const dirs = fs.readdirSync(logsDir)
      .map(d => path.join(logsDir, d, 'main.log'))
      .filter(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } })
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
      .slice(0, 5);
    for (const p of dirs) {
      const m = fs.readFileSync(p, 'utf8').match(/\[ICDRS\].*?did: (\d+)/);
      if (m) return m[1];
    }
  } catch (e) {}
  return '';
}

async function main() {
  const appDir = resolveAppDir();
  const storagePath = path.join(appDir, 'User', 'globalStorage', 'storage.json');
  if (!fs.existsSync(storagePath)) { console.log(`ERROR: Storage file not found at: ${storagePath}`); return; }
  const storage = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
  const enc = storage['iCubeAuthInfo://icube.cloudide'];
  if (!enc) { console.log('ERROR: No auth data found'); return; }
  const auth = JSON.parse(await decrypt(enc));
  if (!auth.token) { console.log('ERROR: No token in auth data'); return; }

  const headers = {
    'Authorization': `Cloud-IDE-JWT ${auth.token}`,
    'Content-Type': 'application/json',
  };
  const deviceId = loadDeviceId(appDir);
  if (deviceId) headers['x-device-id'] = deviceId;
  if (auth.userRegion?.region) headers['X-User-Region'] = auth.userRegion.region;

  const base = 'https://api.trae.cn/trae/api/v2/ug/checkin_credits';
  const body = JSON.stringify({ req_source: REQ_SOURCE });
  const call = async (action) => {
    const res = await fetch(`${base}/${action}`, { method: 'POST', headers, body });
    const json = await res.json();
    // 兼容 {checked_in:...} 与 {code:0, data:{checked_in:...}} 两种返回格式
    if (json && !('checked_in' in json) && json.data && 'checked_in' in json.data) return json.data;
    return json;
  };

  try {
    const status = await call('status');
    if (status.checked_in) {
      console.log(`Already checked in today. Credits: ${status.credits}`);
      return;
    }
    if (!status.enable) {
      console.log('Check-in is not enabled');
      return;
    }
    const claim = await call('claim');
    if (claim.code === 0) {
      const after = await call('status');
      console.log(`Check-in successful! Credits: ${after.credits ?? status.credits ?? '?'}`);
    } else {
      console.log(`Check-in failed: ${claim.message || JSON.stringify(claim)}`);
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
}

main().catch(e => console.log('Fatal:', e.message));
#!/usr/bin/env node
/** X/Twitter 视频帖子总结与要点提炼 - CLI */

import { mkdirSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';

const SKILL_VERSION = '1.2.5';
const REQUIRED_SDK_VERSION = '1.0.1';
const DEFAULT_TIMEOUT_MS = 900000;
const DEFAULT_RETRIES = 1;

function printHelp() {
  console.log(`
X/Twitter 视频帖子总结与要点提炼 - CLI v${SKILL_VERSION}

Usage:
  node scripts/generate.js --url "https://www.youtube.com/watch?v=..."
  node scripts/generate.js --url "https://www.douyin.com/video/..." --json --output-dir ./tasks

Parameters:
  --api-key          API Key supplied in the current Agent session; overrides UNITYCLAW_KEY
  --url, -u       HTTP(S) media URL to analyze (required)
  --output-dir    Task output directory (default: "./tasks")
  --timeout       Request timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})
  --retries       Retries for transient failures, from 0 to 3 (default: ${DEFAULT_RETRIES})
  --json          Print one machine-readable JSON result
  --help, -h      Show this help

Output:
  media-analysis.json containing the full summary and subtitle returned by the service
`);
}

function parseInteger(value, name, minimum, maximum) {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  const number = Number(value);
  if (number < minimum || number > maximum) throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  return number;
}

function normalizeUrl(input) {
  const value = String(input || '').trim();
  if (!value) throw new Error('--url is required and cannot be blank');
  let url;
  try { url = new URL(value); } catch { throw new Error('--url must be a valid HTTP(S) URL'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('--url must use HTTP or HTTPS');
  return url.toString();
}

function detectPlatform(url) {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'youtu.be' || host.endsWith('youtube.com')) return 'youtube';
  if (host.endsWith('tiktok.com')) return 'tiktok';
  if (host.endsWith('douyin.com')) return 'douyin';
  if (host.endsWith('xiaohongshu.com')) return 'xiaohongshu';
  if (host.endsWith('bilibili.com') || host === 'b23.tv') return 'bilibili';
  if (host.endsWith('weixin.qq.com') || host === 'finder.video.qq.com') return 'wechat-channels';
  if (host.endsWith('instagram.com')) return 'instagram-reels';
  if (host.endsWith('vimeo.com')) return 'vimeo';
  if (host.endsWith('twitter.com') || host === 'x.com' || host.endsWith('.x.com')) return 'x';
  return 'direct-or-other';
}

function validateAnalysisData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The media-analysis response is not an object');
  const summary = typeof data.summary === 'string' ? data.summary : '';
  const subtitle = typeof data.subtitle === 'string' ? data.subtitle : '';
  if (!summary.trim() && !subtitle.trim()) throw new Error('The media-analysis response contains neither summary nor subtitle');
  const warnings = [];
  if (!summary.trim()) warnings.push('summary is empty');
  if (!subtitle.trim()) warnings.push('subtitle is empty');
  return { data, summary, subtitle, warnings };
}

function saveArtifact(taskFolder, artifact) {
  if (!taskFolder) throw new Error('The SDK result did not provide a task folder');
  const folder = resolve(taskFolder);
  mkdirSync(folder, { recursive: true });
  const resultPath = join(folder, 'media-analysis.json');
  writeFileSync(resultPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  const stats = statSync(resultPath);
  if (!stats.isFile() || stats.size === 0) throw new Error(`Failed to save media-analysis result: ${resultPath}`);
  return { resultPath, resultBytes: stats.size };
}

function errorText(value) { try { return typeof value === 'string' ? value : JSON.stringify(value); } catch { return String(value); } }
function isRetryable(value) { return /ECONNRESET|ECONNABORTED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network|timed?\s*out|\b429\b|\b502\b|\b503\b|\b504\b|temporar(?:y|ily) unavailable/i.test(errorText(value)); }
function getFailureMessage(result) { return result?.response?.msg || [...(result?.logs || [])].reverse().find((log) => log.level === 'error')?.message || 'Media analysis failed'; }
const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

function emitFailure({ json, code, message, retryable = false, attempts = 0, outputDir, result }) {
  const payload = { success: false, error: { code, message, retryable }, attempts, outputDir, taskId: result?.taskId, taskFolder: result?.taskFolder, logs: result?.logs };
  if (json) console.log(JSON.stringify(payload));
  else {
    console.error(`\x1b[31mError: ${message}\x1b[0m`);
    if (result?.taskFolder) console.error(`Task Folder: ${result.taskFolder}`);
  }
  process.exitCode = 1;
}

function resolveApiKey(explicitApiKey, environment = process.env) {
  const directKey = String(explicitApiKey ?? '').trim();
  if (directKey) return directKey;
  return String(environment.UNITYCLAW_KEY ?? '').trim();
}

async function main() {
  let values;
  try {
    ({ values } = parseArgs({ options: {
      'api-key': { type: 'string', default: '' },
      url: { type: 'string', short: 'u', default: '' },
      'output-dir': { type: 'string', default: './tasks' },
      timeout: { type: 'string', default: String(DEFAULT_TIMEOUT_MS) },
      retries: { type: 'string', default: String(DEFAULT_RETRIES) },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    }, allowPositionals: false }));
  } catch (error) {
    emitFailure({ json: process.argv.includes('--json'), code: 'INVALID_ARGUMENTS', message: error.message });
    return;
  }
  if (values.help) { printHelp(); return; }

  const json = values.json;
  const explicitApiKey = values['api-key'].trim();
  const rawOutputDir = values['output-dir'].trim();
  let sourceUrl;
  let timeout;
  let retries;
  try {
    sourceUrl = normalizeUrl(values.url);
    if (!rawOutputDir) throw new Error('--output-dir cannot be blank');
    timeout = parseInteger(values.timeout, '--timeout', 1000, 3600000);
    retries = parseInteger(values.retries, '--retries', 0, 3);
  } catch (error) {
    emitFailure({ json, code: 'VALIDATION_ERROR', message: error.message });
    return;
  }
  const platform = detectPlatform(sourceUrl);
  if (platform !== "x") {
    emitFailure({ json, code: 'PLATFORM_MISMATCH', message: 'URL must point to X/Twitter video content', });
    return;
  }
  const outputDir = resolve(rawOutputDir);
  try { mkdirSync(outputDir, { recursive: true }); } catch (error) {
    emitFailure({ json, code: 'OUTPUT_DIR_ERROR', message: `Cannot create output directory ${outputDir}: ${error.message}`, outputDir });
    return;
  }
  const apiKey = resolveApiKey(explicitApiKey);
  if (!apiKey) {
    emitFailure({ json, code: 'MISSING_API_KEY', message: 'No API key was provided. Pass --api-key with a Key supplied in the current Agent session, or set UNITYCLAW_KEY. Get an API key at https://unityclaw.com?utm_source=novaai-x-video-summary, then retry.', outputDir });
    return;
  }

  let UnityClawClient;
  let SDK_VERSION;
  try { ({ UnityClawClient, SDK_VERSION } = await import('fieldkit-sdk')); } catch {
    emitFailure({ json, code: 'SDK_NOT_FOUND', message: 'fieldkit-sdk is not installed. Run: npm install fieldkit-sdk@1.0.1', outputDir });
    return;
  }
  if (SDK_VERSION !== REQUIRED_SDK_VERSION) {
    emitFailure({ json, code: 'SDK_VERSION_ERROR', message: `Installed SDK version ${SDK_VERSION} does not match required version ${REQUIRED_SDK_VERSION}. Install with: npm install fieldkit-sdk@${REQUIRED_SDK_VERSION}`, outputDir });
    return;
  }

  if (!json) {
    console.log(`\x1b[36mX/Twitter 视频帖子总结与要点提炼 v${SKILL_VERSION}\x1b[0m\n`);
    console.log(`\x1b[32m✓ SDK version ${SDK_VERSION} (required: ${REQUIRED_SDK_VERSION})\x1b[0m`);
    console.log(`URL: ${sourceUrl}\nPlatform: ${platform}\nOutput Directory: ${outputDir}\n`);
  }

  const client = new UnityClawClient({ apiKey, taskDir: outputDir, timeout, source: "novaai-x-video-summary" });
  let lastResult;
  let lastError;
  const maximumAttempts = retries + 1;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    if (!json) console.log(`\x1b[33mAnalyzing media (attempt ${attempt}/${maximumAttempts})...\x1b[0m`);
    try {
      const result = await client.media.analyze({ url: [{ link: sourceUrl }] });
      lastResult = result;
      if (result.success && result.response?.data) {
        try {
          const validated = validateAnalysisData(result.response.data);
          const artifact = { sourceUrl, platform, summary: validated.summary, subtitle: validated.subtitle, warnings: validated.warnings };
          const saved = saveArtifact(result.taskFolder, artifact);
          const payload = { success: true, attempts: attempt, taskId: result.taskId, taskFolder: result.taskFolder, duration: result.duration, outputDir, resultPath: saved.resultPath, resultBytes: saved.resultBytes, ...artifact };
          if (json) console.log(JSON.stringify(payload));
          else {
            console.log(`\n\x1b[32m✓ Analysis completed\x1b[0m\nResult File: ${saved.resultPath}`);
            if (validated.summary) console.log(`\nSummary:\n${validated.summary.slice(0, 1000)}${validated.summary.length > 1000 ? '…' : ''}`);
            if (validated.subtitle) console.log(`\nSubtitle:\n${validated.subtitle.slice(0, 1000)}${validated.subtitle.length > 1000 ? '…' : ''}`);
          }
          return;
        } catch (error) {
          emitFailure({ json, code: 'OUTPUT_VALIDATION_ERROR', message: error.message, attempts: attempt, outputDir, result });
          return;
        }
      }
      lastError = new Error(getFailureMessage(result));
    } catch (error) { lastError = error; }
    const retryable = isRetryable(lastError) || isRetryable(lastResult);
    if (!retryable || attempt === maximumAttempts) {
      emitFailure({ json, code: retryable ? 'TRANSIENT_ERROR' : 'ANALYSIS_ERROR', message: lastError?.message || 'Media analysis failed', retryable, attempts: attempt, outputDir, result: lastResult });
      return;
    }
    await sleep(1000 * attempt);
  }
}

const isDirectExecution = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) main().catch((error) => emitFailure({ json: process.argv.includes('--json'), code: 'UNEXPECTED_ERROR', message: error.message, retryable: isRetryable(error) }));

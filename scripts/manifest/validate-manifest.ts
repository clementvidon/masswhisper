import process from 'node:process';
import {
  readTopicManifest,
  validateTopicManifestRules,
} from './core/topic-manifest.js';
import { validateLocalTopicBundles } from './core/topic-bundles.js';

const manifestPath = process.argv[2];
const topicConfigDir = process.argv[3];

if (!manifestPath) {
  throw new Error('Usage: validate-manifest <manifest-path> [topic-config-dir]');
}

const manifest = readTopicManifest(manifestPath);
validateTopicManifestRules(manifest);

if (topicConfigDir) {
  validateLocalTopicBundles(manifest, topicConfigDir);
} else {
  console.warn('No topic config directory provided; skipping local bundle validation.');
}

console.log(`Manifest valid: ${manifestPath}`);
console.log(`topic_slug=${manifest.topic_slug}`);
console.log(`environment=${manifest.environment}`);

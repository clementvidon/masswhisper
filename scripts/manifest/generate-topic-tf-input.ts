import process from 'node:process';
import {
  readTopicManifest,
  validateTopicManifestRules,
} from './core/topic-manifest.js';
import { validateLocalTopicBundles } from './core/topic-bundles.js';
import {
  deriveTerraformInput,
  getTerraformVarFilePath,
  writeTerraformInputFile,
} from './core/terraform-input.js';

const manifestPath = process.argv[2];
const topicConfigDir = process.argv[3];

if (!manifestPath) {
  throw new Error(
    'Usage: generate-topic-tf-input <manifest-path> [topic-config-dir]',
  );
}

const manifest = readTopicManifest(manifestPath);
validateTopicManifestRules(manifest);

if (topicConfigDir) {
  validateLocalTopicBundles(manifest, topicConfigDir);
} else {
  console.warn('No topic config directory provided; skipping local bundle validation.');
}

const tfInput = deriveTerraformInput(manifest);
const targetPath = getTerraformVarFilePath(manifest);

writeTerraformInputFile(targetPath, tfInput);
console.log(`Generated: ${targetPath}`);

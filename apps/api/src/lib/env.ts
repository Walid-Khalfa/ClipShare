import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const envFiles = ['.env.local', '.env'];

function parseEnvFile(filePath: string): void {
  const fileContent = readFileSync(filePath, 'utf8');

  for (const rawLine of fileContent.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const normalizedLine = line.startsWith('export ') ? line.slice(7) : line;
    const separatorIndex = normalizedLine.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();
    if (!key) {
      continue;
    }

    let value = normalizedLine.slice(separatorIndex + 1).trim();
    const wrappedInQuotes =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));

    if (wrappedInQuotes) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadEnvFiles(): void {
  const nodeLoadEnvFile = (process as NodeJS.Process & {
    loadEnvFile?: (path?: string) => void;
  }).loadEnvFile;

  for (const envFileName of envFiles) {
    const envFilePath = resolve(appRoot, envFileName);
    if (!existsSync(envFilePath)) {
      continue;
    }

    if (nodeLoadEnvFile) {
      nodeLoadEnvFile(envFilePath);
      continue;
    }

    parseEnvFile(envFilePath);
  }
}

loadEnvFiles();

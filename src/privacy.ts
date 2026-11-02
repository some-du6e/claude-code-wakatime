import * as fs from 'fs';
import * as path from 'path';
import { Options } from './options';
import { Input } from './types';
import { getLastFile, getToolFile } from './utils';

// Same keys as codex-wakatime's privacy layer, so one ~/.wakatime.cfg covers both.
export type Heartbeat = {
  entity: string;
  entityType: 'file' | 'app';
  project?: string;
  projectFolder?: string;
};

function isUnderRoot(value: string | undefined, root: string): boolean {
  if (!value) return false;
  const relative = path.relative(root, path.resolve(value));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function getSetting(options: Options, env: string, key: string): string | undefined {
  return process.env[env] ?? options.getSetting('settings', key);
}

export function buildHeartbeat(options: Options, inp: Input): Heartbeat {
  // File-less events (prompts, Bash, ...) keep crediting the last file this session touched
  const filePath = getToolFile(inp) ?? getLastFile(inp);
  const heartbeat: Heartbeat =
    filePath
      ? { entity: filePath, entityType: 'file', projectFolder: inp.cwd }
      : // Not the cwd: Hackatime would list the folder (e.g. a worktree path) as a file
        { entity: 'Claude Code', entityType: 'app', projectFolder: inp.cwd };

  const root = getSetting(options, 'CODEX_WAKATIME_PRIVACY_ROOT', 'codex_wakatime_privacy_root');
  const project = getSetting(options, 'CODEX_WAKATIME_PRIVACY_PROJECT', 'codex_wakatime_privacy_project');
  if (!root || !project) return heartbeat;

  const resolvedRoot = path.resolve(root);
  if (!isUnderRoot(heartbeat.entity, resolvedRoot) && !isUnderRoot(inp.cwd, resolvedRoot)) return heartbeat;

  const entityRoot = path.resolve(getSetting(options, 'CODEX_WAKATIME_PRIVACY_ENTITY_ROOT', 'codex_wakatime_privacy_entity_root') ?? resolvedRoot);
  const ext = (heartbeat.entityType === 'file' && path.extname(heartbeat.entity)) || '.txt';
  const entity = path.join(entityRoot, `vague_file${ext}`);

  // wakatime-cli skips file entities that don't exist on disk.
  try {
    fs.mkdirSync(entityRoot, { recursive: true });
    fs.writeFileSync(entity, 'Claude Code activity placeholder.\n', { flag: 'wx' });
  } catch {}

  return { entity, entityType: 'file', project, projectFolder: resolvedRoot };
}

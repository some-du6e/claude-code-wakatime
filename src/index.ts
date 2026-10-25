#!/usr/bin/env node

import { execFile } from 'child_process';
import { promisify } from 'util';
import { Options } from './options';
import { VERSION } from './version';
import { Dependencies } from './dependencies';
import { logger, LogLevel } from './logger';
import { Input } from './types';
import { buildHeartbeat } from './privacy';
import { buildOptions, formatArguments, getClaudeVersion, parseInput, shouldSendHeartbeat, updateState } from './utils';

const options = new Options();
const deps = new Dependencies(options, logger);
const execFileAsync = promisify(execFile);

async function sendHeartbeat(inp: Input | undefined): Promise<boolean> {
  const claudeVersion = await getClaudeVersion(inp);

  const wakatime_cli = deps.getCliLocation();

  const plugin = `claude-code/${claudeVersion} claude-code-wakatime/${VERSION}`;
  const heartbeat = buildHeartbeat(options, inp!);
  const args: string[] = ['--entity', heartbeat.entity, '--entity-type', heartbeat.entityType, '--category', 'ai coding', '--plugin', plugin];
  if (heartbeat.projectFolder) args.push('--project-folder', heartbeat.projectFolder);
  if (heartbeat.project) args.push('--project', heartbeat.project);
  if (inp?.hook_event_name === 'PostToolUse' && ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(inp.tool_name ?? '')) {
    args.push('--write');
  }

  logger.debug(`Sending heartbeat: ${formatArguments(wakatime_cli, args)}`);

  const execOptions = buildOptions();
  try {
    const { stdout, stderr } = await execFileAsync(wakatime_cli, args, execOptions);
    const output = stdout.toString().trim() + stderr.toString().trim();
    if (output) logger.error(output);
  } catch (e) {
    if (e) logger.error(e.toString());
  }

  return true;
}

async function main() {
  const inp = parseInput();

  const debug = options.getSetting('settings', 'debug');
  logger.setLevel(debug === 'true' ? LogLevel.DEBUG : LogLevel.INFO);

  try {
    if (inp) logger.debug(JSON.stringify(inp, null, 2));

    await new Promise<void>((resolve) => deps.checkAndInstallCli(resolve));

    if (shouldSendHeartbeat(inp)) {
      if (await sendHeartbeat(inp)) {
        await updateState(inp);
      }
    }
  } catch (err) {
    logger.errorException(err);
  }
}

main();

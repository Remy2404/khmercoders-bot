import { Context } from 'hono';
import { TelegramMessage } from '../types/telegram';
import { processPingCommand } from './ping';
import { processHelpCommand } from './help';
import { processSummaryCommand } from './summary';
import { processLinkCommand } from './link';

export interface Command {
  name: string;
  process: (
    c: Context<{ Bindings: CloudflareBindings }>,
    message: TelegramMessage,
    botToken: string
  ) => Promise<void>;
  isMatch: (text?: string) => boolean;
}

export const commands: Command[] = [
  {
    name: 'ping',
    process: processPingCommand,
    isMatch: text => text?.startsWith('/ping') ?? false,
  },
  {
    name: 'help',
    process: processHelpCommand,
    isMatch: text => text?.startsWith('/help') ?? false,
  },
  {
    name: 'summary',
    process: processSummaryCommand,
    isMatch: text => text?.startsWith('/summary') ?? false,
  },
  {
    name: 'link',
    process: processLinkCommand,
    isMatch: text => text?.startsWith('/link') ?? false,
  },
];

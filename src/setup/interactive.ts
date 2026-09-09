import { createInterface } from 'node:readline';

const rl = createInterface({ input: process.stdin, output: process.stdout });

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer.trim()));
  });
}

function questionWithDefault(prompt: string, defaultValue: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      const trimmed = answer.trim();
      resolve(trimmed || defaultValue);
    });
  });
}

function selectMultiple(prompt: string, options: string[]): Promise<string[]> {
  return new Promise((resolve) => {
    const selected = new Set<number>();
    const render = () => {
      console.log(`\n${prompt}`);
      options.forEach((opt, i) => {
        const marker = selected.has(i) ? '◉' : '◯';
        console.log(`  ${marker} ${opt}`);
      });
      console.log('\n(输入数字切换选择，a 全选，回车确认)');
    };

    render();

    const onLine = (line: string) => {
      const input = line.trim().toLowerCase();
      if (input === '') {
        rl.removeListener('line', onLine);
        const result = [...selected].sort().map((i) => options[i]);
        resolve(result.length > 0 ? result : options);
        return;
      }
      if (input === 'a') {
        if (selected.size === options.length) {
          selected.clear();
        } else {
          options.forEach((_, i) => selected.add(i));
        }
        render();
        return;
      }
      const num = parseInt(input, 10);
      if (!isNaN(num) && num >= 1 && num <= options.length) {
        const idx = num - 1;
        if (selected.has(idx)) {
          selected.delete(idx);
        } else {
          selected.add(idx);
        }
        render();
        return;
      }
      render();
    };

    rl.on('line', onLine);
  });
}

function confirm(prompt: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === '' || trimmed === 'y' || trimmed === 'yes');
    });
  });
}

export interface SetupAnswers {
  token: string;
  host: string;
  securityMode: string;
  defaultTeam: string;
  defaultProject: string;
  urlPrefix: string;
  editors: string[];
}

export async function runInteractiveSetup(): Promise<SetupAnswers> {
  console.log('\n🔧 ApiPost MCP 交互式配置\n');

  const token = await question('? ApiPost Token: ');
  if (!token) {
    console.error('❌ Token 不能为空');
    process.exit(1);
  }

  const host = await questionWithDefault(
    '? ApiPost Host (默认 https://open.apipost.net): ',
    'https://open.apipost.net',
  );

  const securityMode = await questionWithDefault(
    '? 安全模式 readonly/limited/full (默认 limited): ',
    'limited',
  );

  const defaultTeam = await question('? 默认团队名称 (可选，回车跳过): ');
  const defaultProject = await question('? 默认项目名称 (可选，回车跳过): ');
  const urlPrefix = await question('? URL 前缀 (可选，如 {{host}}，回车跳过): ');

  const editorNames = [
    'Claude Code',
    'Cursor',
    'Codex',
    'Windsurf',
    'Trae',
    'Qoder',
    'WorkBuddy',
  ];
  const selected = await selectMultiple('? 选择要配置的编辑器:', editorNames);

  const editorMap: Record<string, string> = {
    'Claude Code': 'claude-code',
    Cursor: 'cursor',
    Codex: 'codex',
    Windsurf: 'windsurf',
    Trae: 'trae',
    Qoder: 'qoder',
    WorkBuddy: 'workbuddy',
  };

  const editors = selected.map((name) => editorMap[name]).filter(Boolean);

  return { token, host, securityMode, defaultTeam, defaultProject, urlPrefix, editors };
}

export async function confirmStartTest(): Promise<boolean> {
  return confirm('\n? 是否启动 MCP Server 测试连接? (Y/n) ');
}

export async function confirmDanger(prompt: string): Promise<boolean> {
  return new Promise((resolve) => {
    // stdin EOF（非 TTY / 管道输入）时 readline 触发 close 而 question 回调不执行，兜底按“取消”处理避免挂起
    const onClose = () => resolve(false);
    rl.once('close', onClose);
    rl.question(prompt, (answer) => {
      rl.removeListener('close', onClose);
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === 'y' || trimmed === 'yes');
    });
  });
}

export function closeReadline(): void {
  rl.close();
}

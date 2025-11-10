#!/usr/bin/env ts-node

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface ProcessConfig {
  name: string;
  script: string;
  args?: string[];
  cwd?: string;
  maxRestarts?: number;
  restartDelay?: number;
}

interface ProcessInfo extends ProcessConfig {
  pid?: number;
  status: 'running' | 'stopped' | 'errored' | 'restarting';
  restartCount: number;
  startTime?: string;  // 改为字符串以便序列化
  lastRestartTime?: string;
}

class ProcessManager {
  private processes: Map<string, ProcessInfo> = new Map();
  private stateDir: string = path.join(os.homedir(), '.pm-manager');
  private stateFile: string = path.join(this.stateDir, 'processes.json');
  private logDir: string = path.join(this.stateDir, 'logs');

  constructor() {
    this.ensureDirs();
    this.loadState();
  }

  private ensureDirs() {
    [this.stateDir, this.logDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  // 保存状态到文件
  private saveState() {
    const data: Record<string, ProcessInfo> = {};
    this.processes.forEach((info, name) => {
      data[name] = {
        ...info,
        // 移除 childProcess 引用
      };
    });
    fs.writeFileSync(this.stateFile, JSON.stringify(data, null, 2));
  }

  // 从文件加载状态
  private loadState() {
    if (fs.existsSync(this.stateFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.stateFile, 'utf-8'));
        Object.entries(data).forEach(([name, info]) => {
          this.processes.set(name, info as ProcessInfo);
        });
      } catch (error) {
        console.error('Failed to load state:', error);
      }
    }
  }

  // 检查进程是否真的在运行
  private isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);  // 发送信号 0 只检查进程是否存在
      return true;
    } catch (e) {
      return false;
    }
  }

  // 更新进程状态
  private updateProcessStatus() {
    this.processes.forEach((info, name) => {
      if (info.pid && !this.isProcessRunning(info.pid)) {
        info.status = 'stopped';
        info.pid = undefined;
      }
    });
    this.saveState();
  }

  private log(name: string, message: string, type: 'stdout' | 'stderr' | 'info' = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type}] ${message}\n`;

    const logFile = path.join(this.logDir, `${name}.log`);
    fs.appendFileSync(logFile, logMessage);
  }

  start(config: ProcessConfig): boolean {
    const { name, script, args = [], cwd = process.cwd(), maxRestarts = 10, restartDelay = 1000 } = config;

    // 检查是否已存在且运行中
    if (this.processes.has(name)) {
      const processInfo = this.processes.get(name)!;
      if (processInfo.pid && this.isProcessRunning(processInfo.pid)) {
        console.log(`Process "${name}" is already running (PID: ${processInfo.pid})`);
        return false;
      }
    }

    const processInfo: ProcessInfo = {
      name,
      script,
      args,
      cwd,
      maxRestarts,
      restartDelay,
      status: 'running',
      restartCount: 0,
      startTime: new Date().toISOString(),
    };

    this.processes.set(name, processInfo);
    this.startProcessDetached(name);
    this.saveState();
    return true;
  }

  // 以分离模式启动进程（后台运行）
  private startProcessDetached(name: string) {
    const processInfo = this.processes.get(name);
    if (!processInfo) return;

    this.log(name, `Starting process in ${processInfo.cwd}: ${processInfo.script} ${processInfo.args?.join(' ') || ''}`, 'info');

    const logFile = path.join(this.logDir, `${name}.log`);
    const outStream = fs.openSync(logFile, 'a');
    const errStream = fs.openSync(logFile, 'a');

    try {
      // detached: true 让进程在后台独立运行
      // stdio: 重定向到文件
      const child = spawn(processInfo.script, processInfo.args || [], {
        cwd: processInfo.cwd,
        detached: true,  // 关键：分离进程
        stdio: ['ignore', outStream, errStream],
        shell: true,
      });

      processInfo.pid = child.pid;
      processInfo.status = 'running';

      // 保存 PID 以便后续管理
      this.saveState();

      // 分离进程，使其不依赖父进程
      child.unref();

      console.log(`[${name}] Process started with PID: ${child.pid}`);
      this.log(name, `Process started with PID: ${child.pid}`, 'info');

      // 关闭文件描述符
      fs.closeSync(outStream);
      fs.closeSync(errStream);

    } catch (error: any) {
      console.error(`Failed to start process "${name}":`, error.message);
      this.log(name, `Failed to start: ${error.message}`, 'stderr');
      processInfo.status = 'errored';
      this.saveState();

      fs.closeSync(outStream);
      fs.closeSync(errStream);
    }
  }

  stop(name: string): boolean {
    this.updateProcessStatus();

    const processInfo = this.processes.get(name);
    if (!processInfo) {
      console.log(`Process "${name}" not found`);
      return false;
    }

    if (!processInfo.pid) {
      console.log(`Process "${name}" is not running`);
      return false;
    }

    if (!this.isProcessRunning(processInfo.pid)) {
      console.log(`Process "${name}" is not running (PID ${processInfo.pid} not found)`);
      processInfo.status = 'stopped';
      processInfo.pid = undefined;
      this.saveState();
      return false;
    }

    try {
      this.log(name, 'Stopping process...', 'info');
      console.log(`Stopping process "${name}" (PID: ${processInfo.pid})...`);

      // 发送 SIGTERM
      process.kill(processInfo.pid, 'SIGTERM');

      // 等待 5 秒后检查是否还在运行
      setTimeout(() => {
        if (processInfo.pid && this.isProcessRunning(processInfo.pid)) {
          console.log(`Force killing process "${name}" (PID: ${processInfo.pid})`);
          try {
            process.kill(processInfo.pid, 'SIGKILL');
          } catch (e) {
            // 进程可能已经退出
          }
        }
        processInfo.status = 'stopped';
        processInfo.pid = undefined;
        this.saveState();
      }, 5000);

      return true;
    } catch (error: any) {
      console.error(`Failed to stop process "${name}":`, error.message);
      return false;
    }
  }

  restart(name: string): boolean {
    const processInfo = this.processes.get(name);
    if (!processInfo) {
      console.log(`Process "${name}" not found`);
      return false;
    }

    if (processInfo.pid) {
      this.stop(name);
      setTimeout(() => {
        processInfo.restartCount = 0;
        this.startProcessDetached(name);
      }, 2000);
    } else {
      processInfo.restartCount = 0;
      this.startProcessDetached(name);
    }

    return true;
  }

  delete(name: string): boolean {
    if (this.processes.has(name)) {
      const processInfo = this.processes.get(name)!;
      if (processInfo.pid && this.isProcessRunning(processInfo.pid)) {
        this.stop(name);
      }
    }

    this.processes.delete(name);
    this.saveState();
    console.log(`Process "${name}" deleted`);
    return true;
  }

  list(): void {
    this.updateProcessStatus();

    if (this.processes.size === 0) {
      console.log('No processes registered');
      return;
    }

    console.log('\n========================================================================');
    console.log('  Process Manager Status');
    console.log(`  State file: ${this.stateFile}`);
    console.log('========================================================================');
    console.log('Name          | PID    | Status    | Restarts | Uptime');
    console.log('------------------------------------------------------------------------');

    this.processes.forEach((info) => {
      const uptime = info.startTime
        ? this.formatUptime(Date.now() - new Date(info.startTime).getTime())
        : 'N/A';

      const name = info.name.padEnd(13).substring(0, 13);
      const pid = (info.pid?.toString() || 'N/A').padEnd(6).substring(0, 6);
      const status = info.status.padEnd(9).substring(0, 9);
      const restarts = `${info.restartCount}/${info.maxRestarts || 10}`.padEnd(8).substring(0, 8);
      const uptimeStr = uptime.padEnd(20).substring(0, 20);

      console.log(`${name} | ${pid} | ${status} | ${restarts} | ${uptimeStr}`);

      // 显示工作目录和命令
      const workDir = info.cwd || process.cwd();
      const displayDir = workDir.length > 60 ? '...' + workDir.slice(-57) : workDir;
      console.log(`  CWD: ${displayDir}`);

      const cmd = `${info.script} ${info.args?.join(' ') || ''}`;
      const displayCmd = cmd.length > 60 ? cmd.substring(0, 57) + '...' : cmd;
      console.log(`  CMD: ${displayCmd}`);
      console.log('------------------------------------------------------------------------');
    });

    console.log('========================================================================\n');
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  logs(name: string, lines: number = 50, follow: boolean = false): void {
    const logFile = path.join(this.logDir, `${name}.log`);

    if (!fs.existsSync(logFile)) {
      console.log(`No logs found for "${name}"`);
      return;
    }

    if (follow) {
      // 实时跟踪日志
      console.log(`\n=== Following logs for "${name}" (Ctrl+C to exit) ===\n`);

      const tail = spawn('tail', ['-f', '-n', lines.toString(), logFile], {
        stdio: 'inherit',
      });

      process.on('SIGINT', () => {
        tail.kill();
        process.exit(0);
      });
    } else {
      const content = fs.readFileSync(logFile, 'utf-8');
      const logLines = content.split('\n').filter(line => line.trim());
      const displayLines = logLines.slice(-lines);

      console.log(`\n=== Logs for "${name}" (last ${lines} lines) ===\n`);
      displayLines.forEach(line => console.log(line));
    }
  }

  stopAll(): void {
    this.updateProcessStatus();

    this.processes.forEach((info, name) => {
      if (info.pid && this.isProcessRunning(info.pid)) {
        this.stop(name);
      }
    });
  }

  // 清理已停止的进程
  cleanup(): void {
    this.updateProcessStatus();

    const toDelete: string[] = [];
    this.processes.forEach((info, name) => {
      if (info.status === 'stopped' && !info.pid) {
        toDelete.push(name);
      }
    });

    toDelete.forEach(name => {
      this.processes.delete(name);
      console.log(`Cleaned up stopped process: ${name}`);
    });

    this.saveState();
  }
}

// CLI Interface
function main() {
  const pm = new ProcessManager();
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'start':
      if (args.length < 3) {
        console.log('Usage: ts-node 1.ts start <name> <script> [args...] [--cwd <directory>]');
        process.exit(1);
      }

      // 解析参数和选项
      const startArgs = args.slice(1);
      let cwd: string | undefined;
      let cmdArgs: string[] = [];

      // 查找 --cwd 参数
      const cwdIndex = startArgs.indexOf('--cwd');
      if (cwdIndex !== -1 && startArgs[cwdIndex + 1]) {
        cwd = path.resolve(startArgs[cwdIndex + 1]);
        // 移除 --cwd 及其值
        cmdArgs = [...startArgs.slice(0, cwdIndex), ...startArgs.slice(cwdIndex + 2)];
      } else {
        cmdArgs = startArgs;
      }

      pm.start({
        name: cmdArgs[0],
        script: cmdArgs[1],
        args: cmdArgs.slice(2),
        cwd,
      });
      break;

    case 'stop':
      if (args.length < 2) {
        console.log('Usage: ts-node 1.ts stop <name>');
        process.exit(1);
      }
      pm.stop(args[1]);
      break;

    case 'restart':
      if (args.length < 2) {
        console.log('Usage: ts-node 1.ts restart <name>');
        process.exit(1);
      }
      pm.restart(args[1]);
      break;

    case 'delete':
    case 'del':
      if (args.length < 2) {
        console.log('Usage: ts-node 1.ts delete <name>');
        process.exit(1);
      }
      pm.delete(args[1]);
      break;

    case 'list':
    case 'ls':
      pm.list();
      break;

    case 'logs':
      if (args.length < 2) {
        console.log('Usage: ts-node 1.ts logs <name> [lines] [-f]');
        process.exit(1);
      }
      const follow = args.includes('-f') || args.includes('--follow');
      const logLines = parseInt(args[2]) || 50;
      pm.logs(args[1], logLines, follow);
      break;

    case 'stop-all':
      pm.stopAll();
      break;

    case 'cleanup':
      pm.cleanup();
      break;

    default:
      console.log(`
Process Manager - Like PM2 (Persistent Edition)

Commands:
  start <name> <script> [args...] [--cwd <dir>]  Start a new process (runs in background)
  stop <name>                                    Stop a running process
  restart <name>                                 Restart a process
  delete <name>                                  Delete a process
  list                                           List all processes
  logs <name> [lines] [-f]                       Show process logs (use -f to follow)
  stop-all                                       Stop all processes
  cleanup                                        Remove stopped processes from list

Examples:
  # 基本用法 - 进程在后台运行
  ts-node 1.ts start app node server.js
  ts-node 1.ts start api "npm run dev"

  # 多项目管理 - 在不同目录执行相同命令
  ts-node 1.ts start project1 "vite dev" --cwd /path/to/project1
  ts-node 1.ts start project2 "vite dev" --cwd /path/to/project2

  # 查看所有进程（可以在任何终端窗口执行）
  ts-node 1.ts list

  # 查看日志
  ts-node 1.ts logs project1
  ts-node 1.ts logs project1 100 -f  # 实时跟踪日志

  # 停止进程
  ts-node 1.ts stop project1

  # 清理已停止的进程
  ts-node 1.ts cleanup

Features:
  ✓ 进程在后台运行，不依赖当前终端
  ✓ 进程状态持久化，可在任何终端查看
  ✓ 支持多项目管理（通过 --cwd 参数）
  ✓ 自动检测进程状态
  ✓ 日志自动记录到文件

State files:
  ~/.pm-manager/processes.json  # 进程状态
  ~/.pm-manager/logs/           # 日志目录
      `);
      break;
  }
}

if (require.main === module) {
  main();
}

export { ProcessManager, ProcessConfig, ProcessInfo };

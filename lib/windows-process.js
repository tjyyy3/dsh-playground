import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

// The helper owns the job's only handle. The CLI starts suspended so it cannot create a child
// before joining the job. It stays alive until the job is empty, so taskkill can always close the
// job without looking up an exited CLI's PID. Its receipt preserves that CLI's own exit code.
const supervisor = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $launch = $env:PLAYGROUND_CLI_LAUNCH | ConvertFrom-Json
  [Environment]::SetEnvironmentVariable('PLAYGROUND_CLI_LAUNCH', $null, 'Process')
  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

public static class PlaygroundCliJob {
  [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
    public long ProcessTime, JobTime; public uint Flags; public UIntPtr Min, Max;
    public uint Active; public UIntPtr Affinity; public uint Priority, Scheduling;
  }
  [StructLayout(LayoutKind.Sequential)] struct IoCounters {
    public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
  }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
    public BasicLimits Basic; public IoCounters Io;
    public UIntPtr ProcessMemory, JobMemory, PeakProcess, PeakJob;
  }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct StartupInfo {
    public int Size; public string Reserved, Desktop, Title;
    public int X, Y, XSize, YSize, XCount, YCount, Fill, Flags;
    public short Show, Reserved2; public IntPtr ReservedPtr, Input, Output, Error;
  }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo {
    public IntPtr Process, Thread; public int Id, ThreadId;
  }
  [StructLayout(LayoutKind.Sequential)] struct Accounting {
    public long UserTime, KernelTime, PeriodUserTime, PeriodKernelTime;
    public uint PageFaults, TotalProcesses, ActiveProcesses, TerminatedProcesses;
  }
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateJobObject(IntPtr attrs, string name);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits info, int length);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(string file, StringBuilder args, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string dir, ref StartupInfo startup, out ProcessInfo process);
  [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int id);
  [DllImport("kernel32.dll", SetLastError = true)] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr handle, uint ms);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetExitCodeProcess(IntPtr handle, out uint code);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool QueryInformationJobObject(IntPtr job, int kind, out Accounting info, int length, IntPtr returned);
  [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr handle, uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

  public static int Run(string file, string commandLine, string receipt) {
    const uint KillOnJobClose = 0x2000, CreateSuspended = 0x4, CreateNoWindow = 0x08000000;
    var job = CreateJobObject(IntPtr.Zero, null);
    if (job == IntPtr.Zero) throw new Win32Exception();
    var process = new ProcessInfo();
    try {
      var limits = new ExtendedLimits(); limits.Basic.Flags = KillOnJobClose;
      if (!SetInformationJobObject(job, 9, ref limits, Marshal.SizeOf(limits))) throw new Win32Exception();
      var startup = new StartupInfo(); startup.Size = Marshal.SizeOf(startup); startup.Flags = 0x100;
      startup.Input = GetStdHandle(-10); startup.Output = GetStdHandle(-11); startup.Error = GetStdHandle(-12);
      if (!CreateProcess(file, new StringBuilder(commandLine), IntPtr.Zero, IntPtr.Zero, true,
        CreateSuspended | CreateNoWindow, IntPtr.Zero, null, ref startup, out process)) throw new Win32Exception();
      if (!AssignProcessToJobObject(job, process.Process)) {
        var error = new Win32Exception();
        TerminateProcess(process.Process, 1);
        throw error;
      }
      if (ResumeThread(process.Thread) == 0xffffffff) throw new Win32Exception();
      if (WaitForSingleObject(process.Process, 0xffffffff) != 0) throw new Win32Exception();
      uint code;
      if (!GetExitCodeProcess(process.Process, out code)) throw new Win32Exception();
      File.WriteAllText(receipt + ".tmp", code.ToString(System.Globalization.CultureInfo.InvariantCulture));
      File.Move(receipt + ".tmp", receipt);
      var accounting = new Accounting();
      while (true) {
        if (!QueryInformationJobObject(job, 1, out accounting, Marshal.SizeOf(accounting), IntPtr.Zero)) throw new Win32Exception();
        if (accounting.ActiveProcesses == 0) break;
        System.Threading.Thread.Sleep(20);
      }
      return unchecked((int)code);
    } finally {
      CloseHandle(job);
      if (process.Thread != IntPtr.Zero) CloseHandle(process.Thread);
      if (process.Process != IntPtr.Zero) CloseHandle(process.Process);
    }
  }
}
'@
  exit ([PlaygroundCliJob]::Run($launch.file, $launch.commandLine, $launch.receipt))
} catch {
  [Console]::Error.WriteLine('Could not start the Playground CLI in a Windows process job.')
  exit 1
}
`;

const encodedSupervisor = Buffer.from(supervisor, 'utf16le').toString('base64');
const quote = (value) => `"${String(value).replace(/(\\*)"/g, '$1$1\\"').replace(/\\+$/, '$&$&')}"`;

export async function windowsJobLaunch(launch) {
  if (launch.args.some((argument) => String(argument).includes('\0'))) {
    const error = new TypeError('Playground CLI arguments must not contain null bytes.');
    error.code = 'ERR_INVALID_ARG_VALUE';
    throw error;
  }
  const directory = await mkdtemp(join(tmpdir(), 'playground-cli-job-'));
  const receipt = join(directory, 'exit-code');
  const commandLine = [quote(launch.file), launch.windowsVerbatimArguments ? launch.args.join(' ') : launch.args.map(quote).join(' ')].join(' ');
  return {
    file: join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedSupervisor],
    env: { ...launch.env, PLAYGROUND_CLI_LAUNCH: JSON.stringify({ file: launch.file, commandLine, receipt }) },
    exitCode() {
      try {
        const value = readFileSync(receipt, 'utf8');
        return /^\d{1,10}$/.test(value) && Number(value) <= 0xffffffff ? Number(value) : undefined;
      } catch { return undefined; }
    },
    dispose: () => rm(directory, { recursive: true, force: true }).catch(() => {}),
  };
}

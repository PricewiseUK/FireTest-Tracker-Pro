import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const accountingBuild = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'backend/tsconfig.functions.json'], { stdio: 'inherit', windowsHide: true });
if (accountingBuild.status !== 0) process.exit(accountingBuild.status ?? 1);
const suites = [
  { project: "demo-instafire-jobs", report: ".security-jobs-results.log", files: ["tests/firebase/jobs.rules.test.mjs"] },
  { project: "demo-instafire-accounting", report: ".security-accounting-results.log", files: ["tests/firebase/accounting.rules.test.mjs"] },
  { project: "demo-instafire-inspections", report: ".security-results.log", files: ["tests/firebase/inspection.rules.test.mjs", "tests/firebase/extendedChecklist.rules.test.mjs"] },
  { project: "demo-instafire-catalogue", report: ".security-catalogue-results.log", files: ["tests/firebase/catalogue.rules.test.mjs", "tests/firebase/mxpro.rules.test.mjs"] },
];
// On Windows the CLI can exit without terminating its Java Firestore child.
// Preserve pre-existing processes, and clean up only this invocation's demo JVMs.
function demoJavaProcesses(project) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `Get-CimInstance Win32_Process -Filter "Name = 'java.exe'" | Where-Object { $_.CommandLine -like '*cloud-firestore-emulator*' -and $_.CommandLine -like '*${project}*' } | Select-Object -ExpandProperty ProcessId`,
  ], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error("Cannot inspect demo emulator processes for safe cleanup");
  return result.stdout.trim().split(/\s+/).filter(Boolean).map(Number);
}
let failed = false;
for (const { project, report, files } of suites) {
  if (!project.startsWith("demo-") || files.some((file) => !/^tests\/firebase\/[a-zA-Z.]+\.mjs$/.test(file))) throw new Error("DEMO_SUITE_REQUIRED");
  const previous = process.platform === "win32" ? demoJavaProcesses(project) : [];
  let status = 1;
  try {
    const result = spawnSync(process.execPath, [
      require.resolve("firebase-tools/lib/bin/firebase.js"), "emulators:exec",
      "--project", project, "--config", "firebase.emulators.json", "--only", ["demo-instafire-catalogue", "demo-instafire-jobs"].includes(project) ? "firestore,storage,auth" : "firestore,storage",
      `node --test --test-concurrency=1 --test-reporter=spec --test-reporter-destination=${report} ${files.join(" ")}`,
    ], { stdio: "inherit", env: { ...process.env, DEBUG: "", GCLOUD_PROJECT: project, GOOGLE_CLOUD_PROJECT: project }, windowsHide: true });
    status = result.status ?? 1;
  } finally {
    if (process.platform === "win32") {
      for (const pid of demoJavaProcesses(project).filter((id) => !previous.includes(id))) {
        // Recheck the exact PID and demo command before terminating anything.
        const cleanup = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
          `$emulatorProcess = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if ($emulatorProcess.CommandLine -like '*cloud-firestore-emulator*' -and $emulatorProcess.CommandLine -like '*${project}*') { Stop-Process -Id ${pid} -Force -ErrorAction Stop }`,
        ], { stdio: "inherit", windowsHide: true });
        if (cleanup.status !== 0) status = 1;
      }
    }
  }
  if (status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;

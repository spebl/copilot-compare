import path from "node:path";
import { promises as fs } from "node:fs";

import type { RunReport } from "./electron-contract";

const RUN_REPORTS_DIRECTORY_NAME = "runs";

export function getRunsDirectory(userDataPath: string) {
  return path.join(userDataPath, RUN_REPORTS_DIRECTORY_NAME);
}

export async function writeRunReport(userDataPath: string, runReport: RunReport) {
  const reportPath = path.join(getRunsDirectory(userDataPath), `${runReport.id}.json`);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(runReport, null, 2), "utf8");
  return reportPath;
}
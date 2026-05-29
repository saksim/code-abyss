'use strict';

const fs = require('fs');
const path = require('path');

function ensureReportsDir(projectRoot) {
  const dir = path.join(projectRoot, '.personal-skill-system', 'reports');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeStamp(date = new Date()) {
  return date.toISOString().replace(/[:]/g, '-');
}

function writeReportArtifact(projectRoot, kind, payload) {
  const reportsDir = ensureReportsDir(projectRoot);
  const fileName = `${kind}-${safeStamp()}.json`;
  const filePath = path.join(reportsDir, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  return filePath;
}

function listReportArtifacts(projectRoot, kindPrefix = null) {
  const reportsDir = ensureReportsDir(projectRoot);
  return fs.readdirSync(reportsDir)
    .filter((name) => name.endsWith('.json'))
    .filter((name) => !kindPrefix || name.startsWith(kindPrefix))
    .map((name) => {
      const filePath = path.join(reportsDir, name);
      const stat = fs.statSync(filePath);
      return {
        name,
        path: filePath,
        mtimeMs: stat.mtimeMs,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function readLatestReportArtifact(projectRoot, kindPrefix = null) {
  const reports = listReportArtifacts(projectRoot, kindPrefix);
  if (reports.length === 0) return null;
  const latest = reports[0];
  return {
    ...latest,
    data: JSON.parse(fs.readFileSync(latest.path, 'utf8')),
  };
}

function deriveReportKind(name) {
  return name.replace(/-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z\.json$/, '');
}

function summarizeReportArtifacts(projectRoot, kindPrefix = null) {
  const reports = listReportArtifacts(projectRoot, kindPrefix);
  const seen = new Set();
  const summary = [];

  reports.forEach((report) => {
    const kind = deriveReportKind(report.name);
    if (seen.has(kind)) return;
    seen.add(kind);

    const data = JSON.parse(fs.readFileSync(report.path, 'utf8'));
    summary.push({
      kind,
      name: report.name,
      path: report.path,
      mtimeMs: report.mtimeMs,
      target: data.target || null,
      pack: data.pack || null,
      packReports: data.pack_reports || [],
      reports: data.reports || [],
    });
  });

  return summary;
}

module.exports = {
  ensureReportsDir,
  writeReportArtifact,
  listReportArtifacts,
  readLatestReportArtifact,
  summarizeReportArtifacts,
};

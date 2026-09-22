import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getCrmLeads } from "../server/db";

const outputDir = path.resolve(process.env.AUDIT_OUTPUT_DIR ?? "artifacts");
const dateStamp = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).replaceAll("-", "");
const OUTPUT = path.join(outputDir, `APSY_CRM_Backup_Pre_EducaCRM_${dateStamp}.json`);

async function main() {
  const rows = await getCrmLeads();
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    sourceBeforeMigration: "Cirqua snapshot persisted in crm_leads",
    rows: rows.length,
    data: rows,
  }, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ output: OUTPUT, rows: rows.length }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

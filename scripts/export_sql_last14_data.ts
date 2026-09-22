import { writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { getDb } from "/home/ubuntu/dashboard-upside/server/db";
import { crmLeads } from "/home/ubuntu/dashboard-upside/drizzle/schema";

const PERIOD_START = "2026-08-26";
const PERIOD_END = "2026-09-08";
const OUTPUT_PATH = "/home/ubuntu/sqls_ultimos_14_dias.json";

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível para a exportação.");

  const rows = await db
    .select()
    .from(crmLeads)
    .where(sql`UPPER(TRIM(${crmLeads.opportunityStage})) = 'SQL'
      AND ${crmLeads.createdDate} BETWEEN ${PERIOD_START} AND ${PERIOD_END}`)
    .orderBy(crmLeads.createdDate, crmLeads.contactName, crmLeads.opportunityNumber);

  const normalizedRows = rows.map((row) => ({
    ...row,
    createdDate: row.createdDate ? String(row.createdDate) : null,
    updatedDate: row.updatedDate ? String(row.updatedDate) : null,
    importedAt: row.importedAt ? new Date(row.importedAt).toISOString() : null,
  }));

  const distinctKeys = new Set(
    normalizedRows.map((row) =>
      row.opportunityNumber?.trim() ||
      row.externalId?.trim() ||
      `${row.contactName || ""}|${row.email || ""}|${row.phone || ""}|${row.createdDate || ""}`,
    ),
  );

  await writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        generatedAtBrt: new Intl.DateTimeFormat("sv-SE", {
          timeZone: "America/Sao_Paulo",
          dateStyle: "short",
          timeStyle: "medium",
        }).format(new Date()),
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        stage: "SQL",
        totalRows: normalizedRows.length,
        distinctRecords: distinctKeys.size,
        rows: normalizedRows,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Exportação preparada: ${normalizedRows.length} SQLs, ${distinctKeys.size} registros distintos.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { createConnection } from "mysql2/promise";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Carrega somente o snapshot histórico de programática incluído no repositório.
 * Usuários devem ser criados separadamente com `pnpm admin:create`.
 * Leads oficiais vêm do EducaCRM com `pnpm crm:sync`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL não configurada");
  process.exit(1);
}

const connection = await createConnection(databaseUrl);
try {
  const programmatic = JSON.parse(
    readFileSync(path.join(__dirname, "programatica.json"), "utf8"),
  );

  await connection.beginTransaction();
  try {
    await connection.execute("DELETE FROM prog_dv360");
    for (const row of programmatic.dv360) {
      await connection.execute(
        "INSERT INTO prog_dv360 (insertionOrder, format, objective, geo, day, spend, impressions, clicks, viewability, completeViews, completionRate) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [row.insertionOrder, row.format, row.objective, row.geo, row.day, row.spend, row.impressions, row.clicks, row.viewability, row.completeViews, row.completionRate],
      );
    }

    await connection.execute("DELETE FROM prog_meta_social");
    for (const row of programmatic.metaSocial) {
      await connection.execute(
        "INSERT INTO prog_meta_social (campaign, day, reach, impressions, frequency, spend, resultType, results, linkClicks, reactions, followers) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [row.campaign, row.day, row.reach, row.impressions, row.frequency, row.spend, row.resultType, row.results, row.linkClicks, row.reactions, row.followers],
      );
    }

    await connection.execute("DELETE FROM prog_push");
    for (const row of programmatic.push) {
      await connection.execute(
        "INSERT INTO prog_push (day, spend, dispatches, clicks) VALUES (?,?,?,?)",
        [row.day, row.spend, row.dispatches, row.clicks],
      );
    }

    await connection.commit();
    console.log(JSON.stringify({
      dv360: programmatic.dv360.length,
      metaSocial: programmatic.metaSocial.length,
      push: programmatic.push.length,
    }));
  } catch (error) {
    await connection.rollback();
    throw error;
  }
} finally {
  await connection.end();
}

import { createConnection } from "mysql2/promise";
import { hashPassword } from "../server/localAuth";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || username;

  if (!databaseUrl) throw new Error("DATABASE_URL não configurada");
  if (!username) throw new Error("ADMIN_USERNAME não configurada");
  if (!password || password.length < 12) {
    throw new Error("ADMIN_PASSWORD deve ter pelo menos 12 caracteres");
  }

  const connection = await createConnection(databaseUrl);
  try {
    const passwordHash = hashPassword(password);
    await connection.execute(
      `INSERT INTO local_users (name, username, passwordHash, role, active)
       VALUES (?, ?, ?, 'admin', true)
       ON DUPLICATE KEY UPDATE name = VALUES(name), passwordHash = VALUES(passwordHash), role = 'admin', active = true`,
      [name, username, passwordHash],
    );
    console.log(`Administrador ${username} criado/atualizado com sucesso.`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

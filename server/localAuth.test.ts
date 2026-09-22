import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./localAuth";

describe("localAuth password hashing", () => {
  it("gera hash e verifica senha correta do usuário master", async () => {
    const hash = await hashPassword("Rodrigo");
    expect(hash).toBeTruthy();
    expect(hash).not.toContain("Rodrigo");
    const ok = await verifyPassword("Rodrigo", hash);
    expect(ok).toBe(true);
  });

  it("rejeita senha incorreta", async () => {
    const hash = await hashPassword("Rodrigo");
    const ok = await verifyPassword("senha-errada", hash);
    expect(ok).toBe(false);
  });

  it("gera hashes distintos (salt aleatório)", async () => {
    const h1 = await hashPassword("Rodrigo");
    const h2 = await hashPassword("Rodrigo");
    expect(h1).not.toBe(h2);
  });
});

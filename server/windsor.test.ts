import { describe, expect, it } from "vitest";
import "dotenv/config";

describe("Windsor.ai API key", () => {
  it("busca dados da conta Meta APSY com a WINDSOR_API_KEY", async () => {
    const key = process.env.WINDSOR_API_KEY;
    expect(key, "WINDSOR_API_KEY deve estar configurada").toBeTruthy();

    const params = new URLSearchParams({
      api_key: key!,
      date_preset: "last_7d",
      fields: "date,campaign,spend",
      select_accounts: "1977935416423618",
      _renderer: "json",
    });
    const resp = await fetch(`https://connectors.windsor.ai/facebook?${params.toString()}`, {
      signal: AbortSignal.timeout(45_000),
    });
    expect(resp.ok, `Windsor respondeu HTTP ${resp.status}`).toBe(true);
    const json = (await resp.json()) as { data?: unknown[] } | unknown[];
    const rows = Array.isArray(json) ? json : (json.data ?? []);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  }, 60_000);
});

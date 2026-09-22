import { describe, expect, it } from "vitest";

interface SwaggerDocument {
  paths?: Record<string, unknown>;
  securityDefinitions?: Record<string, unknown>;
}

describe("EducaCRM API credentials", () => {
  it("autentica e retorna endpoints autorizados no OpenAPI", async () => {
    const token = process.env.CRM_EDUCACRM_TOKEN;
    expect(token).toBeTruthy();

    const response = await fetch("https://crm.apsyedu.com.br/swagger/?format=openapi", {
      headers: { Authorization: `Token ${token}` },
    });

    expect(response.status).toBe(200);
    const document = (await response.json()) as SwaggerDocument;
    expect(Object.keys(document.paths ?? {}).length).toBeGreaterThan(0);
  }, 20_000);
});

import { describe, it, expect } from "vitest";

describe("Publya API credentials", () => {
  it("should have PUBLYA_API_TOKEN set", () => {
    expect(process.env.PUBLYA_API_TOKEN).toBeTruthy();
    expect(process.env.PUBLYA_API_TOKEN!.length).toBeGreaterThan(10);
  });

  it("should have PUBLYA_CLIENT_ID set as numeric", () => {
    expect(process.env.PUBLYA_CLIENT_ID).toBeTruthy();
    expect(Number(process.env.PUBLYA_CLIENT_ID)).toBeGreaterThan(0);
  });

  it("should have PUBLYA_CLIENT_EMAIL set", () => {
    expect(process.env.PUBLYA_CLIENT_EMAIL).toBeTruthy();
    expect(process.env.PUBLYA_CLIENT_EMAIL).toContain("@");
  });

  it("should successfully list campaigns from Publya API", async () => {
    const token = process.env.PUBLYA_API_TOKEN!;
    const clientId = process.env.PUBLYA_CLIENT_ID!;
    const email = process.env.PUBLYA_CLIENT_EMAIL!;
    const userDataB64 = Buffer.from(`${clientId}:${email}`).toString("base64");

    const res = await fetch(
      "https://api.publya.com/kermit/leap/reports/external/campaigns?page=1&itemsPerPage=5",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Data": userDataB64,
          "Content-Type": "application/json",
        },
      }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBeGreaterThan(0);
    expect(data.items).toBeInstanceOf(Array);
    expect(data.items.length).toBeGreaterThan(0);
  }, 30000);
});

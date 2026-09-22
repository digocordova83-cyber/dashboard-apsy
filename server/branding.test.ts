import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const APP_TITLE = "Dashboard APSY";
const APP_LOGO = "/manus-storage/logo-upsy-oficial_63b69479.svg";

describe("branding pública", () => {
  it("usa o título Dashboard APSY e o logo oficial na entrada web e nos pontos principais da interface", async () => {
    const [html, login, layout] = await Promise.all([
      readFile("client/index.html", "utf8"),
      readFile("client/src/pages/Login.tsx", "utf8"),
      readFile("client/src/components/AppLayout.tsx", "utf8"),
    ]);

    expect(html).toContain(`<title>${APP_TITLE} | APSY</title>`);
    expect(login).toContain(`const LOGO = "${APP_LOGO}"`);
    expect(layout).toContain(`const LOGO = "${APP_LOGO}"`);
    expect(login).toContain(APP_TITLE);
    expect(layout).toContain(APP_TITLE);
  });
});

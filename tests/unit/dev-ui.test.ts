import { describe, expect, it } from "vitest";
import { devUiEnabled } from "@/lib/dev-ui";

describe("витрина /dev/ui", () => {
  it("закрыта в production без флага", () => {
    expect(devUiEnabled({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(false);
    expect(devUiEnabled({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(true);
    expect(
      devUiEnabled({ NODE_ENV: "production", KOMPAS_DEV_UI: "true" } as NodeJS.ProcessEnv),
    ).toBe(true);
  });
});

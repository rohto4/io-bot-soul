import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../../src/logger.js";

describe("createLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes JSON logs at or above the configured level", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const logger = createLogger("info");

    logger.debug("hidden");
    logger.info("visible", { value: 1 });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toMatchObject({
      level: "info",
      message: "visible",
      value: 1
    });
  });

  it("routes warnings and errors to their console methods", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logger = createLogger("debug");

    logger.warn("careful");
    logger.error("failed");

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

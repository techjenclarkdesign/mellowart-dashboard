import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password.server";

describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("s3cret-pw");
    expect(await verifyPassword("s3cret-pw", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("s3cret-pw");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("uses a unique salt per hash but both verify", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same", a)).toBe(true);
    expect(await verifyPassword("same", b)).toBe(true);
  });

  it("stores in the pbkdf2$iter$salt$hash format", async () => {
    const hash = await hashPassword("x");
    expect(hash.startsWith("pbkdf2$100000$")).toBe(true);
    expect(hash.split("$")).toHaveLength(4);
  });

  it("returns false for a malformed stored hash", async () => {
    expect(await verifyPassword("x", "not-a-valid-hash")).toBe(false);
  });
});

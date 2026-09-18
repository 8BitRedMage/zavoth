import { describe, expect, it } from "vitest";
import { isPublicAddress, safeFetchText } from "./safeFetch";

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::",
    "fe80::1",
    "fd12:3456::1",
    "::ffff:10.0.0.1",
    "::ffff:127.0.0.1",
    "not-an-ip",
  ])("blocks %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    "8.8.8.8",
    "172.32.0.1",
    "1.1.1.1",
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8",
  ])("allows %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

describe("safeFetchText", () => {
  const options = { userAgent: "test" };

  it.each([
    "http://acme.com/robots.txt",
    "https://acme.com:8443/robots.txt",
    "https://127.0.0.1/robots.txt",
    "https://[::1]/robots.txt",
    "file:///etc/passwd",
  ])("refuses %s before connecting", async (url) => {
    await expect(safeFetchText(url, options)).rejects.toThrow(/Refusing/);
  });

  it("refuses a hostname that resolves to a private address", async () => {
    await expect(
      safeFetchText("https://localhost/robots.txt", options),
    ).rejects.toThrow(/does not resolve publicly/);
  });
});

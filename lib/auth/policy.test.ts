import { describe, expect, it } from "vitest";
import {
  checkEntraIdentity,
  type EntraIdClaims,
  isAllowedEmail,
  parseAllowedDomains,
  safeReturnTo,
} from "@/lib/auth/policy";

const TENANT = "11111111-2222-3333-4444-555555555555";
const CLIENT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const AUTHORITY = "https://login.microsoftonline.com";
const expected = {
  tenantId: TENANT,
  clientId: CLIENT,
  authority: AUTHORITY,
  domains: ["crocobet.com"],
};

const employee: EntraIdClaims = {
  iss: `${AUTHORITY}/${TENANT}/v2.0`,
  aud: CLIENT,
  tid: TENANT,
  oid: "0f0e0d0c-0000-4000-8000-000000000001",
  name: "Nino Beridze",
  email: "Nino.Beridze@crocobet.com",
  preferred_username: "nino.beridze@crocobet.com",
};

describe("parseAllowedDomains", () => {
  it("defaults to crocobet.com", () => {
    expect(parseAllowedDomains(undefined)).toEqual(["crocobet.com"]);
    expect(parseAllowedDomains("  ")).toEqual(["crocobet.com"]);
  });

  it("normalizes a comma-separated list", () => {
    expect(parseAllowedDomains(" Crocobet.com, @crocomind.com ,")).toEqual([
      "crocobet.com",
      "crocomind.com",
    ]);
  });
});

describe("isAllowedEmail", () => {
  const domains = ["crocobet.com"];

  it.each(["nino@crocobet.com", "NINO@CROCOBET.COM", "  a.b-c@crocobet.com "])(
    "allows %s",
    (email) => expect(isAllowedEmail(email, domains)).toBe(true),
  );

  it.each([
    "nino@gmail.com",
    "nino@crocobet.com.evil.io",
    "nino@ge.crocobet.com",
    "nino@notcrocobet.com",
    "crocobet.com",
    "@crocobet.com",
    "nino@",
    "",
    null,
    undefined,
  ])("rejects %j", (email) =>
    expect(isAllowedEmail(email, domains)).toBe(false),
  );
});

describe("checkEntraIdentity", () => {
  it("accepts a Crocobet employee and normalizes the email", () => {
    expect(checkEntraIdentity(employee, expected)).toEqual({
      ok: true,
      oid: employee.oid,
      email: "nino.beridze@crocobet.com",
      name: "Nino Beridze",
    });
  });

  it("falls back to the sign-in name when there's no email claim", () => {
    const result = checkEntraIdentity(
      { ...employee, email: undefined },
      expected,
    );
    expect(result).toMatchObject({
      ok: true,
      email: "nino.beridze@crocobet.com",
    });
  });

  it("accepts the audience as an array", () => {
    expect(
      checkEntraIdentity({ ...employee, aud: [CLIENT] }, expected).ok,
    ).toBe(true);
  });

  it("rejects other tenants", () => {
    const other = "99999999-2222-3333-4444-555555555555";
    expect(
      checkEntraIdentity(
        { ...employee, tid: other, iss: `${AUTHORITY}/${other}/v2.0` },
        expected,
      ),
    ).toEqual({ ok: false, reason: "wrong_tenant" });
  });

  it("rejects a token for another app or from another issuer", () => {
    expect(
      checkEntraIdentity({ ...employee, aud: "someone-else" }, expected),
    ).toEqual({
      ok: false,
      reason: "wrong_tenant",
    });
    expect(
      checkEntraIdentity(
        { ...employee, iss: `https://evil.example/${TENANT}/v2.0` },
        expected,
      ),
    ).toEqual({ ok: false, reason: "wrong_tenant" });
  });

  it("rejects accounts outside the allowed domains", () => {
    expect(
      checkEntraIdentity(
        {
          ...employee,
          email: "nino@gmail.com",
          preferred_username: "nino@gmail.com",
        },
        expected,
      ),
    ).toEqual({ ok: false, reason: "domain_not_allowed" });
  });

  it("rejects B2B guests even if their email looks right", () => {
    expect(
      checkEntraIdentity(
        {
          ...employee,
          preferred_username: "nino_crocobet.com#EXT#@crocobet.onmicrosoft.com",
        },
        expected,
      ),
    ).toEqual({ ok: false, reason: "domain_not_allowed" });
  });

  it("rejects tokens without the identifying claims", () => {
    expect(
      checkEntraIdentity({ ...employee, oid: undefined }, expected),
    ).toEqual({
      ok: false,
      reason: "missing_claims",
    });
    expect(checkEntraIdentity({ ...employee, tid: "" }, expected)).toEqual({
      ok: false,
      reason: "missing_claims",
    });
  });
});

describe("safeReturnTo", () => {
  it.each([
    ["/", "/"],
    ["/?view=my-videos&platform=tiktok", "/?view=my-videos&platform=tiktok"],
    ["/some/page#top", "/some/page#top"],
  ])("keeps same-origin path %s", (input, output) => {
    expect(safeReturnTo(input)).toBe(output);
  });

  it.each([
    "https://evil.example",
    "//evil.example/path",
    "/\\evil.example",
    "javascript:alert(1)",
    "evil.example",
    "/sign-in",
    "/api/auth/sign-out",
    "",
    null,
    undefined,
  ])("falls back for %j", (input) => {
    expect(safeReturnTo(input)).toBe("/");
  });
});

import { describe, expect, it } from "vitest";

import { buildGoogleAuthUrl, GOOGLE_SCOPES, googleRedirectUri } from "./google.oauth";

describe("googleRedirectUri", () => {
  it("appends the callback path to the API base", () => {
    expect(googleRedirectUri("https://api.example.com")).toBe(
      "https://api.example.com/api/integrations/google/callback",
    );
  });
});

describe("buildGoogleAuthUrl", () => {
  const base = {
    clientId: "client-123",
    redirectUri: "https://api.example.com/api/integrations/google/callback",
    state: "signed.state.jwt",
  };

  it("targets Google's consent endpoint with required params", () => {
    const url = new URL(buildGoogleAuthUrl(base));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("redirect_uri")).toBe(base.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("signed.state.jwt");
    expect(url.searchParams.get("access_type")).toBe("offline");
  });

  it("requests the default scopes", () => {
    const url = new URL(buildGoogleAuthUrl(base));
    expect(url.searchParams.get("scope")).toBe(GOOGLE_SCOPES.join(" "));
  });

  it("honours custom scopes", () => {
    const url = new URL(buildGoogleAuthUrl({ ...base, scopes: ["openid", "email"] }));
    expect(url.searchParams.get("scope")).toBe("openid email");
  });
});

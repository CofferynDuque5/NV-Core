/** OAuth scopes requested when connecting a Google account. */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
] as const;

export interface GoogleAuthUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
}

/** Build the Google consent URL (pure — unit tested). */
export function buildGoogleAuthUrl(input: GoogleAuthUrlInput): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: (input.scopes ?? GOOGLE_SCOPES).join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: input.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** The redirect URI Google calls back — must match the console registration. */
export function googleRedirectUri(apiUrl: string): string {
  return `${apiUrl}/api/integrations/google/callback`;
}

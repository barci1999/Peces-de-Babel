export interface FortyTwoUser {
  id: number;
  login: string;
  email: string;
  usual_full_name: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

function getRequiredEnv(name: string): string {
  const value: string | undefined = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno obligatoria: ${name}`);
  }
  return value;
}

export function buildFortyTwoAuthorizeUrl(): string {
  const clientId: string = getRequiredEnv("FORTYTWO_CLIENT_ID");
  const redirectUri: string = getRequiredEnv("FORTYTWO_REDIRECT_URI");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
  });

  return `https://api.intra.42.fr/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForUser(code: string): Promise<{
  tokens: TokenResponse;
  user: FortyTwoUser;
}> {
  const clientId: string = getRequiredEnv("FORTYTWO_CLIENT_ID");
  const clientSecret: string = getRequiredEnv("FORTYTWO_CLIENT_SECRET");
  const redirectUri: string = getRequiredEnv("FORTYTWO_REDIRECT_URI");
  

  const tokenResponse: Response = await fetch("https://api.intra.42.fr/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText: string = await tokenResponse.text();
    throw new Error(`Error al obtener token de 42 (${tokenResponse.status}): ${errorText}`);
  }

  const tokens = (await tokenResponse.json()) as TokenResponse;

  const meResponse: Response = await fetch("https://api.intra.42.fr/v2/me", {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
    },
  });

  if (!meResponse.ok) {
    const errorText: string = await meResponse.text();
    throw new Error(`Error al consultar /v2/me (${meResponse.status}): ${errorText}`);
  }

  const user = (await meResponse.json()) as FortyTwoUser;

  return { tokens, user };
}
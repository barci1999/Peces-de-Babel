import type { IncomingMessage, ServerResponse } from "node:http";
import {
  buildFortyTwoAuthorizeUrl,
  exchangeCodeForUser,
} from "./login.service.js";

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

export async function handleLoginRoutes(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  if (!req.url || !req.method) {
    return false;
  }

  const baseUrl: string = process.env.APP_URL || "http://localhost:3001";
  const parsedUrl = new URL(req.url, baseUrl);

  if (req.method === "GET" && parsedUrl.pathname === "/auth/42/login") {
    try {
      const authorizeUrl: string = buildFortyTwoAuthorizeUrl();
      res.writeHead(302, { Location: authorizeUrl });
      res.end();
    } catch (error) {
      const message: string =
        error instanceof Error ? error.message : "Error al iniciar login";
      sendJson(res, 500, { error: message });
    }
    return true;
  }

  if (req.method === "GET" && parsedUrl.pathname === "/auth/42/callback") {
    const code: string | null = parsedUrl.searchParams.get("code");
    const oauthError: string | null = parsedUrl.searchParams.get("error");

    if (oauthError) {
      sendJson(res, 400, {
        error: `Autorización denegada o fallida en 42: ${oauthError}`,
      });
      return true;
    }

    if (!code) {
      sendJson(res, 400, { error: "Falta el parámetro 'code' en el callback" });
      return true;
    }

    try {
      const result = await exchangeCodeForUser(code);
      sendJson(res, 200, {
        message: "Login con 42 correcto",
        user: {
          id: result.user.id,
          login: result.user.login,
          email: result.user.email,
          usual_full_name: result.user.usual_full_name,
        },
      });
    } catch (error) {
      const message: string =
        error instanceof Error ? error.message : "Error en el callback de 42";
      sendJson(res, 500, { error: message });
    }
    return true;
  }

  return false;
}
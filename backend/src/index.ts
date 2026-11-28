import { error } from "console";
import express, { type NextFunction, type Request, type Response } from "express";
import { stringify } from "querystring";
import { json } from "stream/consumers";
import { prisma } from "./prisma.js";
import {  signSessionToken  } from "./auth/jwt.js"
import { requireAuth , type AuthenticatedRequest} from "./auth/requireAuth.js";


const app = express();
const port: number = Number(process.env.PORT) || 3001;

app.use(express.json());

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "hola" });
});

app.get("/api/me", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.status(200).json({
    authenticated: true,
    user: req.authUser,
  });
});
app.get("/auth/42/login",(_rew: Request,res: Response) => {
  const client_id  = process.env.FORTYTWO_CLIENT_ID;
  const redirect_uri = process.env.FORTYTWO_REDIRECT_URI
  if(!client_id || !redirect_uri) {
    res.status(500).json({error: "credentials not detected"})
    return;
  }
    const url_intra = new URL("https://api.intra.42.fr/oauth/authorize")
    url_intra.searchParams.set("client_id",client_id)
    url_intra.searchParams.set("redirect_uri",redirect_uri)
    url_intra.searchParams.set("response_type","code")
    res.redirect(302,url_intra.toString())
}
)

app.get("/auth/42/callback", async (req: Request, res: Response) => {
  const client_id = process.env.FORTYTWO_CLIENT_ID;
  const client_secret = process.env.FORTYTWO_CLIENT_SECRET;
  const redirect_uri = process.env.FORTYTWO_REDIRECT_URI;

  if (!client_id || !client_secret || !redirect_uri) {
    res.status(500).json({ error: "credentials not detected" });
    return;
  }

  const { code, error } = req.query;
  if (typeof code !== "string" || !code || error) {
    res.status(400).json({ error: "Bad Request" });
    return;
  }

  try {
    const tokenRes = await fetch("https://api.intra.42.fr/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id,
        client_secret,
        code,
        redirect_uri,
      }),
    });

    if (!tokenRes.ok) {
      res.status(502).json({ error: "Bad Gateway" });
      return;
    }

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token || typeof tokenData.access_token !== "string") {
      res.status(502).json({ error: "Invalid access token from 42" });
      return;
    }

    const profileRes = await fetch("https://api.intra.42.fr/v2/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!profileRes.ok) {
      res.status(502).json({ error: "Failed to fetch user profile" });
      return;
    }

    const userData = await profileRes.json();
    const avatarUrl = userData.image?.versions?.medium ?? userData.image?.link ?? null;
    const isStaffFromFortyTwo = Boolean(userData?.["staff?"]);
    const isDevStaff = userData.login === "pablalva";
    const shouldBeStaff = isStaffFromFortyTwo || isDevStaff;

    const savedUser = await prisma.user.upsert({
      where: { intraId: Number(userData.id) },
      update: {
        email: userData.email ?? null,
        login: String(userData.login),
        avatarUrl,
        ...(shouldBeStaff ? { staff: true } : {}),
      },
      create: {
        intraId: Number(userData.id),
        email: userData.email ?? null,
        login: String(userData.login),
        avatarUrl,
        staff: shouldBeStaff,
      },
    });

    const now = new Date();
    const isStaff = Boolean(savedUser.staff);
    const hasStarted = savedUser.accessFrom !== null && now >= savedUser.accessFrom;
    const hasNotExpired = savedUser.accessUntil === null || now <= savedUser.accessUntil;

    if (!isStaff && (!hasStarted || !hasNotExpired)) {
      res.status(403).json({
        error: "Access window is not active or has expired",
        accessFrom: savedUser.accessFrom,
        accessUntil: savedUser.accessUntil,
      });
      return;
    }

    const token = signSessionToken({
      userId: savedUser.id,
      login: savedUser.login,
      role: isStaff ? "staff" : "user",
    });

    res.status(200).json({
      token,
      user: {
        id: savedUser.id,
        intraId: savedUser.intraId,
        login: savedUser.login,
        email: savedUser.email,
        avatarUrl: savedUser.avatarUrl,
        staff: savedUser.staff,
        accessFrom: savedUser.accessFrom,
        accessUntil: savedUser.accessUntil,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

app.post("/staff/babel/user/register", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const client_id = process.env.FORTYTWO_CLIENT_ID;
  const client_secret = process.env.FORTYTWO_CLIENT_SECRET;

  if (!client_id || !client_secret) {
    res.status(500).json({ error: "credentials not detected" });
    return;
  }

  try {
    const staffLogin = req.authUser?.login;
    const role = req.authUser?.role;

    if (!staffLogin || role !== "staff") {
      res.status(403).json({ error: "Staff role required" });
      return;
    }

    const rawLogin = req.body?.login;
    if (typeof rawLogin !== "string" || !rawLogin.trim()) {
      res.status(400).json({ error: "A valid student 'login' string is required" });
      return;
    }

    const targetLogin = rawLogin.trim().toLowerCase();

    // Fechas opcionales en el body (ej. "2026-12-01T00:00:00.000Z")
    let parsedAccessFrom: Date | null = null;
    if (req.body?.accessFrom !== undefined && req.body?.accessFrom !== null) {
      const d = new Date(req.body.accessFrom);
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ error: "Invalid 'accessFrom' date" });
        return;
      }
      parsedAccessFrom = d;
    } else {
      // Por defecto, acceso activo desde ahora
      parsedAccessFrom = new Date();
    }

    let parsedAccessUntil: Date | null = null;
    if (req.body?.accessUntil !== undefined && req.body?.accessUntil !== null) {
      const d = new Date(req.body.accessUntil);
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ error: "Invalid 'accessUntil' date" });
        return;
      }
      parsedAccessUntil = d;
    }

    if (parsedAccessFrom && parsedAccessUntil && parsedAccessUntil <= parsedAccessFrom) {
      res.status(400).json({ error: "'accessUntil' must be later than 'accessFrom'" });
      return;
    }

    // 1. Token de aplicación (client_credentials) en la API de 42
    const appTokenRes = await fetch("https://api.intra.42.fr/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id,
        client_secret,
      }),
    });

    if (!appTokenRes.ok) {
      res.status(502).json({ error: "Failed to obtain 42 application token" });
      return;
    }

    const appTokenData = await appTokenRes.json();
    if (!appTokenData.access_token || typeof appTokenData.access_token !== "string") {
      res.status(502).json({ error: "Invalid application token from 42" });
      return;
    }

    // 2. Consultar perfil del alumno por login en 42
    const studentProfileRes = await fetch(
      `https://api.intra.42.fr/v2/users/${encodeURIComponent(targetLogin)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${appTokenData.access_token}`,
        },
      }
    );

    if (studentProfileRes.status === 404) {
      res.status(404).json({ error: `User '${targetLogin}' not found on 42` });
      return;
    }

    if (!studentProfileRes.ok) {
      res.status(502).json({ error: "Failed to fetch student profile from 42" });
      return;
    }

    const userData = await studentProfileRes.json();
    const login = userData.login.trim()
    const email = typeof userData.email === "string" && userData.email.trim() ? userData.email.trim() : null;
    const avatarUrl = userData.image?.versions?.medium ?? userData.image?.link ?? null;
    const staff = userData?.["staff?"]
    if(staff === true){
      parsedAccessFrom = null
      parsedAccessUntil = null
    }


    // 3. Upsert en Prisma ajustado exactamente a tu modelo User
    const savedUser = await prisma.user.upsert({
      where: { intraId: Number(userData.id) },
      update: {
        login: login,
        email,
        avatarUrl,
        accessFrom: parsedAccessFrom,
        accessUntil: parsedAccessUntil,
        staff: staff
      },
      create: {
        intraId: Number(userData.id),
        login: login,
        email: email,
        avatarUrl: avatarUrl,
        accessFrom: parsedAccessFrom,
        accessUntil: parsedAccessUntil,
        staff: staff,
      },
    });

    res.status(201).json({
      message: "Student registered from 42 profile",
      registeredBy: staffLogin,
      user: {
        id: savedUser.id,
        intraId: savedUser.intraId,
        login: savedUser.login,
        email: savedUser.email,
        avatarUrl: savedUser.avatarUrl,
        staff: savedUser.staff,
        accessFrom: savedUser.accessFrom,
        accessUntil: savedUser.accessUntil,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});


app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message: string =
    error instanceof Error ? error.message : "Error interno del servidor";
  res.status(500).json({ error: message });
});

app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
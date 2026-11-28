import type { NextFunction, Request, Response } from "express";
import { verifySessionToken, type SessionJwtPayload } from "./jwt.js";
import { prisma } from "../prisma.js";

export interface AuthenticatedRequest extends Request {
  authUser?: SessionJwtPayload;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid Authorization header" });
      return;
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      res.status(401).json({ error: "Missing bearer token" });
      return;
    }

    const payload = verifySessionToken(token);
    if (!payload) {
      res.status(401).json({ error: "Invalid or expired session token" });
      return;
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: Number(payload.userId) },
      select: {
        id: true,
        login: true,
        staff: true,
        accessFrom: true,
        accessUntil: true,
      },
    });

    if (!dbUser) {
      res.status(401).json({ error: "User no longer exists" });
      return;
    }

    const isStaff = Boolean(dbUser.staff);
    if (!isStaff) {
      const now = new Date();
      const hasStarted = dbUser.accessFrom !== null && now >= dbUser.accessFrom;
      const hasNotExpired = dbUser.accessUntil === null || now <= dbUser.accessUntil;

      if (!hasStarted || !hasNotExpired) {
        res.status(403).json({
          error: "Access window expired or not active",
          accessFrom: dbUser.accessFrom,
          accessUntil: dbUser.accessUntil,
        });
        return;
      }
    }

    req.authUser = {
      userId: dbUser.id,
      login: dbUser.login,
      role: isStaff ? "staff" : "user",
    };

    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
}
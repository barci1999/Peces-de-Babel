import jwt, { type SignOptions } from "jsonwebtoken";

export interface SessionJwtPayload {
  userId: string | number;
  login?: string;
  role?: string;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error("Falta la variable de entorno obligatoria: JWT_SECRET");
  }
  return secret;
}

export function signSessionToken(
  payload: SessionJwtPayload,
  expiresIn: SignOptions["expiresIn"] = "7d"
): string {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, { expiresIn });
}

export function verifySessionToken(token: string): SessionJwtPayload | null {
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret);

    if (typeof decoded !== "object" || decoded === null) {
      return null;
    }

    return decoded as SessionJwtPayload;
  } catch {
    return null;
  }
}
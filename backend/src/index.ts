import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { handleLoginRoutes } from "./login/login.routes.js";

const port: number = Number(process.env.PORT) || 3001;

const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const handledByLogin: boolean = await handleLoginRoutes(req, res);
    if (handledByLogin) {
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Ruta no encontrada" }));
  } catch (error) {
    const message: string =
      error instanceof Error ? error.message : "Error interno del servidor";
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: message }));
  }
});

server.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
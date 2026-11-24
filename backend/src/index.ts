import { error } from "console";
import express, { type NextFunction, type Request, type Response } from "express";
import { stringify } from "querystring";
import { json } from "stream/consumers";

const app = express();
const port: number = Number(process.env.PORT) || 3001;

app.use(express.json());

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "hola" });
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
app.get("/auth/42/callback",async (req:Request,res:Response) => {
  const client_id = process.env.FORTYTWO_CLIENT_ID
  const client_secret = process.env.FORTYTWO_CLIENT_SECRET
  const redirect_uri = process.env.FORTYTWO_REDIRECT_URI
  if(!client_id || !client_secret || !redirect_uri){
    res.status(500).json({error :"credentials not detected"})
    return;
  }
  const  {code,error} = req.query
  if(typeof code !== "string" || !code || error)
  {
    res.status(400).json({error: "Bad Request"});
    return
  }
  const url_intra = new URL("https://api.intra.42.fr/oauth/token")
  const response = await fetch(url_intra,{
    method:"POST",
    body:new URLSearchParams({
      "grant_type": "authorization_code",
      client_id : client_id,
      client_secret: client_secret,
      code : code,
      redirect_uri : redirect_uri

    })
  })
  if(!response.ok){
    res.status(502).json({error : "Bad Gateway"})
    return
  }
  const data = await response.json()

    if(!data.access_token || typeof data.access_token !== "string"){
      res.status(502).json({error: "Bad Gateway"})
      return
    }

  const profile = await fetch("https://api.intra.42.fr/v2/me",{
    method:"GET",
    headers:{
      "Authorization": `Bearer ${data.access_token}`
    },
  });
  if(!profile.ok){
    res.status(502).json({ error: "Failed to fetch user profile" });
    return
  }
  const userData = await profile.json();
  return res.status(200).json({
    id: userData.id,
    login:userData.login,
    email:userData.email,
    usual_full_name : userData.usual_full_name,
    url:userData.url
  })
}

)


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
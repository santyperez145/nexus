import { auth } from "@/lib/auth";
import { ensureDb } from "@/lib/db";
import { toNextJsHandler } from "better-auth/next-js";

const handler = toNextJsHandler(auth);

async function wrap(req: Request, method: "GET" | "POST") {
  await ensureDb();
  return method === "GET" ? handler.GET(req) : handler.POST(req);
}

export const GET = (req: Request) => wrap(req, "GET");
export const POST = (req: Request) => wrap(req, "POST");

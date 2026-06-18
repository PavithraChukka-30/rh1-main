import type { Express } from "express";
import type { Server } from "http";
import fs from "fs/promises";
import path from "path";
import { createServer as createViteServer } from "vite";

export async function setupVite(httpServer: Server, app: Express) {
  const vite = await createViteServer({
    configFile: path.resolve(import.meta.dirname, "..", "vite.config.ts"),
    appType: "custom",
    server: {
      middlewareMode: true,
      hmr: { server: httpServer },
    },
  });

  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    try {
      const url = req.originalUrl;
      const indexPath = path.resolve(import.meta.dirname, "..", "client", "index.html");
      let template = await fs.readFile(indexPath, "utf-8");
      template = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      next(error);
    }
  });
}

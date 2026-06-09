import express, { json, Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import searchRouter from "./searchRoute";
import extractRouter from "./extractRoute";

dotenv.config();

const app = express();
app.use(json());
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err && err.status === 400 && err.type === "entity.parse.failed") {
    console.error("Invalid JSON body", err.message);
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  next(err);
});
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

app.get("/", (_, res) => {
  res.json({ status: "ok", service: "aris-search-service", origin: process.env.SEARCH_SERVICE_ORIGIN || "local" });
});

app.get("/health", (_, res) => {
  res.json({ status: "ok", service: "aris-search-service", origin: process.env.SEARCH_SERVICE_ORIGIN || "local" });
});
app.use("/api/search", searchRouter);
app.use("/api/extract", extractRouter);

app.use((_, res) => {
  res.status(404).json({ error: "Route not found" });
});

const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || "0.0.0.0";
app.listen(port, host, () => {
  console.log(`Aris search service listening on ${host}:${port}`);
});

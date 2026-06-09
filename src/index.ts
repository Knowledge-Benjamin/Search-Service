import express from "express";
import { json } from "express";
import dotenv from "dotenv";
import searchRouter from "./searchRoute";

dotenv.config();

const app = express();
app.use(json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

app.get("/health", (_, res) => {
  res.json({ status: "ok", service: "aris-search-service", origin: process.env.SEARCH_SERVICE_ORIGIN || "local" });
});
app.use("/api/search", searchRouter);

app.use((_, res) => {
  res.status(404).json({ error: "Route not found" });
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`Aris search service listening on port ${port}`);
});

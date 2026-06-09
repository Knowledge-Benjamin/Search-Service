import { Router, Request, Response } from "express";
import { ExtractService } from "./extractService";

const router = Router();
const extractService = new ExtractService();

router.post("/", async (req: Request, res: Response) => {
  try {
    const { urls, timeoutMs, limit } = req.body;
    if (!urls || (typeof urls !== "string" && !Array.isArray(urls))) {
      return res.status(400).json({ error: "urls is required and must be a string or an array of strings" });
    }

    const response = await extractService.extract({ urls, timeoutMs, limit });
    res.json(response);
  } catch (error) {
    console.error("extractRoute error", {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body
    });
    res.status(500).json({ error: "URL extraction error" });
  }
});

export default router;

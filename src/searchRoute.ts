import { Router, Request, Response } from "express";
import { SearchService } from "./searchService";

const router = Router();
const searchService = new SearchService();

router.post("/", async (req: Request, res: Response) => {
  try {
    const { query, engines, limit } = req.body;
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "query is required" });
    }

    const response = await searchService.search({ query, engines, limit });
    res.json(response);
  } catch (error) {
    console.error("searchRoute error", error);
    res.status(500).json({ error: "Search service error" });
  }
});

export default router;

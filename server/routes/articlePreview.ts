import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { scrapeUrl, normalizeUrl } from '../lib/firecrawl.js';
import { analyzeWithAI } from '../lib/openai.js';
import { extractEvidence } from '../lib/evidenceExtractor.js';
import { ApiError } from '../middleware/errorHandler.js';

export const articlePreviewRouter = Router();

// ─── Request schema ───────────────────────────────────────────────────────────
const ArticlePreviewRequestSchema = z.object({
  url: z.string().trim().min(1, 'Please provide a URL'),
});

// ─── POST /api/article-preview ────────────────────────────────────────────────
articlePreviewRouter.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = ArticlePreviewRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ApiError(400, parsed.error.errors[0]?.message ?? 'Invalid request.'));
    }

    const { url } = parsed.data;

    try {
      const article = await scrapeUrl(url);

      // Run a quick headline risk assessment with AI, falling back safely to local extractor
      const headlineSample = `${article.title}. ${article.bodyText.substring(0, 500)}`;
      let headlineRisk = 20;
      let tags: string[] = [];

      try {
        const headlineAnalysis = await analyzeWithAI(headlineSample, 'news');
        headlineRisk = headlineAnalysis.manipulationScore;
        if (headlineRisk >= 66) {
          tags.push('Emotionally Framed', 'High Risk Content');
        } else if (headlineRisk >= 35) {
          tags.push('Potentially Biased');
        } else {
          tags.push('Factual Tone');
        }
        if (headlineAnalysis.urgencyScore > 40) tags.push('Urgency Tactics');
        if (headlineAnalysis.emotionalIntensity > 40) tags.push('Emotional Language');
      } catch {
        const local = extractEvidence(headlineSample, 'news');
        headlineRisk = local.manipulationScore;
        if (headlineRisk >= 66) {
          tags.push('Emotionally Framed', 'High Risk Content');
        } else if (headlineRisk >= 35) {
          tags.push('Potentially Biased');
        } else {
          tags.push('Factual Tone');
        }
        if (local.dominantTactic) tags.push(local.dominantTactic);
      }

      res.json({
        headline:     article.title,
        source:       article.source,
        author:       article.author,
        publishDate:  article.publishDate,
        headlineRisk,
        domain:       article.domain,
        tags:         [...new Set(tags)].slice(0, 4),
        bodyText:     article.bodyText,
        description:  article.description,
      });
    } catch (err) {
      next(err);
    }
  },
);

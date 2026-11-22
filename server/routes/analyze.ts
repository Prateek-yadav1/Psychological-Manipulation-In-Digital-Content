import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  analyzeWithAI,
  compareWithAI,
  ANALYSIS_VERSION,
  RUBRIC_VERSION,
  MODEL_USED,
  isEmailAnalysisResult,
  isStandardAnalysisResult,
  type OpenAIStandardAnalysisResult,
  type OpenAIEmailAnalysisResult,
} from '../lib/openai.js';
import { analyzeWithTransformer } from '../lib/transformerFallback.js';
import { extractEvidence, buildHighlightedWordsFromEvidence } from '../lib/evidenceExtractor.js';
import { scrapeUrl, isValidUrl } from '../lib/firecrawl.js';
import {
  scoreToLabel, scoreToRisk, getRecommendedAction,
  getCalibrationVersion, getMinTextLength,
  getEmailLabel, getEmailRiskLevel, getEmailRecommendedAction, getEmailManipulationDescription,
} from '../lib/calibration.js';
import { ApiError } from '../middleware/errorHandler.js';

export const analyzeRouter = Router();

// ─── Request schemas ──────────────────────────────────────────────────────────
const AnalyzeRequestSchema = z.object({
  text:        z.string().trim().min(1, 'Please enter some text or URL to analyse.').max(50_000),
  mode:        z.enum(['news', 'email']),
  inputMethod: z.enum(['text', 'url', 'upload']),
  inputUrl:    z.string().optional().or(z.literal('')),
});

const CompareRequestSchema = z.object({
  textA: z.string().trim().min(1).max(50_000),
  textB: z.string().trim().min(1).max(50_000),
});

// ─── Safeguard helpers ────────────────────────────────────────────────────────
interface SafeguardResult { ok: boolean; reason?: string }

function runSafeguards(text: string): SafeguardResult {
  const MIN_LEN    = getMinTextLength();
  const trimmed    = text.trim();
  const wordCount  = trimmed.split(/\s+/).filter(Boolean).length;
  const charCount  = trimmed.length;

  if (charCount < MIN_LEN) {
    return { ok: false, reason: `Text must be at least ${MIN_LEN} characters. Please provide more content for a reliable analysis.` };
  }
  if (wordCount < 4) {
    return { ok: false, reason: 'Text is too short for reliable analysis. Please provide at least 4 words.' };
  }
  if (charCount > 50_000) {
    return { ok: false, reason: 'Text exceeds the 50,000 character limit. Please shorten it.' };
  }
  return { ok: true };
}

/** Build source info for URL-mode analyses */
function buildSourceInfo(url: string, trustScore: number) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return {
      domain,
      credibilityScore:        trustScore,
      domainAge:               'Unknown',
      sslVerified:             url.startsWith('https'),
      trustLevel:              (trustScore > 60 ? 'High' : trustScore > 35 ? 'Medium' : 'Low') as 'High' | 'Medium' | 'Low',
      citedSources:            0,
      authorCredentials:       'Unknown' as const,
      factCheckHistory:        'Not checked',
      editorialStandards:      'Unknown',
      independentVerification: 'Not verified',
    };
  } catch {
    return undefined;
  }
}

// ─── POST /api/analyze ────────────────────────────────────────────────────────
analyzeRouter.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    // 1. Validate request body
    const parsed = AnalyzeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ApiError(400, parsed.error.errors[0]?.message ?? 'Invalid request.'));
    }

    let { text, mode, inputMethod, inputUrl } = parsed.data;

    // 2. If inputMethod is 'url' or text is a URL, extract article text if text is short or is the URL
    if (inputMethod === 'url' || isValidUrl(text.trim())) {
      const candidateUrl = (inputMethod === 'url' && inputUrl && isValidUrl(inputUrl))
        ? inputUrl
        : text.trim();

      if (isValidUrl(candidateUrl) && (text.trim() === candidateUrl || text.trim().length < 100)) {
        try {
          const scraped = await scrapeUrl(candidateUrl);
          text = `${scraped.title}\n\n${scraped.bodyText}`;
          if (!inputUrl) inputUrl = candidateUrl;
        } catch (scrapeErr) {
          if (text.trim() === candidateUrl) {
            return next(new ApiError(422, `Could not extract text from URL: ${(scrapeErr as Error).message}. You can copy and paste the text directly.`));
          }
        }
      }
    }

    // 3. Run input safeguards
    const safeguard = runSafeguards(text);
    if (!safeguard.ok) {
      return next(new ApiError(422, safeguard.reason!));
    }

    try {
      const localEvidence = extractEvidence(text, mode);
      let tierUsed: 'transformer' | 'llm' | 'rule_based' = 'rule_based';

      // ─────────────────────────────────────────────────────────────────────────
      // Mode: EMAIL
      // ─────────────────────────────────────────────────────────────────────────
      if (mode === 'email') {
        let aiEmail: OpenAIEmailAnalysisResult | null = null;
        try {
          const res = await analyzeWithAI(text, 'email');
          if (isEmailAnalysisResult(res)) {
            aiEmail = res;
            tierUsed = 'llm';
          }
        } catch {
          console.warn('[MindGuard] Tier 1 failed for email, trying Tier 2...');
          try {
            const res = await analyzeWithTransformer(text, 'email');
            if (isEmailAnalysisResult(res)) {
              aiEmail = res;
              tierUsed = 'transformer';
            }
          } catch {
            tierUsed = 'rule_based';
          }
        }

        if (aiEmail) {
          const localScore = localEvidence.manipulationScore;
          const emailScore = Math.max(aiEmail.manipulation_score, localScore);
          const emailLabel = getEmailLabel(
            emailScore,
            localScore > aiEmail.manipulation_score ? undefined : aiEmail.email_label,
          );
          const riskLevel = getEmailRiskLevel(emailLabel);
          const recommendedAction = aiEmail.recommended_action || getEmailRecommendedAction(emailLabel);
          const manipulationDescription = getEmailManipulationDescription(emailLabel);

          const highlightedWords = buildHighlightedWordsFromEvidence(text, localEvidence.tacticEvidence);
          const tacticEvidence = localEvidence.tacticEvidence.map(t => ({
            tactic:       t.tactic,
            phrases:      t.phrases,
            score:        t.score,
            contribution: t.contribution,
            description:  t.description,
          }));

          const result = {
            id:                crypto.randomUUID(),
            timestamp:         new Date().toISOString(),
            mode,
            inputMethod,
            inputText:         text,
            inputUrl:          inputUrl || undefined,

            manipulationScore: emailScore,
            trustScore:        Math.max(0, 100 - emailScore),
            confidence:        aiEmail.confidence,
            biasLevel:         Math.round((aiEmail.dimension_scores.social_engineering_tactics + aiEmail.dimension_scores.sender_legitimacy) / 2),
            emotionalIntensity:aiEmail.dimension_scores.threat_fear,
            urgencyScore:      aiEmail.dimension_scores.urgency_pressure,
            authorityScore:    aiEmail.dimension_scores.sender_legitimacy,
            riskLevel,

            tactics: [
              { name: 'Sender',    value: aiEmail.dimension_scores.sender_legitimacy,         color: '#FF3B5C' },
              { name: 'Urgency',   value: aiEmail.dimension_scores.urgency_pressure,          color: '#FFB347' },
              { name: 'Threat',    value: aiEmail.dimension_scores.threat_fear,               color: '#7C3AED' },
              { name: 'Creds',     value: aiEmail.dimension_scores.credential_payment_request, color: '#3B82F6' },
            ],
            radarData: [
              { metric: 'Sender',   value: aiEmail.dimension_scores.sender_legitimacy },
              { metric: 'Urgency',  value: aiEmail.dimension_scores.urgency_pressure },
              { metric: 'Threat',   value: aiEmail.dimension_scores.threat_fear },
              { metric: 'Creds',    value: aiEmail.dimension_scores.credential_payment_request },
              { metric: 'Links',    value: aiEmail.dimension_scores.link_url_analysis },
              { metric: 'SocEng',   value: aiEmail.dimension_scores.social_engineering_tactics },
            ],
            barData: [
              { tactic: 'Sender',    score: aiEmail.dimension_scores.sender_legitimacy },
              { tactic: 'Urgency',   score: aiEmail.dimension_scores.urgency_pressure },
              { tactic: 'Threat',    score: aiEmail.dimension_scores.threat_fear },
              { tactic: 'Creds',     score: aiEmail.dimension_scores.credential_payment_request },
              { tactic: 'Links',     score: aiEmail.dimension_scores.link_url_analysis },
            ],

            suspiciousPhrases: aiEmail.red_flags.slice(0, 10).map(phrase => ({
              phrase,
              risk: (riskLevel === 'critical' || riskLevel === 'high' ? 'high' : 'medium') as 'high' | 'medium',
              category: 'Email',
            })),
            highlightedWords,

            neutralRewrite:    text,
            explanation:       aiEmail.explanation,
            recommendedAction,

            tacticEvidence,
            calibratedLabel:   emailLabel,
            localScore:        localEvidence.manipulationScore,

            source: (inputMethod === 'url' && inputUrl)
              ? buildSourceInfo(inputUrl, Math.max(0, 100 - emailScore))
              : undefined,

            emailLabel,
            emailRiskLevel: riskLevel,
            emailRecommendedAction: recommendedAction,
            emailManipulationDescription: manipulationDescription,
            cognitiveBiasExploited: aiEmail.cognitive_bias_exploited,
            manipulationTactic: aiEmail.manipulation_tactic,
            dimensionScores:     aiEmail.dimension_scores,
            redFlags:            aiEmail.red_flags,
            legitimateIndicators:aiEmail.legitimate_indicators,
            tier_used:           tierUsed,

            _meta: {
              analysisVersion:    ANALYSIS_VERSION,
              rubricVersion:      RUBRIC_VERSION,
              calibrationVersion: getCalibrationVersion(),
              modelUsed:          MODEL_USED,
            },
          };

          res.json(result);
          return;
        }

        // Email rule-based fallback
        const emailScore = localEvidence.manipulationScore;
        const emailLabel = getEmailLabel(emailScore, localEvidence.emailLabel);
        const riskLevel = getEmailRiskLevel(emailLabel);
        const recommendedAction = getEmailRecommendedAction(emailLabel);
        const manipulationDescription = getEmailManipulationDescription(emailLabel);
        const highlightedWords = buildHighlightedWordsFromEvidence(text, localEvidence.tacticEvidence);
        const redFlags = localEvidence.emailEvidence ?? [];
        const tacticEvidence = localEvidence.tacticEvidence.map(t => ({
          tactic: t.tactic,
          phrases: t.phrases,
          score: t.score,
          contribution: t.contribution,
          description: t.description,
        }));
        const dimensionScores = {
          sender_legitimacy: Math.min(100, Math.max(0, Math.round(emailScore * 0.75))),
          urgency_pressure: Math.min(100, Math.max(0, Math.round(emailScore * 0.85))),
          threat_fear: Math.min(100, Math.max(0, Math.round(emailScore * 0.8))),
          credential_payment_request: Math.min(100, Math.max(0, Math.round(emailScore * 0.9))),
          link_url_analysis: Math.min(100, Math.max(0, Math.round(emailScore * 0.7))),
          social_engineering_tactics: Math.min(100, Math.max(0, Math.round(emailScore * 0.78))),
        };

        const result = {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          mode,
          inputMethod,
          inputText: text,
          inputUrl: inputUrl || undefined,

          manipulationScore: emailScore,
          trustScore: Math.max(0, 100 - emailScore),
          confidence: 75,
          biasLevel: Math.round((dimensionScores.social_engineering_tactics + dimensionScores.sender_legitimacy) / 2),
          emotionalIntensity: dimensionScores.threat_fear,
          urgencyScore: dimensionScores.urgency_pressure,
          authorityScore: dimensionScores.sender_legitimacy,
          riskLevel,

          tactics: [
            { name: 'Sender', value: dimensionScores.sender_legitimacy, color: '#FF3B5C' },
            { name: 'Urgency', value: dimensionScores.urgency_pressure, color: '#FFB347' },
            { name: 'Threat', value: dimensionScores.threat_fear, color: '#7C3AED' },
            { name: 'Creds', value: dimensionScores.credential_payment_request, color: '#3B82F6' },
          ],
          radarData: [
            { metric: 'Sender', value: dimensionScores.sender_legitimacy },
            { metric: 'Urgency', value: dimensionScores.urgency_pressure },
            { metric: 'Threat', value: dimensionScores.threat_fear },
            { metric: 'Creds', value: dimensionScores.credential_payment_request },
            { metric: 'Links', value: dimensionScores.link_url_analysis },
            { metric: 'SocEng', value: dimensionScores.social_engineering_tactics },
          ],
          barData: [
            { tactic: 'Sender', score: dimensionScores.sender_legitimacy },
            { tactic: 'Urgency', score: dimensionScores.urgency_pressure },
            { tactic: 'Threat', score: dimensionScores.threat_fear },
            { tactic: 'Creds', score: dimensionScores.credential_payment_request },
            { tactic: 'Links', score: dimensionScores.link_url_analysis },
          ],

          suspiciousPhrases: redFlags.slice(0, 10).map(phrase => ({
            phrase,
            risk: (riskLevel === 'critical' || riskLevel === 'high' ? 'high' : 'medium') as 'high' | 'medium',
            category: 'Email',
          })),
          highlightedWords,
          neutralRewrite: text,
          explanation: localEvidence.evidenceSummary,
          recommendedAction,
          tacticEvidence,
          calibratedLabel: emailLabel,
          localScore: localEvidence.manipulationScore,
          source: (inputMethod === 'url' && inputUrl)
            ? buildSourceInfo(inputUrl, Math.max(0, 100 - emailScore))
            : undefined,
          emailLabel,
          emailRiskLevel: riskLevel,
          emailRecommendedAction: recommendedAction,
          emailManipulationDescription: manipulationDescription,
          cognitiveBiasExploited:
            emailLabel === 'urgency_manipulation' ? 'scarcity_bias'
              : emailLabel === 'authority_exploitation' ? 'authority_bias'
                : emailLabel === 'fear_induction' || emailLabel === 'identity_deception' ? 'fear_bias'
                  : emailLabel === 'financial_manipulation' ? 'greed_bias'
                    : emailLabel === 'mild_influence' ? 'loss_aversion'
                      : 'none',
          manipulationTactic: localEvidence.dominantTactic ?? 'No strong manipulation tactic detected',
          dimensionScores,
          redFlags,
          legitimateIndicators: [],
          tier_used: tierUsed,
          _meta: {
            analysisVersion: ANALYSIS_VERSION,
            rubricVersion: RUBRIC_VERSION,
            calibrationVersion: getCalibrationVersion(),
            modelUsed: MODEL_USED,
          },
        };

        res.json(result);
        return;
      }

      // ─────────────────────────────────────────────────────────────────────────
      // Mode: NEWS / ARTICLE / OTHER DIGITAL CONTENT
      // ─────────────────────────────────────────────────────────────────────────
      let aiStandard: OpenAIStandardAnalysisResult | null = null;
      try {
        const res = await analyzeWithAI(text, 'news');
        if (isStandardAnalysisResult(res)) {
          aiStandard = res;
          tierUsed = 'llm';
          console.log(`[MindGuard] tier_used=${tierUsed}`);
        }
      } catch {
        console.warn('[MindGuard] Tier 1 failed for news, trying Tier 2...');
        try {
          const res = await analyzeWithTransformer(text, 'news');
          if (isStandardAnalysisResult(res)) {
            aiStandard = res;
            tierUsed = 'transformer';
            console.log(`[MindGuard] tier_used=${tierUsed}`);
          }
        } catch {
          console.warn('[MindGuard] Tier 2 failed, using Tier 3 (Rule-based)...');
          tierUsed = 'rule_based';
        }
      }

      if (!aiStandard) {
        const score = localEvidence.manipulationScore;
        const highlightedWords = buildHighlightedWordsFromEvidence(text, localEvidence.tacticEvidence);
        const tacticEvidence = localEvidence.tacticEvidence.map(t => ({
          tactic: t.tactic,
          phrases: t.phrases,
          score: t.score,
          contribution: t.contribution,
          description: t.description,
        }));
        const suspiciousPhrases = tacticEvidence
          .flatMap(t => t.phrases.map(phrase => ({
            phrase,
            risk: (t.score >= 30 ? 'high' : 'medium') as 'high' | 'medium',
            category: t.tactic,
          })))
          .slice(0, 10);

        const fallbackTactics = tacticEvidence.slice(0, 4).map((t, idx) => ({
          name: t.tactic.split(' ')[0] || `Tactic${idx + 1}`,
          value: Math.min(100, Math.max(0, t.contribution)),
          color: ['#FF3B5C', '#FFB347', '#7C3AED', '#3B82F6'][idx] ?? '#00E5CC',
        }));

        const result = {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          mode,
          inputMethod,
          inputText: text,
          inputUrl: inputUrl || undefined,
          manipulationScore: score,
          trustScore: Math.max(0, 100 - score),
          confidence: 75,
          biasLevel: Math.min(100, Math.max(0, Math.round(score * 0.8))),
          emotionalIntensity: Math.min(100, Math.max(0, Math.round(score * 0.85))),
          urgencyScore: Math.min(100, Math.max(0, Math.round(score * 0.75))),
          authorityScore: Math.min(100, Math.max(0, Math.round(score * 0.7))),
          riskLevel: scoreToRisk(score),
          tactics: fallbackTactics.length > 0 ? fallbackTactics : [
            { name: 'Emotional', value: 0, color: '#FF3B5C' },
            { name: 'Urgency', value: 0, color: '#FFB347' },
            { name: 'Authority', value: 0, color: '#7C3AED' },
            { name: 'Bandwagon', value: 0, color: '#3B82F6' },
          ],
          radarData: [
            { metric: 'Emotional', value: Math.min(100, Math.max(0, Math.round(score * 0.85))) },
            { metric: 'Urgency', value: Math.min(100, Math.max(0, Math.round(score * 0.75))) },
            { metric: 'Bias', value: Math.min(100, Math.max(0, Math.round(score * 0.8))) },
            { metric: 'Sensational', value: Math.min(100, Math.max(0, Math.round(score * 0.7))) },
            { metric: 'Authority', value: Math.min(100, Math.max(0, Math.round(score * 0.7))) },
          ],
          barData: [
            { tactic: 'Emotional', score: Math.min(100, Math.max(0, Math.round(score * 0.85))) },
            { tactic: 'Urgency', score: Math.min(100, Math.max(0, Math.round(score * 0.75))) },
            { tactic: 'Authority', score: Math.min(100, Math.max(0, Math.round(score * 0.7))) },
            { tactic: 'Bandwagon', score: Math.min(100, Math.max(0, Math.round(score * 0.55))) },
            { tactic: 'Fear', score: Math.min(100, Math.max(0, Math.round(score * 0.8))) },
          ],
          suspiciousPhrases,
          highlightedWords,
          neutralRewrite: text,
          explanation: localEvidence.evidenceSummary,
          recommendedAction: getRecommendedAction(score),
          tacticEvidence,
          calibratedLabel: scoreToLabel(score),
          localScore: localEvidence.manipulationScore,
          source: (inputMethod === 'url' && inputUrl)
            ? buildSourceInfo(inputUrl, Math.max(0, 100 - score))
            : undefined,
          tier_used: tierUsed,
          _meta: {
            analysisVersion: ANALYSIS_VERSION,
            rubricVersion: RUBRIC_VERSION,
            calibrationVersion: getCalibrationVersion(),
            modelUsed: MODEL_USED,
          },
        };

        res.json(result);
        return;
      }

      // AI standard result available
      const highlightedWords = buildHighlightedWordsFromEvidence(
        text,
        aiStandard.tacticEvidence?.length
          ? aiStandard.tacticEvidence.map(t => ({
              tactic:   t.tactic,
              tacticId: t.tactic.toLowerCase().replace(/\s+/g, '_'),
              phrases:  t.phrases,
              score:    t.score,
              contribution: t.contribution,
              risk:     (aiStandard!.riskLevel === 'high' ? 'high' : aiStandard!.riskLevel === 'medium' ? 'medium' : 'low') as 'low' | 'medium' | 'high',
              description: t.description,
            }))
          : localEvidence.tacticEvidence,
      );

      const tacticEvidence = aiStandard.tacticEvidence?.length
        ? aiStandard.tacticEvidence
        : localEvidence.tacticEvidence.map(t => ({
            tactic:       t.tactic,
            phrases:      t.phrases,
            score:        t.score,
            contribution: t.contribution,
            description:  t.description,
          }));

      const finalScore = aiStandard.manipulationScore;
      const calibratedLabel  = scoreToLabel(finalScore);
      const recommendedAction = aiStandard.recommendedAction || getRecommendedAction(finalScore);

      const result = {
        id:                crypto.randomUUID(),
        timestamp:         new Date().toISOString(),
        mode,
        inputMethod,
        inputText:         text,
        inputUrl:          inputUrl || undefined,

        manipulationScore: finalScore,
        trustScore:        aiStandard.trustScore,
        confidence:        aiStandard.confidence,
        biasLevel:         aiStandard.biasLevel,
        emotionalIntensity:aiStandard.emotionalIntensity,
        urgencyScore:      aiStandard.urgencyScore,
        authorityScore:    aiStandard.authorityScore,
        riskLevel:         scoreToRisk(finalScore),

        tactics:           aiStandard.tactics,
        radarData:         aiStandard.radarData,
        barData:           aiStandard.barData,

        suspiciousPhrases: aiStandard.suspiciousPhrases,
        highlightedWords,

        neutralRewrite:    aiStandard.neutralRewrite,
        explanation:       aiStandard.explanation,
        recommendedAction,

        tacticEvidence,
        calibratedLabel,
        localScore:        localEvidence.manipulationScore,

        source: (inputMethod === 'url' && inputUrl)
          ? buildSourceInfo(inputUrl, aiStandard.trustScore)
          : undefined,
        tier_used:         tierUsed,

        _meta: {
          analysisVersion:    ANALYSIS_VERSION,
          rubricVersion:      RUBRIC_VERSION,
          calibrationVersion: getCalibrationVersion(),
          modelUsed:          MODEL_USED,
        },
      };

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/analyze/compare ────────────────────────────────────────────────
analyzeRouter.post(
  '/compare',
  async (req: Request, res: Response, next: NextFunction) => {
    const parsed = CompareRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ApiError(400, parsed.error.errors[0]?.message ?? 'Invalid request.'));
    }

    const { textA, textB } = parsed.data;

    // Safeguard both texts
    const sgA = runSafeguards(textA);
    if (!sgA.ok) return next(new ApiError(422, `Text A: ${sgA.reason}`));
    const sgB = runSafeguards(textB);
    if (!sgB.ok) return next(new ApiError(422, `Text B: ${sgB.reason}`));

    try {
      const ai          = await compareWithAI(textA, textB);
      const wordCountA  = textA.split(/\s+/).filter(Boolean).length;
      const wordCountB  = textB.split(/\s+/).filter(Boolean).length;

      const buildTags = (
        tactics: typeof ai.tacticsA,
        score:   number,
      ): Array<{ name: string; color: string }> => {
        const tags: Array<{ name: string; color: string }> = [];
        const hi  = 'bg-destructive/20 text-destructive border-destructive/40';
        const md  = 'bg-warning/20 text-warning border-warning/40';
        if (tactics.emotional  > 30) tags.push({ name: 'Emotional',  color: score > 60 ? hi : md });
        if (tactics.urgency    > 30) tags.push({ name: 'Urgency',    color: score > 60 ? hi : md });
        if (tactics.authority  > 25) tags.push({ name: 'Authority',  color: md });
        if (tactics.bandwagon  > 20) tags.push({ name: 'Bandwagon',  color: md });
        if (score              < 35) tags.push({ name: 'Factual',    color: 'bg-primary/20 text-primary border-primary/40' });
        return tags.slice(0, 4);
      };

      res.json({
        scoreA:      ai.scoreA,
        scoreB:      ai.scoreB,
        difference:  Math.abs(ai.scoreA - ai.scoreB),
        recommended: ai.recommended,
        confidence:  ai.confidence,
        explanation: ai.explanation,
        tagsA:       buildTags(ai.tacticsA, ai.scoreA),
        tagsB:       buildTags(ai.tacticsB, ai.scoreB),
        tactics: [
          { name: 'Emotional Appeal', a: ai.tacticsA.emotional,  b: ai.tacticsB.emotional,  desc: ai.tacticsA.emotional  > ai.tacticsB.emotional  ? 'Stronger emotional language in Text A' : 'Similar emotional language' },
          { name: 'Urgency Trigger',  a: ai.tacticsA.urgency,    b: ai.tacticsB.urgency,    desc: ai.tacticsA.urgency    > ai.tacticsB.urgency    ? 'Higher urgency pressure in Text A'      : 'Similar urgency levels'    },
          { name: 'Authority Claim',  a: ai.tacticsA.authority,  b: ai.tacticsB.authority,  desc: 'Authority references compared'                                                                                           },
          { name: 'Bandwagon Effect', a: ai.tacticsA.bandwagon,  b: ai.tacticsB.bandwagon,  desc: 'Conformity appeal compared'                                                                                             },
          { name: 'Fear Appeal',      a: ai.tacticsA.fear,       b: ai.tacticsB.fear,       desc: ai.tacticsA.fear       > ai.tacticsB.fear       ? 'Higher fear appeal in Text A'           : 'Similar fear levels'      },
        ],
        radarData: [
          { tactic: 'Emotional',  textA: ai.tacticsA.emotional,  textB: ai.tacticsB.emotional  },
          { tactic: 'Urgency',    textA: ai.tacticsA.urgency,    textB: ai.tacticsB.urgency    },
          { tactic: 'Authority',  textA: ai.tacticsA.authority,  textB: ai.tacticsB.authority  },
          { tactic: 'Bandwagon',  textA: ai.tacticsA.bandwagon,  textB: ai.tacticsB.bandwagon  },
          { tactic: 'Fear',       textA: ai.tacticsA.fear,       textB: ai.tacticsB.fear       },
        ],
        barData: [
          { category: 'Emotional', textA: ai.tacticsA.emotional,  textB: ai.tacticsB.emotional  },
          { category: 'Urgency',   textA: ai.tacticsA.urgency,    textB: ai.tacticsB.urgency    },
          { category: 'Authority', textA: ai.tacticsA.authority,  textB: ai.tacticsB.authority  },
          { category: 'Bandwagon', textA: ai.tacticsA.bandwagon,  textB: ai.tacticsB.bandwagon  },
          { category: 'Fear',      textA: ai.tacticsA.fear,       textB: ai.tacticsB.fear       },
        ],
        wordCountA,
        wordCountB,
        _meta: {
          analysisVersion:    ANALYSIS_VERSION,
          rubricVersion:      RUBRIC_VERSION,
          calibrationVersion: getCalibrationVersion(),
          modelUsed:          MODEL_USED,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

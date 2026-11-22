import OpenAI from 'openai';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const ANALYSIS_VERSION    = '2.0.0';
export const RUBRIC_VERSION      = '1.0';
export const GROQ_MODEL          = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
export const OPENAI_MODEL        = process.env.OPENAI_MODEL || 'gpt-4o-mini';
export const MODEL_USED          = GROQ_MODEL;

type LLMProvider = 'groq' | 'openai';

// ─── Clients (lazy-init) ──────────────────────────────────────────────────────
let _groqClient: OpenAI | null = null;
let _openaiClient: OpenAI | null = null;

function getGroqClient(): OpenAI {
  if (!_groqClient) {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set.');
    _groqClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }
  return _groqClient;
}

function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    const key = process.env.OPENAI_API_KEY;
    if (!key || key.startsWith('gsk_')) {
      throw new Error('OPENAI_API_KEY is not set or is a Groq key.');
    }
    _openaiClient = new OpenAI({ apiKey: key });
  }
  return _openaiClient;
}

function hasGroqKey(): boolean {
  return !!process.env.GROQ_API_KEY;
}

function hasOpenAIKey(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return !!key && !key.startsWith('gsk_');
}

interface ChatCompletionResult {
  raw: string;
  provider: LLMProvider;
  model: string;
}

async function chatWithFallback(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  maxTokens: number,
): Promise<ChatCompletionResult> {
  const errors: string[] = [];

  if (hasGroqKey()) {
    const groqModelsToTry = [
      GROQ_MODEL,
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
    ].filter((m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx);

    for (const modelToTry of groqModelsToTry) {
      try {
        const completion = await getGroqClient().chat.completions.create({
          model: modelToTry,
          messages,
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: maxTokens,
        });
        const raw = completion.choices[0]?.message?.content;
        if (!raw) throw new Error(`Groq (${modelToTry}) returned an empty response.`);
        return { raw, provider: 'groq', model: modelToTry };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Groq (${modelToTry}): ${msg}`);
        console.warn(`[LLM] Groq (${modelToTry}) failed: ${msg}`);
      }
    }
  }

  if (hasOpenAIKey()) {
    try {
      const completion = await getOpenAIClient().chat.completions.create({
        model: OPENAI_MODEL,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: maxTokens,
      });
      const raw = completion.choices[0]?.message?.content;
      if (!raw) throw new Error('OpenAI returned an empty response.');
      return { raw, provider: 'openai', model: OPENAI_MODEL };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`OpenAI: ${msg}`);
    }
  }

  if (!hasGroqKey() && !hasOpenAIKey()) {
    throw new Error('No LLM API key configured. Set GROQ_API_KEY and/or OPENAI_API_KEY.');
  }

  throw new Error(`All LLM providers failed: ${errors.join('; ')}`);
}

// ─── Load rubric categories for prompt injection ──────────────────────────────
interface RubricCategory {
  id: string; category: string; weight: number;
  risk_level: string; example_phrases: string[];
}

let _rubricCategories: RubricCategory[] | null = null;

function getRubricSnippet(): string {
  if (!_rubricCategories) {
    const raw = JSON.parse(readFileSync(join(__dirname, '../data/scoringRubric.json'), 'utf-8')) as { categories: RubricCategory[] };
    _rubricCategories = raw.categories;
  }
  return _rubricCategories
    .map(c => `  • ${c.category} (weight ${c.weight}, ${c.risk_level} risk): ${c.example_phrases.slice(0, 4).join(', ')}…`)
    .join('\n');
}

// ─── Zod schema ───────────────────────────────────────────────────────────────
const clampedScore = z.coerce.number().transform(v => Math.max(0, Math.min(100, Math.round(v))));

const TacticEvidenceSchema = z.object({
  tactic:       z.string().min(1),
  phrases:      z.array(z.string()).default([]),
  score:        clampedScore,
  contribution: clampedScore,
  description:  z.string().default('Detected manipulation pattern'),
});

const TacticSchema = z.object({
  name:  z.string().min(1),
  value: clampedScore,
  color: z.string().default('#00E5CC'),
});

const PhraseSchema = z.object({
  phrase:   z.string().min(1),
  risk:     z.enum(['high', 'medium', 'low', 'critical']).catch('medium'),
  category: z.string().default('General'),
});

const RadarSchema = z.object({
  metric: z.string().min(1),
  value:  clampedScore,
});

const BarSchema = z.object({
  tactic: z.string().min(1),
  score:  clampedScore,
});

export const OpenAIResponseSchema = z.object({
  manipulationScore:  clampedScore,
  trustScore:         clampedScore,
  confidence:         clampedScore,
  biasLevel:          clampedScore,
  emotionalIntensity: clampedScore,
  urgencyScore:       clampedScore,
  authorityScore:     clampedScore,
  riskLevel:          z.enum(['high', 'medium', 'low', 'critical']).catch('medium'),
  tactics:            z.array(TacticSchema).default([]),
  suspiciousPhrases:  z.array(PhraseSchema).default([]),
  radarData:          z.array(RadarSchema).default([]),
  barData:            z.array(BarSchema).default([]),
  neutralRewrite:     z.string().default(''),
  explanation:        z.string().default('Analysis complete.'),
  recommendedAction:  z.string().default('Review content critically.'),
  tacticEvidence:     z.array(TacticEvidenceSchema).default([]),
});

export const EmailOpenAIResponseSchema = z.object({
  email_label: z.string().transform(v => {
    const norm = v.toLowerCase().trim().replace(/[\s-]+/g, '_');
    const valid = [
      'legitimate',
      'mild_influence',
      'fear_induction',
      'urgency_manipulation',
      'authority_exploitation',
      'financial_manipulation',
      'identity_deception',
    ];
    return (valid.includes(norm) ? norm : 'mild_influence') as
      | 'legitimate'
      | 'mild_influence'
      | 'fear_induction'
      | 'urgency_manipulation'
      | 'authority_exploitation'
      | 'financial_manipulation'
      | 'identity_deception';
  }),
  manipulation_score: clampedScore,
  risk_level: z.enum(['low', 'medium', 'high', 'critical']).catch('medium'),
  confidence: clampedScore,
  dimension_scores: z.object({
    sender_legitimacy:          clampedScore,
    urgency_pressure:           clampedScore,
    threat_fear:                clampedScore,
    credential_payment_request: clampedScore,
    link_url_analysis:          clampedScore,
    social_engineering_tactics: clampedScore,
  }),
  manipulation_tactic:      z.string().default('General persuasion'),
  cognitive_bias_exploited: z.string().default('none'),
  red_flags:                z.array(z.string()).default([]),
  legitimate_indicators:    z.array(z.string()).default([]),
  recommended_action:       z.string().default('Exercise standard caution.'),
  explanation:              z.string().default('Email evaluated against manipulation taxonomy.'),
});

export type OpenAIStandardAnalysisResult = z.infer<typeof OpenAIResponseSchema>;
export type OpenAIEmailAnalysisResult = z.infer<typeof EmailOpenAIResponseSchema>;
export type OpenAIAnalysisResult = OpenAIStandardAnalysisResult | OpenAIEmailAnalysisResult;

export function isStandardAnalysisResult(result: OpenAIAnalysisResult): result is OpenAIStandardAnalysisResult {
  return 'manipulationScore' in result;
}

export function isEmailAnalysisResult(result: OpenAIAnalysisResult): result is OpenAIEmailAnalysisResult {
  return 'manipulation_score' in result;
}

// ─── Prompts ──────────────────────────────────────────────────────────────────
function buildSystemPrompt(): string {
  return `You are an expert cognitive psychologist and media literacy researcher. You analyse text for psychological manipulation, propaganda, and deceptive language patterns using a structured, evidence-based rubric.

SCORING RUBRIC (use these 11 categories — cite exact phrases as evidence):
${getRubricSnippet()}

CONFIDENCE SCORING:
• High confidence (85-98): ≥3 distinct tactics detected with clear phrase evidence
• Medium confidence (65-84): 1-2 tactics detected or ambiguous signals
• Low confidence (50-64): Very short text, few signals, or highly ambiguous

SCORING GUIDE:
• 0-20:  Neutral — factual, objective, standard journalistic reporting with no meaningful manipulation
• 21-40: Mild — minor persuasive language or subtle marketing rhetoric
• 41-60: Moderate — clear emotional appeal, urgency, or selective framing
• 61-80: Strong — multiple concurrent high-risk tactics (fear, urgency, false authority, outrage)
• 81-100: Extreme — maximum manipulation (conspiracy theories, severe fearmongering, deceptive propaganda)

IMPORTANT: Every score must be traceable to specific evidence. Do not guess. If text is neutral, set manipulationScore ≤ 20 and confidence accordingly.

Return ONLY valid JSON — no prose, no markdown.`;
}

function buildUserPrompt(text: string, mode: string): string {
  return `Analyse this ${mode} content for manipulation tactics.

TEXT (${text.length} characters):
"""
${text.substring(0, 8000)}
"""

Return ONLY a JSON object with this EXACT structure:
{
  "manipulationScore": <integer 0-100, computed from tactic evidence>,
  "trustScore": <integer 0-100, generally 100 - manipulationScore>,
  "confidence": <integer 50-98, based on evidence density>,
  "biasLevel": <integer 0-100>,
  "emotionalIntensity": <integer 0-100>,
  "urgencyScore": <integer 0-100>,
  "authorityScore": <integer 0-100>,
  "riskLevel": "high" | "medium" | "low",
  "tactics": [
    {"name": "Emotional",  "value": <integer 0-100>, "color": "#FF3B5C"},
    {"name": "Urgency",    "value": <integer 0-100>, "color": "#FFB347"},
    {"name": "Authority",  "value": <integer 0-100>, "color": "#7C3AED"},
    {"name": "Bandwagon",  "value": <integer 0-100>, "color": "#3B82F6"}
  ],
  "suspiciousPhrases": [
    {"phrase": "<exact phrase from text>", "risk": "high"|"medium"|"low", "category": "<rubric category>"}
  ],
  "radarData": [
    {"metric": "Emotional",   "value": <0-100>},
    {"metric": "Urgency",     "value": <0-100>},
    {"metric": "Bias",        "value": <0-100>},
    {"metric": "Sensational", "value": <0-100>},
    {"metric": "Authority",   "value": <0-100>}
  ],
  "barData": [
    {"tactic": "Emotional",  "score": <0-100>},
    {"tactic": "Urgency",    "score": <0-100>},
    {"tactic": "Authority",  "score": <0-100>},
    {"tactic": "Bandwagon",  "score": <0-100>},
    {"tactic": "Fear",       "score": <0-100>}
  ],
  "neutralRewrite": "<neutral, objective version of the content>",
  "explanation": "<2-3 sentence factual explanation of key manipulation tactics detected>",
  "recommendedAction": "<specific actionable recommendation for the reader>",
  "tacticEvidence": [
    {
      "tactic": "<rubric category name>",
      "phrases": ["<exact phrase from text>", ...],
      "score": <integer 0-50, contribution to total score>,
      "contribution": <same as score>,
      "description": "<why this is manipulative>"
    }
  ]
}

RULES:
• tacticEvidence must contain detected tactics with real phrases from the text
• manipulationScore must be consistent with the tacticEvidence scores
• riskLevel: "high" if manipulationScore >= 61, "medium" if 41-60, "low" if <= 40
• suspiciousPhrases: cite 2-8 exact phrases from the text
• If text is neutral with no manipulation, return manipulationScore ≤ 20 and empty or minimal tacticEvidence`;
}

function buildEmailSystemPrompt(): string {
  return `You are ManipuLens AI's email security analyst. Analyze the provided email for manipulation, phishing, and deception tactics.

CLASSIFICATION LABELS - COGNITIVE MANIPULATION TAXONOMY (choose exactly one):

- "legitimate": No manipulation. Straightforward informational email.
  Examples: transaction confirmations, OTPs, appointments, bookings.
  Score: 0-15.

- "mild_influence": Uses standard persuasion - social proof, mild urgency,
  promotional language. Legitimate businesses use this.
  Examples: sale emails, newsletters, subscription reminders.
  Score: 16-30.

- "fear_induction": Deliberately creates fear or anxiety to pressure action.
  Threat may be exaggerated or false.
  Examples: "account will be suspended", "unusual activity detected",
  fake security alerts.
  Score: 31-50.

- "urgency_manipulation": Exploits artificial time pressure to bypass
  rational thinking. Deadlines are fake or exaggerated.
  Examples: "respond in 24 hours or account closed",
  "offer expires tonight", fake delivery reschedule fee.
  Score: 46-65.

- "authority_exploitation": Impersonates bank, government, company, or
  senior official to gain unquestioned compliance.
  Examples: fake RBI/TRAI/CBI notices, fake IT department emails,
  fake CEO wire transfer requests, SBI/HDFC KYC fraud.
  Score: 61-75.

- "financial_manipulation": Exploits greed or financial anxiety through
  false promises or threats. Always involves money.
  Examples: lottery prizes, investment fraud, advance fee scams,
  fake IT refunds, job offer with deposit, Shark Tank fraud.
  Score: 71-85.

- "identity_deception": Highest threat. Combines impersonation + fear +
  urgency + isolation to completely override rational thinking.
  Goal: steal credentials, OTP, full bank details, or large sums.
  Examples: CBI arrest threat, UPI PIN phishing, CEO BEC fraud,
  full credential harvesting (Aadhaar + PAN + password + OTP).
  Score: 83-100.

Return ONLY valid JSON:
{
  "email_label": "legitimate" | "mild_influence" | "fear_induction" | "urgency_manipulation" | "authority_exploitation" | "financial_manipulation" | "identity_deception",
  "manipulation_score": <0-100>,
  "risk_level": "low" | "medium" | "high" | "critical",
  "confidence": <0-100>,
  "dimension_scores": {
    "sender_legitimacy": <0-100>,
    "urgency_pressure": <0-100>,
    "threat_fear": <0-100>,
    "credential_payment_request": <0-100>,
    "link_url_analysis": <0-100>,
    "social_engineering_tactics": <0-100>
  },
  "manipulation_tactic": "primary manipulation tactic used in 1 sentence",
  "cognitive_bias_exploited": "which cognitive bias is being exploited e.g. loss aversion, authority bias, scarcity bias",
  "red_flags": ["specific", "suspicious", "phrases", "found"],
  "legitimate_indicators": ["trust", "signals", "found"],
  "recommended_action": "string explaining what user should do",
  "explanation": "2-3 sentence plain language explanation for the user"
}`;
}

function buildEmailUserPrompt(text: string): string {
  return `Analyze this email content.

EMAIL (${text.length} characters):
"""
${text.substring(0, 8000)}
"""

Return ONLY valid JSON with the exact schema in the system instructions.`;
}

// ─── Compare prompt ───────────────────────────────────────────────────────────
const CompareResponseSchema = z.object({
  scoreA:       clampedScore,
  scoreB:       clampedScore,
  confidence:   clampedScore,
  recommended:  z.enum(['A', 'B']).catch('A'),
  explanation:  z.string().default('Comparison completed.'),
  tacticsA: z.object({
    emotional:  clampedScore,
    urgency:    clampedScore,
    authority:  clampedScore,
    bandwagon:  clampedScore,
    fear:       clampedScore,
  }),
  tacticsB: z.object({
    emotional:  clampedScore,
    urgency:    clampedScore,
    authority:  clampedScore,
    bandwagon:  clampedScore,
    fear:       clampedScore,
  }),
});

export type CompareResult = z.infer<typeof CompareResponseSchema>;

function buildComparePrompt(textA: string, textB: string): string {
  return `Compare these two texts for manipulation tactics using the scoring rubric. Return ONLY a JSON object.

TEXT A:
"""
${textA.substring(0, 4000)}
"""

TEXT B:
"""
${textB.substring(0, 4000)}
"""

Return ONLY:
{
  "scoreA": <integer 0-100>,
  "scoreB": <integer 0-100>,
  "confidence": <integer 60-98>,
  "recommended": "A"|"B" (whichever is LESS manipulative / more trustworthy),
  "explanation": "<2-3 sentence comparison summary with evidence>",
  "tacticsA": {
    "emotional": <0-100>, "urgency": <0-100>, "authority": <0-100>,
    "bandwagon": <0-100>, "fear": <0-100>
  },
  "tacticsB": {
    "emotional": <0-100>, "urgency": <0-100>, "authority": <0-100>,
    "bandwagon": <0-100>, "fear": <0-100>
  }
}`;
}

// ─── Retry helper ─────────────────────────────────────────────────────────────
async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < retries) await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

// ─── Main analysis function with overloads ────────────────────────────────────
export async function analyzeWithAI(
  text: string,
  mode: 'email',
): Promise<OpenAIEmailAnalysisResult>;
export async function analyzeWithAI(
  text: string,
  mode: 'news' | string,
): Promise<OpenAIStandardAnalysisResult>;
export async function analyzeWithAI(
  text: string,
  mode: string,
): Promise<OpenAIAnalysisResult> {
  return withRetry(async () => {
    const isEmailMode = mode === 'email';
    const { raw, provider, model } = await chatWithFallback(
      [
        { role: 'system', content: isEmailMode ? buildEmailSystemPrompt() : buildSystemPrompt() },
        { role: 'user',   content: isEmailMode ? buildEmailUserPrompt(text) : buildUserPrompt(text, mode) },
      ],
      3000,
    );

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`${provider} (${model}) returned invalid JSON.`);
    }

    const validated = isEmailMode
      ? EmailOpenAIResponseSchema.safeParse(parsed)
      : OpenAIResponseSchema.safeParse(parsed);
    if (!validated.success) {
      console.error(`[${provider}] Schema validation failed:`, validated.error.flatten());
      throw new Error(`${provider} response did not match the expected schema. Please try again.`);
    }

    return validated.data;
  });
}

// ─── Comparison analysis ──────────────────────────────────────────────────────
export async function compareWithAI(
  textA: string,
  textB: string,
): Promise<CompareResult> {
  return withRetry(async () => {
    const { raw, provider } = await chatWithFallback(
      [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user',   content: buildComparePrompt(textA, textB) },
      ],
      800,
    );

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`${provider} returned invalid JSON.`);
    }

    const validated = CompareResponseSchema.safeParse(parsed);
    if (!validated.success) {
      console.error(`[${provider} compare] Schema validation failed:`, validated.error.flatten());
      throw new Error(`${provider} comparison response did not match expected schema.`);
    }

    return validated.data;
  });
}

/**
 * MindGuard Evidence Extractor
 *
 * Deterministic, rubric-based local scorer.
 * Used for:
 * 1. Benchmark evaluation (fast, no API cost)
 * 2. Cross-validation of OpenAI scores
 * 3. Phrase-level evidence extraction for transparency
 * 4. Reliable offline / rule-based fallback
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RubricCategory {
  id:              string;
  category:        string;
  description:     string;
  weight:          number;
  risk_level:      'low' | 'medium' | 'high';
  example_phrases: string[];
}

export interface TacticEvidence {
  tactic:       string;
  tacticId:     string;
  phrases:      string[];
  score:        number;
  contribution: number;
  risk:         'low' | 'medium' | 'high';
  description:  string;
}

export interface ExtractionResult {
  manipulationScore:  number;
  tacticsFound:       number;
  tacticEvidence:     TacticEvidence[];
  capsBonus:          number;
  exclamBonus:        number;
  categoryScores:     Record<string, number>;
  dominantTactic:     string | null;
  evidenceSummary:    string;
  emailLabel?:        'legitimate' | 'mild_influence' | 'fear_induction' | 'urgency_manipulation' | 'authority_exploitation' | 'financial_manipulation' | 'identity_deception';
  emailEvidence?:     string[];
}

// ─── Load rubric once ─────────────────────────────────────────────────────────
let _rubric: RubricCategory[] | null = null;

function getRubric(): RubricCategory[] {
  if (_rubric) return _rubric;
  const rubricPath = join(__dirname, '../data/scoringRubric.json');
  const raw = JSON.parse(readFileSync(rubricPath, 'utf-8')) as { categories: RubricCategory[] };
  _rubric = raw.categories;
  return _rubric;
}

// ─── Extended Manipulation Vocabulary ─────────────────────────────────────────
const EXTENDED_TACTIC_PATTERNS: Record<string, string[]> = {
  urgency: [
    'act now', 'immediately', 'within 24 hours', 'within 48 hours', 'within 2 hours',
    'last chance', 'expires today', 'time is running out', 'respond immediately',
    'before midnight', 'breaking:', 'breaking news', "don't wait", 'hurry',
    "before it's too late", 'right now', 'urgent alert', 'critical deadline',
    'must see', 'must read', 'urgent:', 'do not delay', 'action required today',
  ],
  fear: [
    'you will lose everything', 'account will be suspended', 'account may be suspended',
    'account will be closed', 'account will be frozen', 'access will be restricted',
    'serious consequences', 'your safety is at risk', 'dangerous situation',
    'you could be arrested', 'security threat', 'catastrophic consequences',
    'doomsday', 'terrifying', 'deadly threat', 'imminent collapse',
    'dangerously close', 'fatal', 'grave danger', 'peril', 'panic',
    'disaster strikes', 'horrifying danger', 'under attack', 'catastrophe',
  ],
  authority: [
    'government approved', 'official notification', 'experts confirm',
    'experts reveal', 'experts say', 'scientists reveal', 'scientists warn',
    'according to authorities', 'mandatory compliance', 'legal action',
    'regulatory requirement', 'official announcement', 'insiders confirm',
    'top officials warn', 'whistleblower exposes', 'undeniable proof',
    'unquestionable fact', 'official decree', 'court order', 'law enforcement',
  ],
  scarcity: [
    'limited availability', 'only a few left', 'exclusive opportunity',
    'limited time offer', 'only today', 'while stocks last', 'one time opportunity',
    'last few spots', 'rare access', 'secretly available', 'never seen before',
    'before it gets taken down', 'spots are filling up', 'almost sold out',
  ],
  social_proof: [
    'everyone is doing it', 'millions of people agree', 'everyone knows',
    'everyone must know', 'join thousands of people', 'the majority believes',
    'widely accepted', 'people everywhere', 'trending worldwide',
    'everybody is talking about', 'millions are switching', 'no one can deny',
    'all smart people', 'the world is watching',
  ],
  emotional_appeal: [
    'think about your family', 'how could you allow this', 'shocking truth',
    'heartbreaking situation', 'you should feel ashamed', 'betrayal of trust',
    'outrageous behavior', 'emotional blackmail', "you won't believe",
    'unbelievable truth', 'heart wrenching', 'tearful', 'horrifying',
    'devastating news', 'makes your blood boil', 'sensational',
  ],
  loaded_language: [
    'disastrous failure', 'shocking revelation', 'evil agenda', 'corrupt system',
    'traitors', 'complete disaster', 'unbelievable scandal', 'dangerous enemies',
    'pure evil', 'sinister plot', 'shameless', 'vile', 'disgraceful',
    'slams', 'blasts', 'destroys', 'meltdown', 'chaos', 'puppet', 'scandalous',
  ],
  false_dilemma: [
    'you are either with us or against us', 'no other choice', 'only two options',
    'either accept or fail', 'there is no alternative', 'choose one or lose everything',
    'if you disagree then', 'all or nothing', 'do or die', 'our only hope',
    'the only way out',
  ],
  identity_deception: [
    'verify your account', 'official bank representative', 'government officer',
    'your account has been compromised', 'confirm your identity',
    'send your verification code', 'official security department',
    'authorized representative', 'impersonating', 'fake notice',
    'security team', 'kyc verification', 'compliance officer',
  ],
  financial_manipulation: [
    'guaranteed returns', 'claim your prize', 'risk free investment',
    'double your money', 'processing fee', 'instant cash reward',
    'limited investment opportunity', 'guaranteed profit', 'free money',
    'get rich quick', '100% risk free', 'refund department', 'lottery winner',
  ],
  secrecy_isolation: [
    'keep this confidential', 'do not tell anyone', 'do not contact anyone',
    'act without telling your family', 'this is strictly confidential',
    'do not discuss this', 'keep this between us', 'avoid outside advice',
    'delete after reading', 'they are hiding this from you',
    'censored by mainstream', 'what they don’t want you to know',
  ],
};

// ─── Core extraction function ────────────────────────────────────────────────

export function extractEvidence(text: string, mode = 'news'): ExtractionResult {
  return extractEvidenceByMode(text, mode);
}

export function extractEvidenceByMode(text: string, mode: string): ExtractionResult {
  if (mode === 'email') {
    const textLower = text.toLowerCase();
    let score = 0;
    const evidence: string[] = [];

    const identityDeceptionPatterns = [
      'cbi notice', 'ed notice', 'arrest warrant',
      'do not contact family', 'confidential matter',
      'call our officer', 'cyber crime cell',
      'wire transfer', 'keep this confidential',
      'upi pin', 'net banking password', 'enter your otp',
      'aadhaar linked to illegal', 'money laundering',
    ];

    const financialManipulationPatterns = [
      'you have won', 'you won', 'lucky draw', 'claim your prize',
      'processing fee', 'advance fee', 'refundable deposit',
      'guaranteed returns', 'sebi approved', 'shark tank',
      'pm scholarship', 'government lottery',
      'income tax refund', 'claim your refund',
    ];

    const authorityExploitationPatterns = [
      'rbi circular', 'trai notice', 'it department',
      'sbi kyc', 'hdfc kyc', 'icici kyc',
      'verify your account', 'verify your identity', 'mandatory verification',
      'kyc update', 'regulatory compliance', 'legal action',
    ];

    const urgencyManipulationPatterns = [
      'within 24 hours', 'within 48 hours', 'within 2 hours',
      'in 24 hours', 'in 48 hours', 'in 2 hours',
      'expires today', 'act now', 'immediate action required',
      'unless you verify', 'verify immediately', 'immediately', 'urgent',
      'last chance', 'today only', 'before midnight',
      'offer till', 'sunday only', 'by 31 march',
    ];

    const fearInductionPatterns = [
      'unusual activity', 'account suspended',
      'account will be suspended', 'account may be suspended',
      'account will be closed', 'account will be frozen',
      'access will be restricted', 'suspended unless',
      'payment failed', 'security alert', 'unauthorized access',
      'your account has been', 'action required', 'account frozen',
    ];

    const mildInfluencePatterns = [
      'flash sale', 'sale', '50% off', 'off today', 'shop at',
      'limited time offer', 'exclusive deal',
      'special discount', 'members only',
      'you have been selected', 'congratulations',
      'work from home', 'from home', 'no experience needed', 'make rs.',
    ];

    const legitimatePatterns = [
      'unsubscribe', 'do not share otp',
      'pnr', 'tracking number', 'order confirmed',
      'have a safe journey', 'no action needed',
      'official website only',
    ];

    const matchCategory = (patterns: string[], points: number, typeName: string) => {
      const sorted = [...patterns].sort((a, b) => b.length - a.length);
      const matchedInCat: string[] = [];
      for (const pattern of sorted) {
        if (textLower.includes(pattern)) {
          const isCovered = matchedInCat.some(m => m.includes(pattern));
          if (!isCovered) {
            matchedInCat.push(pattern);
            score += points;
            evidence.push(`${typeName}: "${pattern}"`);
          }
        }
      }
    };

    matchCategory(identityDeceptionPatterns, 35, 'Identity deception signal');
    matchCategory(financialManipulationPatterns, 28, 'Financial manipulation signal');
    matchCategory(authorityExploitationPatterns, 22, 'Authority exploitation signal');
    matchCategory(urgencyManipulationPatterns, 18, 'Urgency manipulation signal');
    matchCategory(fearInductionPatterns, 14, 'Fear induction signal');
    matchCategory(mildInfluencePatterns, 8, 'Mild influence signal');

    for (const pattern of legitimatePatterns) {
      if (textLower.includes(pattern)) {
        score -= 15;
      }
    }

    // Baseline minimum score for legitimate/neutral
    const boundedScore = evidence.length === 0 ? 8 : Math.max(10, Math.min(98, score));
    const label =
      boundedScore <= 15 ? 'legitimate'
      : boundedScore <= 30 ? 'mild_influence'
      : boundedScore <= 50 ? 'fear_induction'
      : boundedScore <= 65 ? 'urgency_manipulation'
      : boundedScore <= 75 ? 'authority_exploitation'
      : boundedScore <= 85 ? 'financial_manipulation'
      : 'identity_deception';

    const risk: 'low' | 'medium' | 'high' =
      label === 'legitimate' || label === 'mild_influence' ? 'low'
      : label === 'fear_induction' ? 'medium'
      : 'high';

    return {
      manipulationScore: boundedScore,
      tacticsFound: evidence.length,
      tacticEvidence: evidence.length > 0
        ? [{
            tactic: 'Email Manipulation Indicators',
            tacticId: 'email_mode_patterns',
            phrases: evidence
              .map((entry) => {
                const match = entry.match(/"(.+)"$/);
                return match ? match[1] : entry;
              })
              .slice(0, 8),
            score: boundedScore,
            contribution: boundedScore,
            risk,
            description: `Pattern-based email risk score using ${evidence.length} matched indicators.`,
          }]
        : [],
      capsBonus: 0,
      exclamBonus: 0,
      categoryScores: { email_pattern_score: boundedScore },
      dominantTactic: evidence.length > 0 ? 'Email Manipulation Indicators' : null,
      evidenceSummary: evidence.length > 0
        ? evidence.slice(0, 4).join(', ')
        : 'No significant email manipulation patterns detected.',
      emailLabel: label,
      emailEvidence: evidence,
    };
  }

  // ── General / News Mode ─────────────────────────────────────────────────────
  const rubric    = getRubric();
  const lower     = text.toLowerCase();

  // ── ALL-CAPS bonus (each caps word = shouting effect)
  const capsWords  = text.split(/\s+/).filter(w => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w));
  const capsBonus  = Math.min(capsWords.length * 5, 20);

  // ── Exclamation mark bonus
  const exclamCount = (text.match(/!/g) ?? []).length;
  const exclamBonus = Math.min(exclamCount * 3, 15);

  const tacticEvidence: TacticEvidence[] = [];
  const categoryScores: Record<string, number> = {};

  for (const category of rubric) {
    const matchedPhrases: string[] = [];
    const searchPhrases = [
      ...category.example_phrases,
      ...(EXTENDED_TACTIC_PATTERNS[category.id] || []),
    ];

    for (const phrase of searchPhrases) {
      if (lower.includes(phrase.toLowerCase())) {
        const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const match = text.match(re);
        matchedPhrases.push(match ? match[0] : phrase);
      }
    }

    const uniquePhrases = [...new Set(matchedPhrases)];

    if (uniquePhrases.length > 0) {
      // Base category weight depending on risk level
      const baseWeight = category.risk_level === 'high' ? 26 : category.risk_level === 'medium' ? 18 : 12;
      // Multiplier for phrase reinforcement
      const multiplier = 1 + Math.min((uniquePhrases.length - 1) * 0.25, 1.25);
      const catScore = Math.min(Math.round(baseWeight * multiplier), 50);

      categoryScores[category.id] = catScore;
      tacticEvidence.push({
        tactic:       category.category,
        tacticId:     category.id,
        phrases:      uniquePhrases.slice(0, 6),
        score:        catScore,
        contribution: catScore,
        risk:         category.risk_level,
        description:  category.description,
      });
    } else {
      categoryScores[category.id] = 0;
    }
  }

  // ── Sort evidence by score descending
  tacticEvidence.sort((a, b) => b.score - a.score);

  // ── Compound manipulation scoring
  let manipulationScore = 10; // Default baseline for neutral text

  if (tacticEvidence.length > 0) {
    // Dominant tactic carries primary weight
    let aggregate = tacticEvidence[0].score;

    // Secondary and tertiary tactics compound the manipulation risk
    for (let i = 1; i < tacticEvidence.length; i++) {
      const weight = i === 1 ? 0.6 : i === 2 ? 0.4 : 0.2;
      aggregate += tacticEvidence[i].score * weight;
    }

    // Add caps and exclamation intensity
    aggregate += capsBonus * 0.5 + exclamBonus * 0.5;

    manipulationScore = Math.max(20, Math.min(Math.round(aggregate), 98));
  } else {
    // If no tactics were detected, check if text has extreme caps/exclamation shouting
    const shoutScore = Math.round(capsBonus * 0.6 + exclamBonus * 0.6);
    manipulationScore = Math.max(8, Math.min(10 + shoutScore, 40));
  }

  const dominantTactic = tacticEvidence.length > 0 ? tacticEvidence[0].tactic : null;

  // ── Build human-readable evidence summary
  const evidenceSummary = tacticEvidence.length === 0
    ? 'No significant manipulation patterns detected.'
    : tacticEvidence
        .slice(0, 3)
        .map(t => `${t.tactic} (+${t.contribution})`)
        .join(', ') + (tacticEvidence.length > 3 ? `, and ${tacticEvidence.length - 3} more` : '');

  return {
    manipulationScore,
    tacticsFound: tacticEvidence.length,
    tacticEvidence,
    capsBonus,
    exclamBonus,
    categoryScores,
    dominantTactic,
    evidenceSummary,
  };
}

/**
 * Lightweight version that only returns the score.
 */
export function quickScore(text: string, mode = 'news'): number {
  return extractEvidenceByMode(text, mode).manipulationScore;
}

/**
 * Build highlighted word annotations from evidence.
 */
export function buildHighlightedWordsFromEvidence(
  text:     string,
  evidence: TacticEvidence[],
): Array<{ word: string; manipulative: boolean; level?: 'high' | 'medium' | 'low' }> {
  const riskyMap = new Map<string, 'high' | 'medium' | 'low'>();

  for (const tactic of evidence) {
    for (const phrase of tactic.phrases) {
      for (const w of phrase.toLowerCase().split(/\s+/)) {
        const clean = w.replace(/[^a-z0-9]/g, '');
        if (clean.length > 2) {
          const existing = riskyMap.get(clean);
          const incoming = tactic.risk;
          if (!existing || incoming === 'high') {
            riskyMap.set(clean, incoming);
          }
        }
      }
    }
  }

  return text.split(/\s+/).filter(Boolean).map(token => {
    const clean = token.toLowerCase().replace(/[^a-z0-9]/g, '');

    // ALL-CAPS = high risk
    if (token.length > 2 && token === token.toUpperCase() && /[A-Z]/.test(token)) {
      return { word: token, manipulative: true, level: 'high' as const };
    }

    const lvl = riskyMap.get(clean);
    if (lvl) return { word: token, manipulative: true, level: lvl };

    return { word: token, manipulative: false };
  });
}

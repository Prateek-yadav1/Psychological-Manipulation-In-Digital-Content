import { motion } from 'framer-motion';
import {
  Activity,
  Bot,
  CheckCircle2,
  Cpu,
  Network,
  Scan,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

export type PipelineStage =
  | 'idle'
  | 'ingestion'
  | 'feature'
  | 'tier1'
  | 'tier2'
  | 'tier3'
  | 'finalizing';

type TechnicalPipelineExplorerProps = {
  busy?: boolean;
  stage?: PipelineStage;
};

const INGESTION_PULSES = Array.from({ length: 18 }, (_, i) => i);
const STAGE_SEQUENCE: PipelineStage[] = [
  'ingestion',
  'feature',
  'tier1',
  'tier2',
  'tier3',
  'finalizing',
];

const STAGE_LABELS: Record<PipelineStage, string> = {
  idle: 'Standby',
  ingestion: 'Neural Ingestion',
  feature: 'Feature Extraction',
  tier1: 'Tier 1 Binary Filter',
  tier2: 'Tier 2 Multi-Class Typing',
  tier3: 'Tier 3 LLM Validation',
  finalizing: 'Finalizing Decision',
};

const STAGE_Y_POSITION: Record<PipelineStage, string> = {
  idle: '6%',
  ingestion: '26%',
  feature: '45%',
  tier1: '66%',
  tier2: '79%',
  tier3: '91%',
  finalizing: '96%',
};

const FEATURE_PHASES = [
  { id: 'sentiment', label: 'Sentiment Analysis', icon: Scan },
  { id: 'semantic', label: 'Semantic Encoding', icon: Search },
  { id: 'tactics', label: 'Tactic Discovery', icon: Activity },
];

const TIERS = [
  {
    title: 'Tier 1',
    subtitle: 'DistilBERT Binary Filter',
    detail: 'High-speed legitimacy gate',
    icon: ShieldCheck,
  },
  {
    title: 'Tier 2',
    subtitle: 'DistilBERT 7-Class Specializer',
    detail: 'Multi-node neural typing hub',
    icon: Network,
  },
  {
    title: 'Tier 3',
    subtitle: 'Advanced LLM/BART Validator',
    detail: 'Deep-semantic fallback node',
    icon: Bot,
  },
];

function getStageIndex(stage: PipelineStage): number {
  return STAGE_SEQUENCE.indexOf(stage);
}

function getStatus(currentStage: PipelineStage, busy: boolean, targetStage: PipelineStage) {
  if (!busy) return 'STANDBY';
  const current = getStageIndex(currentStage);
  const target = getStageIndex(targetStage);
  if (current < target) return 'QUEUED';
  if (current === target) return 'ACTIVE';
  return 'COMPLETE';
}

function statusClass(status: string) {
  if (status === 'ACTIVE') return 'text-[#c6d8ff]';
  if (status === 'COMPLETE') return 'text-[#aebfdd]';
  return 'text-[#7f90ab]';
}

function panelClass(status: string) {
  if (status === 'ACTIVE') return 'border-[#4e78ff]/45 shadow-[0_0_24px_rgba(78,120,255,0.2)]';
  if (status === 'COMPLETE') return 'border-[#85a8ff]/35 shadow-[0_0_16px_rgba(133,168,255,0.15)]';
  return 'border-[#4e78ff]/25';
}

export function TechnicalPipelineExplorer({ busy = false, stage = 'idle' }: TechnicalPipelineExplorerProps) {
  const currentStage = busy ? stage : 'idle';
  const stageLabel = STAGE_LABELS[currentStage];
  const stageIndex = getStageIndex(currentStage);
  const progress = busy
    ? Math.max(8, ((Math.max(0, stageIndex) + 1) / STAGE_SEQUENCE.length) * 100)
    : 0;

  const ingestionStatus = getStatus(currentStage, busy, 'ingestion');
  const featureStatus = getStatus(currentStage, busy, 'feature');
  const tier1Status = getStatus(currentStage, busy, 'tier1');
  const tier2Status = getStatus(currentStage, busy, 'tier2');
  const tier3Status = getStatus(currentStage, busy, 'tier3');
  const tierGroupStatus = tier3Status === 'ACTIVE'
    ? 'ACTIVE'
    : tier2Status === 'ACTIVE'
      ? 'ACTIVE'
      : tier1Status === 'ACTIVE'
        ? 'ACTIVE'
        : tier3Status === 'COMPLETE'
          ? 'COMPLETE'
          : 'QUEUED';
  const scannerY = STAGE_Y_POSITION[currentStage];

  return (
    <div className="space-y-6">
      <motion.div
        layout
        className="relative overflow-hidden rounded-2xl border border-[#4e78ff]/35 bg-[linear-gradient(145deg,rgba(8,14,24,0.92),rgba(14,22,38,0.82))] p-6 shadow-[0_0_30px_rgba(78,120,255,0.14)] backdrop-blur-xl"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(78,120,255,0.24),transparent_45%),radial-gradient(circle_at_90%_90%,rgba(111,212,255,0.1),transparent_45%)]" />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 h-8 bg-gradient-to-b from-[#4e78ff]/25 via-[#4e78ff]/10 to-transparent"
          animate={{ y: ['-12%', '96%', '-12%'], opacity: [0.05, 0.45, 0.05] }}
          transition={{
            duration: busy ? 2.5 : 4.5,
            ease: 'linear',
            repeat: Number.POSITIVE_INFINITY,
          }}
        />
        <div className="pointer-events-none absolute bottom-8 right-3 top-24 z-0">
          <div className="relative h-full w-[3px] overflow-hidden rounded-full bg-[#4e78ff]/16">
            <motion.div
              className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-transparent via-[#4e78ff]/80 to-transparent shadow-[0_0_20px_rgba(78,120,255,0.55)]"
              animate={{ y: ['-10%', '105%'] }}
              transition={{
                duration: busy ? 2.2 : 4.8,
                ease: 'linear',
                repeat: Number.POSITIVE_INFINITY,
              }}
            />
          </div>
          <motion.span
            className="absolute left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-[#4e78ff] shadow-[0_0_18px_rgba(78,120,255,0.95)]"
            animate={{ top: scannerY, scale: busy ? [1, 1.24, 1] : [1, 1.1, 1] }}
            transition={{
              top: { duration: 0.36, ease: 'easeOut' },
              scale: { duration: busy ? 0.8 : 1.8, repeat: Number.POSITIVE_INFINITY },
            }}
          />
        </div>

        <div className="relative space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg text-[#dbe7ff] [text-shadow:0_0_18px_rgba(78,120,255,0.45)]">
                Technical Pipeline Explorer
              </h3>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[#8a9bb6]">
                ManipuLens AI NLP Runtime Topology
              </p>
            </div>
            <div className="rounded-full border border-[#4e78ff]/40 bg-[#4e78ff]/10 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[#c6d8ff]">
              {busy ? 'Pipeline Active' : 'Idle Monitor'}
            </div>
          </div>

          <div className="rounded-xl border border-[#4e78ff]/25 bg-[#07111d]/75 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.16em] text-[#8a9bb6]">Live NLP Stage</span>
              <span className="text-xs uppercase tracking-[0.14em] text-[#c6d8ff]">{stageLabel}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full border border-[#4e78ff]/25 bg-[#021019]">
              <motion.div
                className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-[#345bcc] via-[#4e78ff] to-[#8fb2ff] shadow-[0_0_18px_rgba(78,120,255,0.55)]"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                <motion.span
                  className="pointer-events-none absolute inset-y-0 left-[-45%] w-[42%] bg-gradient-to-r from-transparent via-[#eaf2ff]/85 to-transparent"
                  animate={{ x: ['0%', '360%'] }}
                  transition={{
                    duration: busy ? 0.9 : 2.2,
                    ease: 'linear',
                    repeat: Number.POSITIVE_INFINITY,
                  }}
                />
              </motion.div>
            </div>
          </div>

          <div className="rounded-xl border border-[#4e78ff]/25 bg-[#07111d]/75 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.16em] text-[#8a9bb6]">System Heartbeat</span>
              <span className="flex items-center gap-2 text-xs text-[#c6d8ff]">
                <motion.span
                  className="inline-block h-2 w-2 rounded-full bg-[#4e78ff]"
                  animate={{ scale: busy ? [1, 1.4, 1] : [1, 1.15, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: busy ? 0.7 : 1.8, repeat: Number.POSITIVE_INFINITY }}
                />
                {busy ? 'Analyzer Busy' : 'Analyzer Idle'}
              </span>
            </div>
            <svg viewBox="0 0 220 52" className="h-12 w-full">
              <path
                d="M2 28 H52 L64 12 L76 40 L90 18 L102 28 H218"
                fill="none"
                stroke="rgba(78,120,255,0.24)"
                strokeWidth="2"
              />
              <motion.path
                d="M2 28 H52 L64 12 L76 40 L90 18 L102 28 H218"
                fill="none"
                stroke="#4e78ff"
                strokeWidth="2.2"
                strokeLinecap="round"
                initial={{ pathLength: 0.05, opacity: 0.3 }}
                animate={{ pathLength: [0.1, 0.95, 0.1], opacity: [0.35, 0.95, 0.35] }}
                transition={{
                  duration: busy ? 1.1 : 2.4,
                  ease: 'easeInOut',
                  repeat: Number.POSITIVE_INFINITY,
                }}
              />
            </svg>
          </div>

          <div className={`rounded-xl border bg-[#07111d]/70 p-4 transition-all duration-300 ${panelClass(ingestionStatus)}`}>
            <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.16em] text-[#8a9bb6]">
              <span className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-[#4e78ff]" />
              Neural Ingestion
              </span>
              <span className={`text-[11px] tracking-[0.14em] ${statusClass(ingestionStatus)}`}>{ingestionStatus}</span>
            </div>
            <div className="relative h-16 overflow-hidden rounded-lg border border-[#4e78ff]/25 bg-[#030b15]">
              {INGESTION_PULSES.map((idx) => (
                <motion.span
                  key={idx}
                  className="absolute top-0 h-1.5 rounded-full bg-[#4e78ff]/80 shadow-[0_0_10px_rgba(78,120,255,0.75)]"
                  style={{
                    width: `${10 + (idx % 6) * 6}px`,
                    left: `${(idx * 5.4) % 96}%`,
                  }}
                  animate={{ y: ['-10%', '640%'], opacity: [0, 1, 0.1, 0] }}
                  transition={{
                    duration: busy && ingestionStatus === 'ACTIVE' ? 1.1 : 2.8,
                    delay: idx * 0.08,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: 'linear',
                  }}
                />
              ))}
            </div>
          </div>

          <div className={`rounded-xl border bg-[#07111d]/70 p-4 transition-all duration-300 ${panelClass(featureStatus)}`}>
            <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.16em] text-[#8a9bb6]">
              <span className="flex items-center gap-2">
                <Cpu className="h-3.5 w-3.5 text-[#4e78ff]" />
                Feature Extraction Gate
              </span>
              <span className={`text-[11px] tracking-[0.14em] ${statusClass(featureStatus)}`}>{featureStatus}</span>
            </div>
            <div className="grid grid-cols-1 gap-2.5">
              {FEATURE_PHASES.map((phase, index) => {
                const Icon = phase.icon;
                const active = featureStatus === 'ACTIVE';
                const done = featureStatus === 'COMPLETE';
                return (
                  <motion.div
                    key={phase.id}
                    className="relative overflow-hidden flex items-center justify-between rounded-lg border border-[#4e78ff]/20 bg-[#04101b]/70 px-3 py-2"
                    initial={{ opacity: 0.7, x: -8 }}
                    animate={{ opacity: active ? [0.6, 1, 0.6] : [0.72, 0.9, 0.72], x: 0 }}
                    transition={{
                      duration: active ? 1.1 : 2.5,
                      delay: index * 0.15,
                      repeat: Number.POSITIVE_INFINITY,
                    }}
                  >
                    <motion.span
                      className="pointer-events-none absolute inset-y-0 left-[-45%] w-[42%] bg-gradient-to-r from-transparent via-[#4e78ff]/24 to-transparent"
                      animate={active || done ? { x: ['0%', '360%'] } : { x: '-140%' }}
                      transition={{
                        duration: active ? 1.0 : 2.6,
                        delay: index * 0.2,
                        ease: 'linear',
                        repeat: Number.POSITIVE_INFINITY,
                      }}
                    />
                    <div className="flex items-center gap-2.5">
                      <motion.div
                        animate={{ rotate: active ? [0, 6, -6, 0] : 0, scale: active ? [1, 1.1, 1] : [1, 1.03, 1] }}
                        transition={{
                          duration: active ? 0.8 : 2.2,
                          repeat: Number.POSITIVE_INFINITY,
                          delay: index * 0.12,
                        }}
                        className="rounded-md border border-[#4e78ff]/40 bg-[#4e78ff]/10 p-1.5"
                      >
                        <Icon className="h-4 w-4 text-[#4e78ff]" />
                      </motion.div>
                      <span className="text-sm text-[#dbe7ff]">{phase.label}</span>
                    </div>
                    <span className={`text-[11px] uppercase tracking-[0.14em] ${statusClass(featureStatus)}`}>{featureStatus}</span>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-[#4e78ff]/10">
                      <motion.span
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#345bcc] via-[#4e78ff] to-[#9bb9ff]"
                        animate={
                          active
                            ? { width: ['24%', '82%', '36%'], x: ['0%', '14%', '0%'] }
                            : done
                              ? { width: '100%', x: '0%' }
                              : { width: '18%', x: '0%' }
                        }
                        transition={{
                          duration: active ? 1.1 : 0.4,
                          ease: 'easeInOut',
                          repeat: active ? Number.POSITIVE_INFINITY : 0,
                        }}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          <div className={`relative rounded-xl border bg-[#07111d]/72 p-4 transition-all duration-300 ${panelClass(tierGroupStatus)}`}>
            <div className="mb-3 text-xs uppercase tracking-[0.16em] text-[#8a9bb6]">3-Tier Architecture</div>
            <div className="relative space-y-3">
              {TIERS.map((tier, idx) => {
                const TierIcon = tier.icon;
                const isLast = idx === TIERS.length - 1;
                const tierStage: PipelineStage = idx === 0 ? 'tier1' : idx === 1 ? 'tier2' : 'tier3';
                const tierStatus = tierStage === 'tier1'
                  ? tier1Status
                  : tierStage === 'tier2'
                    ? tier2Status
                    : tier3Status;
                const isActive = tierStatus === 'ACTIVE';
                return (
                  <div key={tier.title} className="relative">
                    <motion.div
                      className="relative overflow-hidden rounded-xl border border-[#4e78ff]/25 bg-[#04101b]/80 px-3 py-3 shadow-[inset_0_0_20px_rgba(78,120,255,0.05)]"
                      animate={{
                        borderColor: isActive
                          ? ['rgba(78,120,255,0.25)', 'rgba(78,120,255,0.6)', 'rgba(78,120,255,0.25)']
                          : 'rgba(78,120,255,0.25)',
                        boxShadow: isActive
                          ? [
                            'inset 0 0 20px rgba(78,120,255,0.06), 0 0 0 rgba(78,120,255,0)',
                            'inset 0 0 24px rgba(78,120,255,0.14), 0 0 22px rgba(78,120,255,0.18)',
                            'inset 0 0 20px rgba(78,120,255,0.06), 0 0 0 rgba(78,120,255,0)',
                          ]
                          : 'inset 0 0 20px rgba(78,120,255,0.05)',
                      }}
                      transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY, delay: idx * 0.22 }}
                    >
                      <motion.span
                        className="pointer-events-none absolute inset-y-0 left-[-42%] w-[40%] bg-gradient-to-r from-transparent via-[#4e78ff]/26 to-transparent"
                        animate={isActive || tierStatus === 'COMPLETE' ? { x: ['0%', '360%'] } : { x: '-140%' }}
                        transition={{
                          duration: isActive ? 1.0 : 2.9,
                          delay: idx * 0.2,
                          ease: 'linear',
                          repeat: Number.POSITIVE_INFINITY,
                        }}
                      />
                      <div className="flex items-start gap-3">
                        <motion.div
                          className="rounded-lg border border-[#4e78ff]/45 bg-[#4e78ff]/10 p-2"
                          animate={{ scale: isActive ? [1, 1.08, 1] : [1, 1.03, 1] }}
                          transition={{ duration: isActive ? 0.9 : 2.1, repeat: Number.POSITIVE_INFINITY, delay: idx * 0.16 }}
                        >
                          {tierStatus === 'COMPLETE' ? (
                            <CheckCircle2 className="h-4.5 w-4.5 text-[#8afdf0]" />
                          ) : (
                            <TierIcon className="h-4.5 w-4.5 text-[#4e78ff]" />
                          )}
                        </motion.div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs uppercase tracking-[0.16em] text-[#7f90ab]">{tier.title}</p>
                            <span className={`text-[10px] uppercase tracking-[0.14em] ${statusClass(tierStatus)}`}>
                              {tierStatus}
                            </span>
                          </div>
                          <p className="text-sm text-[#dbe7ff]">{tier.subtitle}</p>
                          <p className="mt-1 text-xs text-[#8a9bb6]">{tier.detail}</p>
                        </div>
                      </div>
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-[#4e78ff]/10">
                        <motion.span
                          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#345bcc] via-[#4e78ff] to-[#9bb9ff]"
                          animate={
                            isActive
                              ? { width: ['26%', '84%', '34%'], x: ['0%', '14%', '0%'] }
                              : tierStatus === 'COMPLETE'
                                ? { width: '100%', x: '0%' }
                                : { width: '18%', x: '0%' }
                          }
                          transition={{
                            duration: isActive ? 1.0 : 0.4,
                            ease: 'easeInOut',
                            repeat: isActive ? Number.POSITIVE_INFINITY : 0,
                          }}
                        />
                      </div>
                    </motion.div>

                    {!isLast && (
                      <div className="relative mx-auto mt-1.5 h-6 w-px bg-[#4e78ff]/28">
                        <motion.span
                          className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-[#4e78ff] shadow-[0_0_12px_rgba(78,120,255,0.85)]"
                          animate={{ y: [0, 20, 0], opacity: [0.2, 1, 0.2] }}
                          transition={{
                            duration: isActive ? 0.9 : 1.8,
                            repeat: Number.POSITIVE_INFINITY,
                            delay: idx * 0.2,
                            ease: 'easeInOut',
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

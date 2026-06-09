import { useEffect, useMemo, useState } from 'react';
import { Activity, Cpu, ShieldCheck, Sparkles } from 'lucide-react';

interface LoadingScreenProps {
  isVisible: boolean;
  message?: string;
}

type Geometry = {
  label: string;
  className: string;
  delay: number;
};

type Signal = {
  label: string;
  value: string;
};

export function LoadingScreen({ isVisible, message = 'Initializing cognitive runtime...' }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);

  const geometry = useMemo<Geometry[]>(
    () => [
      { label: 'Vector gate', className: 'left-[8%] top-[17%] h-16 w-16 rotate-12', delay: 0 },
      { label: 'Quantum node', className: 'right-[9%] top-[18%] h-11 w-11 -rotate-12', delay: 0.4 },
      { label: 'Trust lattice', className: 'bottom-[18%] left-[13%] h-12 w-12 rotate-45', delay: 0.8 },
      { label: 'Signal prism', className: 'bottom-[16%] right-[15%] h-20 w-20 -rotate-6', delay: 1.15 },
    ],
    [],
  );

  const signals = useMemo<Signal[]>(
    () => [
      { label: 'Integrity engine', value: 'Online' },
      { label: 'Evidence graph', value: 'Syncing' },
      { label: 'Risk models', value: 'Primed' },
    ],
    [],
  );

  useEffect(() => {
    if (!isVisible) return;

    const progressTimer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 99) return current;
        const easing = current < 52 ? 2.4 : current < 82 ? 1.35 : 0.45;
        return Math.min(99, Number((current + easing).toFixed(1)));
      });
    }, 72);

    return () => window.clearInterval(progressTimer);
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) {
      setProgress(0);
      return;
    }

    setProgress(8);
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[70] flex min-h-screen items-center justify-center overflow-hidden bg-[#020612] px-5 py-6 text-[#eaf4ff]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(67,126,255,0.05)_1px,transparent_1px),linear-gradient(0deg,rgba(83,214,255,0.05)_1px,transparent_1px)] bg-[size:72px_72px] opacity-70 [mask-image:radial-gradient(ellipse_at_center,black_12%,transparent_78%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#86f1ff]/80 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#497cff]/70 to-transparent" />
        <span className="absolute left-0 top-[24%] h-px w-[42vw] bg-gradient-to-r from-transparent via-[#6ee7ff]/70 to-transparent opacity-70 animate-[loaderBeam_4.8s_ease-in-out_infinite]" />
        <span className="absolute right-0 top-[67%] h-px w-[38vw] bg-gradient-to-r from-transparent via-[#6d91ff]/70 to-transparent opacity-60 animate-[loaderBeam_5.6s_ease-in-out_0.5s_infinite]" />
        <span className="absolute left-[50%] top-0 h-full w-px bg-gradient-to-b from-transparent via-[#5dcfff]/20 to-transparent" />
      </div>

      {geometry.map((item) => (
        <div
          key={item.label}
          aria-hidden="true"
          className={`pointer-events-none absolute hidden border border-[#7cecff]/25 bg-[#6ee7ff]/[0.035] shadow-[0_0_34px_rgba(87,214,255,0.16)] backdrop-blur-md md:block ${item.className}`}
          style={{ animation: `loaderFloat 7s ease-in-out ${item.delay}s infinite` }}
        >
          <span className="absolute inset-2 border border-[#5f85ff]/25" />
        </div>
      ))}

      <div className="relative grid w-full max-w-6xl items-center gap-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <section className="relative min-h-[430px] overflow-hidden rounded-[28px] border border-[#7cecff]/20 bg-[#07101f]/70 p-6 shadow-[0_36px_120px_rgba(0,6,24,0.88),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl sm:p-8">
          <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(104,232,255,0.12),transparent_38%,rgba(70,116,255,0.12)_76%,transparent)]" />
          <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#b9f8ff] to-transparent opacity-70" />

          <div className="relative flex h-full min-h-[380px] flex-col justify-between">
            <div className="flex items-start justify-between gap-5">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#75e7ff]/25 bg-[#75e7ff]/10 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.22em] text-[#b7f5ff] shadow-[0_0_28px_rgba(91,223,255,0.18)]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Enterprise Intelligence
                </div>
                <h2 className="max-w-xl text-4xl font-semibold leading-tight tracking-normal text-white sm:text-5xl">
                  ManipuLens AI
                </h2>
                <p className="mt-4 max-w-lg text-sm leading-6 text-[#a9bbd5] sm:text-base">
                  Calibrating secure analysis layers, evidence retrieval, and real-time credibility scoring.
                </p>
              </div>

              <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#6ee7ff]/30 bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_28px_rgba(91,223,255,0.18)] sm:flex">
                <ShieldCheck className="h-7 w-7 text-[#8ff3ff]" />
              </div>
            </div>

            <div className="relative mx-auto my-8 flex aspect-square w-full max-w-[330px] items-center justify-center">
              <div className="absolute inset-0 rounded-full border border-[#6ee7ff]/20 shadow-[0_0_60px_rgba(65,205,255,0.18)] animate-[loaderRotate_18s_linear_infinite]" />
              <div className="absolute inset-7 rounded-full border border-dashed border-[#638bff]/35 animate-[loaderRotate_14s_linear_reverse_infinite]" />
              <div className="absolute inset-16 rounded-full border border-[#b8f7ff]/20 bg-[#07182c]/50 backdrop-blur-xl" />
              <span className="absolute h-[54%] w-px bg-gradient-to-b from-transparent via-[#6ee7ff] to-transparent opacity-60 animate-[loaderScan_2.8s_ease-in-out_infinite]" />
              <span className="absolute h-px w-[68%] bg-gradient-to-r from-transparent via-[#718fff] to-transparent opacity-70 animate-[loaderScanWide_3.2s_ease-in-out_infinite]" />
              <div className="relative flex h-28 w-28 items-center justify-center rounded-[26px] border border-[#9df6ff]/35 bg-[#09172a]/80 shadow-[0_0_48px_rgba(82,222,255,0.25),inset_0_1px_0_rgba(255,255,255,0.16)]">
                <Cpu className="h-12 w-12 text-[#a9f7ff]" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {signals.map((signal, index) => (
                <div
                  key={signal.label}
                  className="rounded-2xl border border-[#83eaff]/15 bg-white/[0.035] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  style={{ animation: `loaderFade 1s ease ${index * 0.18}s both` }}
                >
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#7890af]">{signal.label}</p>
                  <p className="mt-1 text-sm font-semibold text-[#dffaff]">{signal.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="relative overflow-hidden rounded-[28px] border border-[#7198ff]/20 bg-[#09101f]/78 p-6 shadow-[0_26px_90px_rgba(0,6,24,0.72),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl sm:p-7">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(94,143,255,0.13),transparent_46%,rgba(91,229,255,0.08))]" />
          <div className="relative">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-[#7f94b4]">System Boot</p>
                <h3 className="mt-2 text-xl font-semibold tracking-normal text-white">Neural Runtime</h3>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#75e7ff]/25 bg-[#75e7ff]/10">
                <Activity className="h-5 w-5 text-[#8ff3ff]" />
              </div>
            </div>

            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm text-[#aebdd4]">{message}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[#6f83a5]">Secure session handshake</p>
              </div>
              <span className="text-4xl font-semibold tracking-normal text-white">{Math.round(progress)}%</span>
            </div>

            <div className="relative h-3 overflow-hidden rounded-full border border-[#76e9ff]/25 bg-[#06101f] shadow-[inset_0_0_18px_rgba(0,0,0,0.45)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#2f73ff] via-[#52dcff] to-[#c8fbff] shadow-[0_0_28px_rgba(82,220,255,0.7)]"
                style={{ width: `${progress}%`, transition: 'width 160ms ease-out' }}
              />
              <span className="absolute inset-y-0 left-[-32%] w-[30%] bg-gradient-to-r from-transparent via-white/90 to-transparent animate-[loaderSweep_1.45s_linear_infinite]" />
            </div>

            <div className="mt-8 space-y-4">
              {['Identity seal verified', 'AI analysis fabric warming', 'Dashboard surface prepared'].map((item, index) => (
                <div key={item} className="flex items-center gap-3 text-sm text-[#c4d3ec]">
                  <span
                    className="h-2.5 w-2.5 rounded-full border border-[#9cf6ff] bg-[#6ee7ff] shadow-[0_0_18px_rgba(110,231,255,0.85)]"
                    style={{ animation: `loaderBlink 1.4s ease-in-out ${index * 0.24}s infinite` }}
                  />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="mt-9 rounded-2xl border border-[#7cecff]/15 bg-[#020a16]/55 p-4">
              <div className="mb-3 flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-[#7790b1]">
                <span>Latency</span>
                <span className="text-[#b9f8ff]">12 ms</span>
              </div>
              <div className="grid grid-cols-12 gap-1.5">
                {Array.from({ length: 36 }).map((_, index) => (
                  <span
                    key={index}
                    className="h-8 rounded-sm bg-gradient-to-t from-[#244a91] via-[#3ecfff] to-[#d5fdff] opacity-70"
                    style={{
                      transform: `scaleY(${0.28 + ((index * 7) % 10) / 13})`,
                      transformOrigin: 'bottom',
                      animation: `loaderBars 1.7s ease-in-out ${(index % 8) * 0.08}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <style>{`
        @keyframes loaderBeam {
          0%, 100% { transform: translateX(-18%); opacity: 0.2; }
          50% { transform: translateX(18%); opacity: 0.85; }
        }
        @keyframes loaderFloat {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(var(--tw-rotate)); opacity: 0.45; }
          50% { transform: translate3d(0, -18px, 0) rotate(var(--tw-rotate)); opacity: 0.95; }
        }
        @keyframes loaderRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes loaderScan {
          0%, 100% { transform: rotate(0deg) scaleY(0.8); opacity: 0.35; }
          50% { transform: rotate(180deg) scaleY(1); opacity: 0.9; }
        }
        @keyframes loaderScanWide {
          0%, 100% { transform: rotate(24deg) scaleX(0.8); opacity: 0.35; }
          50% { transform: rotate(204deg) scaleX(1); opacity: 0.8; }
        }
        @keyframes loaderFade {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes loaderSweep {
          0% { transform: translateX(0); }
          100% { transform: translateX(450%); }
        }
        @keyframes loaderBlink {
          0%, 100% { opacity: 0.45; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.12); }
        }
        @keyframes loaderBars {
          0%, 100% { filter: brightness(0.75); opacity: 0.45; }
          50% { filter: brightness(1.25); opacity: 0.95; }
        }
      `}</style>
    </div>
  );
}

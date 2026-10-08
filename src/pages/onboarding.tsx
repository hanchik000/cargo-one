import { useState } from 'react';
import { useI18n } from '@/i18n';
import { navigate } from '@/lib/router';
import { usePersisted } from '@/lib/hooks';
import { asset } from '@/lib/assets';
import { Button, cn } from '@/components/ui';
import { LanguageSwitcher, Logo, usePageTitle } from '@/components/shell';
import { LogoMark } from '@/components/brand';
import { CargoLine } from '@/components/commerce';
import { IconArrow } from '@/components/icons';

const TILES = [['p1', 'p11', 'p7'], ['p18', 'p21', 'p27'], ['p4', 'p14', 'p30']];

export function OnboardingPage() {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [, setDone] = usePersisted('onboarded', false);
  usePageTitle(t('onb.title'));
  const finish = () => { setDone(true); navigate('/', { replace: true }); };
  const slides = [
    { lines: [t('onb.1.a'), t('onb.1.b')], body: t('onb.1.body') },
    { lines: [t('onb.2.find'), t('onb.2.buy'), t('onb.2.pay'), t('onb.2.cargo')], body: t('onb.2.body') },
    { lines: [t('onb.3.a'), t('onb.3.b')], body: t('onb.3.body') },
  ];
  const s = slides[step];
  return (
    <div className="on-dark relative flex min-h-dvh flex-col overflow-hidden bg-ink text-on-ink">
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full bg-accent/20 blur-[120px]" aria-hidden />
      <header className="relative z-10 flex items-center justify-between px-5 pt-6 md:px-12">
        <Logo dark animated />
        <div className="flex items-center gap-3">
          <LanguageSwitcher dark compact />
          <button type="button" onClick={finish} className="rounded-full px-3 py-1.5 text-sm text-white/60 transition hover:bg-white/10 hover:text-white">{t('onb.skip')}</button>
        </div>
      </header>
      <main className="relative z-10 grid flex-1 items-center gap-10 px-5 py-8 md:grid-cols-[1.1fr_1fr] md:px-12">
        <div key={step} className="animate-rise min-w-0 max-w-3xl">
          <div className="mono mb-6 flex items-center gap-3 text-xs tracking-[0.18em] text-accent-2"><span>0{step + 1}</span><span className="h-px w-10 bg-white/20" /><span className="text-white/40">03</span></div>
          <h1 className="display text-[clamp(30px,9.5vw,48px)] leading-[0.98] [overflow-wrap:anywhere] [hyphens:auto] lg:text-[84px]">
            {s.lines.map((l, i) => <span key={i} className={cn('block', step === 1 && i > 0 && i < 3 && 'text-white/40', step === 1 && i === 3 && 'text-accent-grad')} style={{ animationDelay: `${i * 70}ms` }}>{l}</span>)}
          </h1>
          <p className="mt-6 max-w-md text-[16px] leading-relaxed text-white/60 md:text-[17px]">{s.body}</p>
          {step === 2 ? (
            <div className="mt-8 max-w-md"><CargoLine dark nodes={[{ label: 'CN' }, { label: '' }, { label: '' }, { label: 'TM' }]} progress={3} /></div>
          ) : null}
        </div>
        <div key={`v${step}`} className="relative hidden h-[460px] md:block" aria-hidden>
          {step === 1 ? (
            <div className="absolute inset-0 grid place-items-center"><div className="animate-pop grid size-56 place-items-center rounded-[48px] bg-white/5 ring-1 ring-white/10 backdrop-blur"><LogoMark size={120} onDark animated /></div></div>
          ) : null}
          {TILES[step].map((id, i) => (
            <div key={id} className={cn('absolute overflow-hidden rounded-[28px] bg-paper shadow-[0_30px_80px_-20px_rgba(0,0,0,.6)] animate-pop', step === 1 ? 'size-36 opacity-70' : 'size-56',
              i === 0 && (step === 1 ? 'left-0 top-4' : 'left-4 top-0'), i === 1 && (step === 1 ? 'right-2 top-24' : 'right-0 top-28'), i === 2 && (step === 1 ? 'bottom-0 left-24' : 'bottom-0 left-24'))}
              style={{ animationDelay: `${120 + i * 110}ms`, transform: `rotate(${[-6, 5, -2][i]}deg)` }}>
              <img src={asset(`img/products/${id}-0.webp`)} alt="" className="img-in size-full object-cover" />
            </div>
          ))}
        </div>
        <div key={`m${step}`} className="flex gap-3 md:hidden" aria-hidden>
          {TILES[step].map((id, i) => (
            <div key={id} className="animate-pop aspect-square min-w-0 flex-1 overflow-hidden rounded-[20px] bg-paper" style={{ animationDelay: `${100 + i * 90}ms` }}>
              <img src={asset(`img/products/${id}-0.webp`)} alt="" className="size-full object-cover" />
            </div>
          ))}
        </div>
      </main>
      <footer className="safe-bottom relative z-10 flex items-center justify-between gap-4 px-5 pb-8 md:px-12">
        <div className="flex gap-2" role="tablist" aria-label={t('onb.progress')}>
          {slides.map((_, i) => <button key={i} type="button" role="tab" aria-selected={i === step} aria-label={`${i + 1}`} onClick={() => setStep(i)} className={cn('h-1.5 rounded-full transition-all duration-500', i === step ? 'w-10 bg-accent-2' : 'w-4 bg-white/25 hover:bg-white/40')} />)}
        </div>
        {step < 2
          ? <Button variant="inverse" size="lg" iconRight={IconArrow} onClick={() => setStep(step + 1)}>{t('onb.continue')}</Button>
          : <Button variant="accent" size="lg" iconRight={IconArrow} onClick={finish}>{t('onb.get_started')}</Button>}
      </footer>
    </div>
  );
}

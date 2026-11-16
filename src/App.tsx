import { useEffect, useState } from "react";
import { Button } from "./design/atoms/Button/Button";
import { Icon } from "./design/atoms/Icon/Icon";
import { SegmentedControl } from "./design/atoms/SegmentedControl/SegmentedControl";
import { loadDsp, type Dsp } from "./dsp.ts";
import { Listen } from "./Listen.tsx";
import { Words } from "./Words.tsx";
import s from "./App.module.css";

export const REPO = "https://github.com/vcashwin/micless";
type Tab = "listen" | "words";

export function App() {
  const [tab, setTab] = useState<Tab>(location.hash === "#words" ? "words" : "listen");
  const [dsp, setDsp] = useState<Dsp | null>(null);
  useEffect(() => { loadDsp().then(setDsp); }, []);
  const show = (t: Tab) => { setTab(t); history.replaceState(null, "", t === "words" ? "#words" : location.pathname); scrollTo({ top: 0 }); };

  const share = `https://x.com/intent/post?text=${encodeURIComponent("My phone can feel sound without a microphone. Try it:")}&url=${encodeURIComponent(location.origin)}`;
  return (
    <div className={s.page}>
      <header className={s.header}>
        <span className={s.brand}><Mark />Micless</span>
        <Button variant="borderless" size="medium" onlyIcon aria-label="Source on GitHub" href={REPO} icon={<Icon name="GitHub" />} />
      </header>

      <div className={s.hero}>
        <span className={s.chip}><Icon name="NoAudio" size={14} color="labelMuted" />No microphone</span>
        <h1>Hear with your phone's motion sensor</h1>
        <p className={s.muted}>Your phone has an accelerometer that feels vibration. Micless shows what it picks up, live, without touching the microphone.</p>
      </div>

      <SegmentedControl fullWidth aria-label="View" value={tab} onValueChange={v => show(v as Tab)}
        options={[{ value: "listen", text: "Listen" }, { value: "words", text: "Can it hear words?" }]} />

      {tab === "listen" ? <Listen dsp={dsp} onShowWords={() => show("words")} /> : <Words dsp={dsp} />}

      <footer className={s.footer}>
        <p><Icon name="Lock" size={14} color="labelMuted" />Nothing leaves this page. No microphone, no server: the signal processing runs in WebAssembly on your phone.</p>
        <div className={s.footerActions}>
          <Button variant="secondary" size="medium" href={share} icon={<Icon name="ResourceX" />}>Share on X</Button>
          <Button variant="borderless" size="medium" href={REPO} icon={<Icon name="GitHub" />}>Open source</Button>
        </div>
      </footer>
    </div>
  );
}

/** Three bars, the waveform in miniature */
function Mark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden className={s.mark}>
      <rect x="3" y="7" width="3" height="6" rx="1.5" /><rect x="8.5" y="3" width="3" height="14" rx="1.5" /><rect x="14" y="5.5" width="3" height="9" rx="1.5" />
    </svg>
  );
}

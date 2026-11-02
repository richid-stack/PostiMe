import React, { useEffect, useMemo, useState } from 'react';
import { StudioAgentApprovalMode, StudioAgentControlMode, Theme, Workspace } from '../types';
import { AppLogoIcon, ArrowRightIcon, ArrowLeftIcon, ArrowUpRightIcon, BoltIcon, CheckCircleIcon, CheckIcon, CircleIcon, ClapperboardIcon, ExportIcon, FolderIcon, ImageIcon, LockIcon, MessageIcon, MoonIcon, MusicNoteIcon, ScissorsIcon, SunIcon, VideoIcon } from './icons';
import { AccentSwatches } from './ui/AccentSwatches';
import type { AccentId } from '../theme/accent';
import { UIMode } from '../config/uiModes';

type StartupPreferences = {
  startupWorkspace: Workspace;
  autoOpenAssistant: boolean;
  studioAgentMode: StudioAgentControlMode;
  studioAgentApprovalMode: StudioAgentApprovalMode;
};

interface OnboardingModalProps {
  isOpen: boolean;
  theme: Theme;
  onSelectTheme: (theme: Theme) => void;
  accent: AccentId;
  onSelectAccent: (accent: AccentId) => void;
  startupPreferences: StartupPreferences;
  onUpdateStartupPreferences: (next: StartupPreferences) => void;
  hasAnyApiKey: boolean;
  onApiKeysChanged?: () => void;
  onOpenApiSettings: () => void;
  onOpenAssistant: () => void;
  onNavigateWorkspace: (workspace: Workspace) => void;
  onComplete: (markCompleted: boolean) => void;
  uiMode?: UIMode;
  onSelectUIMode?: (mode: UIMode) => void;
}

type QuickKey = { id: string; storageKey: string; label: string; placeholder: string; usedFor: string; href: string; primary?: boolean };

/** The four keys that unlock most of the app; the full list lives in Settings → Providers. */
const QUICK_KEYS: QuickKey[] = [
  { id: 'google', storageKey: 'gemini_api_key', label: 'Google Gemini', placeholder: 'AIzaSy…', usedFor: 'Script, assistant, Imagen, Nano Banana, Veo. Free tier available.', href: 'https://aistudio.google.com/app/apikey', primary: true },
  { id: 'fal', storageKey: 'fal_api_key', label: 'fal.ai', placeholder: 'fal_…', usedFor: 'Most video models: Kling, Seedance, Wan, LTX, MiniMax.', href: 'https://fal.ai/dashboard/api-keys' },
  { id: 'replicate', storageKey: 'replicate_api_key', label: 'Replicate', placeholder: 'r8_…', usedFor: 'Flux, upscaling, Lyria music, stems.', href: 'https://replicate.com/account/api-tokens' },
  { id: 'elevenlabs', storageKey: 'elevenlabs_api_key', label: 'ElevenLabs', placeholder: 'sk-…', usedFor: 'Voiceovers.', href: 'https://elevenlabs.io/app/settings/api-keys' },
];

const readQuickKeys = (): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const key of QUICK_KEYS) {
    try { out[key.id] = localStorage.getItem(key.storageKey) || ''; } catch { out[key.id] = ''; }
  }
  return out;
};

type GlyphComponent = React.FC<{ className?: string }>;

const THEME_OPTIONS: Array<{ id: Theme; label: string; icon: GlyphComponent }> = [
  { id: 'dark', label: 'Dark', icon: MoonIcon },
  { id: 'light', label: 'Light', icon: SunIcon },
];

const MODE_CARDS: Array<{
  id: UIMode;
  icon: GlyphComponent;
  title: string;
  subtitle: string;
  bullets: string[];
}> = [
  {
    id: 'beginner',
    icon: ClapperboardIcon,
    title: 'Just getting started',
    subtitle: 'Simple and guided',
    bullets: [
      'Create images and videos',
      'A simple timeline editor',
      'The assistant guides you',
    ],
  },
  {
    id: 'pro',
    icon: BoltIcon,
    title: "I'm a filmmaker or editor",
    subtitle: 'The full studio',
    bullets: [
      'Every generation tool',
      'Node workflows',
      'The full production pipeline',
    ],
  },
];

const BEGINNER_TOOLS: Array<{ icon: GlyphComponent; label: string; description: string }> = [
  { icon: ImageIcon, label: 'Create images', description: 'Turn a description into a cinematic image.' },
  { icon: VideoIcon, label: 'Create videos', description: 'Animate your images into short clips.' },
  { icon: ScissorsIcon, label: 'Edit the timeline', description: 'Arrange your clips and add music.' },
  { icon: MusicNoteIcon, label: 'Add sound', description: 'Generate or upload background audio.' },
  { icon: ExportIcon, label: 'Export', description: 'Download your finished video.' },
];

const PRO_TOOLS: Array<{ icon: GlyphComponent; label: string; description: string }> = [
  { icon: ImageIcon, label: 'Image', description: 'Concept art and storyboard shots' },
  { icon: VideoIcon, label: 'Video', description: 'Animate images into full clips' },
  { icon: FolderIcon, label: 'Project hub', description: 'Scripts, storyboards and concepts' },
  { icon: ScissorsIcon, label: 'Timeline', description: 'Arrange clips and add music' },
  { icon: MessageIcon, label: 'Assistant', description: 'Ask for help or run a full workflow' },
];

const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  theme,
  onSelectTheme,
  accent,
  onSelectAccent,
  startupPreferences,
  onUpdateStartupPreferences,
  hasAnyApiKey,
  onApiKeysChanged,
  onOpenApiSettings,
  onOpenAssistant,
  onNavigateWorkspace,
  onComplete,
  uiMode = 'beginner',
  onSelectUIMode,
}) => {
  const [step, setStep] = useState(0);
  const [quickKeys, setQuickKeys] = useState<Record<string, string>>(() => readQuickKeys());
  const [quickKeysSaved, setQuickKeysSaved] = useState<Record<string, boolean>>(() => {
    const initial = readQuickKeys();
    return Object.fromEntries(QUICK_KEYS.map((key) => [key.id, Boolean(initial[key.id])]));
  });
  const saveTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const updateQuickKey = (key: QuickKey, value: string) => {
    setQuickKeys((prev) => ({ ...prev, [key.id]: value }));
    setQuickKeysSaved((prev) => ({ ...prev, [key.id]: false }));
    clearTimeout(saveTimers.current[key.id]);
    saveTimers.current[key.id] = setTimeout(() => {
      const trimmed = value.trim();
      try {
        if (trimmed) localStorage.setItem(key.storageKey, trimmed);
        else localStorage.removeItem(key.storageKey);
      } catch { /* storage unavailable */ }
      setQuickKeysSaved((prev) => ({ ...prev, [key.id]: Boolean(trimmed) }));
      onApiKeysChanged?.();
    }, 500);
  };
  useEffect(() => () => { Object.values(saveTimers.current).forEach((timer) => clearTimeout(timer)); }, []);
  const quickKeyCount = QUICK_KEYS.filter((key) => quickKeys[key.id]?.trim()).length;
  const connected = hasAnyApiKey || quickKeyCount > 0;
  const [markCompleted, setMarkCompleted] = useState(true);
  const [selectedMode, setSelectedMode] = useState<UIMode>(uiMode);
  const totalSteps = 4;

  const canBack = step > 0;
  const isLast = step === totalSteps - 1;

  const stepTitle = useMemo(() => {
    switch (step) {
      case 0: return 'How you work';
      case 1: return 'Look and feel';
      case 2: return 'Connect providers';
      case 3: return 'Ready';
      default: return 'Welcome';
    }
  }, [step]);

  const next = () => setStep((prev) => Math.min(totalSteps - 1, prev + 1));
  const back = () => setStep((prev) => Math.max(0, prev - 1));

  const handleSelectMode = (mode: UIMode) => {
    setSelectedMode(mode);
    onSelectUIMode?.(mode);
  };

  useEffect(() => {
    if (isOpen) {
      setStep(0);
      setSelectedMode(uiMode);
      const stored = readQuickKeys();
      setQuickKeys(stored);
      setQuickKeysSaved(Object.fromEntries(QUICK_KEYS.map((key) => [key.id, Boolean(stored[key.id])])));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="app-modal onboarding w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-4 p-6 pb-0">
          <AppLogoIcon className="w-11 h-11 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 id="onboarding-title" className="text-xl">Welcome to PostiMe</h2>
            <p className="text-xs app-muted mt-0.5">
              Step {step + 1} of {totalSteps} · {stepTitle}
            </p>
          </div>
          <button type="button" className="app-button app-secondary text-xs flex-shrink-0" onClick={() => onComplete(markCompleted)}>
            Skip
          </button>
        </div>

        <div className="onboarding__progress" role="progressbar" aria-valuemin={1} aria-valuemax={totalSteps} aria-valuenow={step + 1}>
          {Array.from({ length: totalSteps }, (_, index) => (
            <span key={index} className={index <= step ? 'is-on' : undefined} />
          ))}
        </div>

        <div className="p-6 pt-5">
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-300">How do you want to use PostiMe? You can change this any time from the header.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {MODE_CARDS.map((card) => {
                  const selected = selectedMode === card.id;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => handleSelectMode(card.id)}
                      className={`onboarding__choice ${selected ? 'pm-grain onboarding__choice--on' : ''}`}
                    >
                      <card.icon className="w-7 h-7" />
                      <div>
                        <div className="onboarding__choice-title">{card.title}</div>
                        <div className="onboarding__choice-sub">{card.subtitle}</div>
                        <ul className="mt-3 space-y-1.5">
                          {card.bullets.map((bullet) => (
                            <li key={bullet} className="text-xs flex items-center gap-2">
                              <CheckIcon className="w-3.5 h-3.5 flex-shrink-0" /> {bullet}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-300">Theme</h3>
                <div className="theme-cards" role="radiogroup" aria-label="Theme">
                  {THEME_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={theme === option.id}
                      className={`theme-card theme-card--${option.id} ${theme === option.id ? 'theme-card--on' : ''}`}
                      onClick={() => onSelectTheme(option.id)}
                    >
                      <span className="theme-card__preview" aria-hidden="true"><i /><i /><i /></span>
                      <span className="theme-card__label inline-flex items-center gap-1.5"><option.icon className="w-4 h-4" />{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-300">Accent</h3>
                <AccentSwatches value={accent} onChange={onSelectAccent} labels />
                <p className="text-xs app-muted">Clay is the PostiMe signature. You can change the accent later in Settings.</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-300">
                PostiMe generates with the providers you connect. One key is enough to start.
              </p>

              <div className="onboard-keys">
                {QUICK_KEYS.map((key) => {
                  const value = quickKeys[key.id] || '';
                  const has = value.trim().length > 0;
                  return (
                    <div key={key.id} className={`settings-provider ${has ? 'settings-provider--on' : ''}`}>
                      <div className="settings-provider__head">
                        <div className="settings-provider__name">
                          <span className={`settings-provider__dot ${has ? 'settings-provider__dot--on' : ''}`} aria-hidden="true" />
                          <strong>{key.label}</strong>
                          {key.primary && !has && <span className="pk-chip pk-chip--accent">start here · free</span>}
                          {has && quickKeysSaved[key.id] && <span className="pk-chip pk-chip--ok"><CheckCircleIcon className="w-3 h-3" />saved</span>}
                        </div>
                        <a className="settings-provider__link inline-flex items-center gap-1" href={key.href} target="_blank" rel="noreferrer">Get a key <ArrowUpRightIcon className="w-3 h-3" /></a>
                      </div>
                      <label className="settings-provider__field">
                        <LockIcon className="w-3.5 h-3.5" />
                        <input
                          type="password"
                          value={value}
                          onChange={(event) => updateQuickKey(key, event.target.value)}
                          placeholder={key.placeholder}
                          aria-label={`${key.label} API key`}
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </label>
                      <p className="pk-hint">{key.usedFor}</p>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className={`text-xs font-medium inline-flex items-center gap-1.5 ${connected ? 'text-accent-400' : 'app-muted'}`}>
                  {connected ? <CheckIcon className="w-3.5 h-3.5" /> : <CircleIcon className="w-3.5 h-3.5" />}
                  {connected
                    ? `${quickKeyCount > 0 ? `${quickKeyCount} of ${QUICK_KEYS.length} connected` : 'Connected'}. Keys stay on this computer.`
                    : 'No key yet. Paste one to unlock generation. Keys stay on this computer.'}
                </span>
                <button type="button" className="text-xs app-muted hover:text-white underline underline-offset-2 inline-flex items-center gap-1" onClick={onOpenApiSettings}>
                  All providers <ArrowRightIcon className="w-3 h-3" />
                </button>
              </div>

              {selectedMode === 'pro' && (
                <div className="app-card p-3">
                  <p className="text-xs app-muted">
                    <strong className="text-gray-300">Pro tip:</strong> Higgsfield, Midjourney (your own account) and local Claude Code / Codex agents connect in Settings → Providers and Agents.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="text-center py-2">
                <span className="pm-grain onboarding__done" aria-hidden="true"><CheckIcon className="w-7 h-7" /></span>
                <h3 className="text-xl mt-4">You're ready</h3>
                <p className="text-sm app-muted mt-1">
                  {selectedMode === 'beginner' ? "Here's what you can do in simple mode." : "Here's a quick map of the studio."}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {(selectedMode === 'beginner' ? BEGINNER_TOOLS : PRO_TOOLS).map((tool) => (
                  <div key={tool.label} className="app-card p-3 flex items-center gap-3">
                    <tool.icon className="w-5 h-5 flex-shrink-0 text-gray-300" />
                    <div>
                      <div className="text-sm font-medium text-white">{tool.label}</div>
                      <div className="text-xs app-muted">{tool.description}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <button type="button" className="app-button app-primary text-xs" onClick={onOpenAssistant}>
                  Open assistant
                </button>
                <button type="button" className="app-button app-secondary text-xs" onClick={onOpenApiSettings}>
                  Open settings
                </button>
              </div>

              <label className="text-xs text-gray-400 flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={markCompleted} onChange={(event) => setMarkCompleted(event.target.checked)} className="rounded" />
                Don&apos;t show this again
              </label>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between">
            <button type="button" className="app-button app-secondary text-xs inline-flex items-center gap-1.5" onClick={back} disabled={!canBack}>
              <ArrowLeftIcon className="w-3.5 h-3.5" /> Back
            </button>
            {isLast ? (
              <button type="button" className="app-button app-primary text-xs inline-flex items-center gap-1.5" onClick={() => onComplete(markCompleted)}>
                Start creating <ArrowRightIcon className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button type="button" className="app-button app-primary text-xs inline-flex items-center gap-1.5" onClick={next}>
                Next <ArrowRightIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingModal;

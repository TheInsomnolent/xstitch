import { useEffect, useState } from 'react';
import { Download, Share, Plus, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'xstitch:installPromptDismissedAt';
const DISMISS_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const FIRST_SEEN_KEY = 'xstitch:firstSeenAt';
const MIN_USE_MS = 1000 * 60 * 2; // 2 minutes

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // iOS Safari
  return (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  // Treat coarse-pointer / no-hover devices as mobile/tablet.
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const noHover = window.matchMedia?.('(hover: none)').matches;
  if (coarse || noHover) return true;
  // UA fallback for browsers that fib about pointer media.
  const ua = navigator.userAgent || '';
  return /android|iphone|ipad|ipod|mobile|silk|kindle/i.test(ua);
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua);
}

function recentlyDismissed(): boolean {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    const ts = Number(v);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

/**
 * Persist the timestamp of the user's first visit and return the milliseconds
 * remaining before the install prompt becomes eligible to appear.
 */
function msUntilEligible(): number {
  try {
    const stored = localStorage.getItem(FIRST_SEEN_KEY);
    let firstSeen = stored ? Number(stored) : NaN;
    if (!Number.isFinite(firstSeen)) {
      firstSeen = Date.now();
      localStorage.setItem(FIRST_SEEN_KEY, String(firstSeen));
    }
    return Math.max(0, firstSeen + MIN_USE_MS - Date.now());
  } catch {
    return MIN_USE_MS;
  }
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (!isMobile()) return;
    if (recentlyDismissed()) return;

    const delay = msUntilEligible();
    let eligible = delay === 0;
    let eligibleTimer: number | undefined;
    let pendingShow: 'prompt' | 'ios' | null = null;

    const reveal = (kind: 'prompt' | 'ios') => {
      if (kind === 'ios') setIosHint(true);
      setVisible(true);
    };

    const maybeShow = (kind: 'prompt' | 'ios') => {
      if (eligible) reveal(kind);
      else pendingShow = pendingShow ?? kind;
    };

    if (!eligible) {
      eligibleTimer = window.setTimeout(() => {
        eligible = true;
        if (pendingShow) reveal(pendingShow);
      }, delay);
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      maybeShow('prompt');
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };
    window.addEventListener('appinstalled', onInstalled);

    // iOS Safari never fires beforeinstallprompt — show a hint a little after
    // the 2-minute eligibility threshold (whichever is later).
    let iosTimer: number | undefined;
    if (isIOS() && !isStandalone()) {
      iosTimer = window.setTimeout(() => {
        maybeShow('ios');
      }, Math.max(delay, 4000));
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      if (iosTimer) window.clearTimeout(iosTimer);
      if (eligibleTimer) window.clearTimeout(eligibleTimer);
    };
  }, []);

  const dismiss = () => {
    setClosing(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore storage failures
    }
    window.setTimeout(() => {
      setVisible(false);
      setClosing(false);
    }, 220);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      // ignore
    }
    setDeferred(null);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className={'install-prompt' + (closing ? ' closing' : '')}
      role="dialog"
      aria-live="polite"
      aria-label="Install Cozy Cross Stitch"
    >
      <div className="install-prompt-icon" aria-hidden="true">
        <svg viewBox="0 0 64 64" width="40" height="40">
          <defs>
            <linearGradient id="ipg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#F7D9B6" />
              <stop offset="50%" stopColor="#F4C7CB" />
              <stop offset="100%" stopColor="#DCCAE6" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" rx="14" fill="url(#ipg)" />
          <g stroke="#C58A95" strokeWidth="4" strokeLinecap="round">
            <line x1="18" y1="18" x2="46" y2="46" />
            <line x1="46" y1="18" x2="18" y2="46" />
          </g>
        </svg>
      </div>
      <div className="install-prompt-body">
        <div className="install-prompt-title">Install Cozy Cross Stitch</div>
        {iosHint && !deferred ? (
          <div className="install-prompt-text">
            Tap <Share size={14} aria-label="Share" style={{ verticalAlign: '-2px' }} /> then{' '}
            <strong>
              Add to Home Screen <Plus size={12} style={{ verticalAlign: '-1px' }} />
            </strong>{' '}
            to keep Cozy Cross Stitch one tap away — works offline.
          </div>
        ) : (
          <div className="install-prompt-text">
            Add it to your home screen for a full-screen app feel. Works offline.
          </div>
        )}
      </div>
      <div className="install-prompt-actions">
        {deferred && (
          <button type="button" className="btn btn-sm btn-primary" onClick={install}>
            <Download size={14} /> Install
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

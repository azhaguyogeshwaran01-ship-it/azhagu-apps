import React, { useState } from 'react';
import { DownloadCloud, WifiOff } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        aria-label="Install Offline App"
        className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-[#1c1f26] px-2.5 py-1.5 text-xs font-medium text-[#e5e7eb] hover:border-[#e5a93c]/60 hover:text-white transition-colors whitespace-nowrap shrink-0"
      >
        <DownloadCloud className="h-3.5 w-3.5 text-[#e5a93c]" />
        <span className="hidden xl:inline">Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          aria-label="Install on iOS"
          className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-[#1c1f26] px-2.5 py-1.5 text-xs font-medium text-[#e5e7eb] hover:border-[#e5a93c]/60 transition-colors whitespace-nowrap shrink-0"
        >
          <DownloadCloud className="h-3.5 w-3.5 text-[#e5a93c]" />
          <span className="hidden xl:inline">Install</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Install on iOS instructions"
          >
            <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#15171c] p-5 shadow-xl">
              <h3 className="text-sm font-semibold text-white">
                Install Lumina Offline App
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[#d1d5db]">
                1. Tap the <strong>Share</strong> icon in Safari.<br />
                2. Scroll down and select <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-md bg-[#e5a93c] py-2 text-xs font-semibold text-[#0e0f12]"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 left-4 z-50 flex items-center gap-2 rounded-md border border-[#e5a93c]/40 bg-[#15171c]/95 px-3 py-1.5 text-xs font-medium text-[#f3f4f6] shadow-lg"
    >
      <WifiOff className="h-3.5 w-3.5 text-[#e5a93c]" />
      <span>Offline Mode — Full editor running locally</span>
    </div>
  );
};

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TradeSignal } from '../types/market.ts';

const ALERTS_ENABLED_KEY = 'sa_ai_trader_alerts_enabled';
const LAST_NOTIFIED_ID_KEY = 'sa_ai_trader_last_signal_id';

export function useSignalAlerts(currentSignal: TradeSignal) {
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(ALERTS_ENABLED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission;
  });

  const [inAppAlert, setInAppAlert] = useState<string | null>(null);
  const lastNotifiedRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      lastNotifiedRef.current = window.localStorage.getItem(LAST_NOTIFIED_ID_KEY);
    } catch {
      lastNotifiedRef.current = null;
    }
  }, []);

  const toggleAlerts = useCallback(async () => {
    if (alertsEnabled) {
      setAlertsEnabled(false);
      try {
        window.localStorage.setItem(ALERTS_ENABLED_KEY, 'false');
      } catch {
        // Ignore storage errors
      }
      return;
    }

    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermissionState('unsupported');
      setAlertsEnabled(true);
      try {
        globalThis.localStorage?.setItem(ALERTS_ENABLED_KEY, 'true');
      } catch {
        // Ignore
      }
      setInAppAlert('Browser push notifications are unavailable here; in-app signal alerts enabled.');
      return;
    }

    let perm = Notification.permission;
    if (perm === 'default') {
      try {
        perm = await Notification.requestPermission();
      } catch {
        perm = Notification.permission;
      }
    }
    setPermissionState(perm);
    setAlertsEnabled(true);
    try {
      window.localStorage.setItem(ALERTS_ENABLED_KEY, 'true');
    } catch {
      // Ignore
    }

    if (perm === 'denied') {
      setInAppAlert('Browser notifications are blocked by site settings; in-app alerts remain active.');
    }
  }, [alertsEnabled]);

  useEffect(() => {
    if (!alertsEnabled) return;
    if (currentSignal.direction === 'WAIT') return;
    if (lastNotifiedRef.current === currentSignal.id) return;

    lastNotifiedRef.current = currentSignal.id;
    try {
      window.localStorage.setItem(LAST_NOTIFIED_ID_KEY, currentSignal.id);
    } catch {
      // Ignore
    }

    const title = `SA AI TRADER: ${currentSignal.direction} ${currentSignal.symbol} (${currentSignal.timeframe})`;
    const body = `Entry: $${currentSignal.entryPrice?.toFixed(2) ?? '--'} | SL: $${currentSignal.stopLoss?.toFixed(2) ?? '--'} | TP1: $${currentSignal.takeProfit1?.toFixed(2) ?? '--'}`;

    setInAppAlert(`${title} — ${body}`);

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          tag: currentSignal.id,
        });
      } catch {
        // Fallback already shown in-app
      }
    }
  }, [alertsEnabled, currentSignal]);

  const dismissInAppAlert = useCallback(() => {
    setInAppAlert(null);
  }, []);

  return {
    alertsEnabled,
    permissionState,
    inAppAlert,
    toggleAlerts,
    dismissInAppAlert,
  };
}

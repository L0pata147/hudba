import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { playerStore } from '@sonora/core';
import { useUi } from '../lib/ui-store';

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function isInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('button, a, [role="slider"], [role="row"], [role="menuitem"], [role="switch"], [role="radio"]'));
}

/**
 * Global shortcuts (desktop):
 *   Space            play / pause
 *   ← / →            seek −/+ 10 s
 *   Shift+← / →      previous / next track
 *   Ctrl/Cmd+K       search
 *   Ctrl/Cmd+L       focus search
 *   M                mute
 *   Q                toggle queue
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K' || e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        if (!location.pathname.startsWith('/search')) navigate('/search');
        useUi.getState().focusSearch();
        return;
      }
      if (mod || e.altKey || e.defaultPrevented) return;
      if (isEditable(e.target)) return;
      if (useUi.getState().menu || useUi.getState().dialog) return;
      const player = playerStore.getState();
      switch (e.key) {
        case ' ':
          // Space on a focused button should click it, not toggle playback.
          if (isInteractive(e.target)) return;
          e.preventDefault();
          player.togglePlay();
          break;
        case 'ArrowLeft':
          if (isInteractive(e.target) && !e.shiftKey) return;
          e.preventDefault();
          if (e.shiftKey) player.previous();
          else player.seekBy(-10);
          break;
        case 'ArrowRight':
          if (isInteractive(e.target) && !e.shiftKey) return;
          e.preventDefault();
          if (e.shiftKey) player.next();
          else player.seekBy(10);
          break;
        case 'm':
        case 'M':
          player.toggleMute();
          break;
        case 'q':
        case 'Q':
          useUi.getState().toggleQueue();
          break;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}

// lib/haptics.ts
// Small vibrations for moments that matter, kept deliberately rare so they
// still mean something: a tap feel on navigation, and a "done" buzz when a
// longer job finishes. Never throws -- a phone without haptics just stays still.
import * as Haptics from 'expo-haptics';

/** Switching tabs, opening the + menu. */
export function tap() {
  Haptics.selectionAsync().catch(() => {});
}

/** An import, a schedule or a brief finished. */
export function success() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Something destructive was confirmed (deleting a video). */
export function warning() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

/**
 * DissonanceBanner — logic moved into the StatusStrip in App.tsx.
 * This component is retained for import compatibility but renders nothing.
 * The status strip IS the alarm display.
 */
import type { ConflictAlert } from "../hooks/useWebSocket";

export default function DissonanceBanner(_props: {
  conflict: ConflictAlert | null;
  onDismiss: () => void;
}) {
  return null;
}

/**
 * VoiceChannel — browser mic → Agora RTC channel.
 * Shows animated waveform bars driven by actual mic volume.
 * The AI agent (already in the channel) hears your mic via Agora.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import AgoraRTC, {
  IAgoraRTCClient,
  IMicrophoneAudioTrack,
} from "agora-rtc-sdk-ng";
import { Mic, MicOff, Phone, PhoneOff, Loader2, Radio, Volume2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const BACKEND = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

AgoraRTC.setLogLevel(3);

type ChannelState = "idle" | "connecting" | "connected" | "error";

const ROLES = ["Fire_Chief", "Traffic_Control", "Hazmat_Lead"];
const ROLE_COLORS: Record<string, string> = {
  Fire_Chief: "text-orange-400 border-orange-500/40",
  Traffic_Control: "text-blue-400 border-blue-500/40",
  Hazmat_Lead: "text-yellow-400 border-yellow-500/40",
};

function WaveformBars({ volume, active }: { volume: number; active: boolean }) {
  const bars = 12;
  return (
    <div className="flex items-center gap-0.5 h-6">
      {Array.from({ length: bars }).map((_, i) => {
        const centerDist = Math.abs(i - bars / 2) / (bars / 2);
        const baseH = active ? Math.max(2, volume * (1 - centerDist * 0.5) + Math.random() * volume * 0.3) : 2;
        return (
          <motion.div
            key={i}
            className={`w-0.5 rounded-full ${active && volume > 5 ? "bg-safe" : "bg-border2"}`}
            animate={{ height: `${Math.min(24, Math.max(2, baseH))}px` }}
            transition={{ duration: 0.08, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}

export default function VoiceChannel({ role: initialRole }: { role: string }) {
  const [channelState, setChannelState] = useState<ChannelState>("idle");
  const [selectedRole, setSelectedRole] = useState(initialRole);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0);
  const [remoteCount, setRemoteCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const micRef = useRef<IMicrophoneAudioTrack | null>(null);
  const volumeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(async () => {
    if (volumeTimerRef.current) clearInterval(volumeTimerRef.current);
    if (micRef.current) { micRef.current.stop(); micRef.current.close(); micRef.current = null; }
    if (clientRef.current) { await clientRef.current.leave().catch(() => null); clientRef.current = null; }
    setRemoteCount(0);
    setVolume(0);
  }, []);

  useEffect(() => () => { cleanup(); }, [cleanup]);

  async function join() {
    setChannelState("connecting");
    setError(null);
    try {
      const resp = await fetch(`${BACKEND}/rtc/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: 0, role: "publisher" }),
      });
      const { token, channel, app_id } = await resp.json() as {
        token: string; channel: string; app_id: string; uid: number;
      };

      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      clientRef.current = client;

      client.on("user-published", async (user, mediaType) => {
        if (mediaType === "audio") {
          await client.subscribe(user, mediaType);
          user.audioTrack?.play();
          setRemoteCount(c => c + 1);
        }
      });
      client.on("user-unpublished", () => setRemoteCount(c => Math.max(0, c - 1)));
      client.on("user-left", () => setRemoteCount(c => Math.max(0, c - 1)));

      await client.join(app_id, channel, token || null, null);

      const micTrack = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: "speech_standard",
        AEC: true,
        ANS: true,
        AGC: true,
      });
      micRef.current = micTrack;
      await client.publish(micTrack);

      volumeTimerRef.current = setInterval(() => {
        setVolume(Math.round((micTrack.getVolumeLevel() ?? 0) * 100));
      }, 80);

      setChannelState("connected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join");
      setChannelState("error");
      await cleanup();
    }
  }

  async function leave() {
    await cleanup();
    setChannelState("idle");
  }

  function toggleMute() {
    if (micRef.current) {
      micRef.current.setEnabled(muted);
      setMuted(!muted);
    }
  }

  const isConnected = channelState === "connected";
  const roleColorClass = ROLE_COLORS[selectedRole] ?? "text-muted border-border";

  return (
    <div className="border-t border-border bg-surface2 shrink-0">
      {/* Header */}
      <div className="h-8 px-3 border-b border-border/50 flex items-center gap-2">
        <Radio size={10} className={isConnected ? "text-safe" : "text-dim"} />
        <span className="font-mono text-[11px] font-medium text-text">Voice Channel</span>
        {isConnected && (
          <span className="font-mono text-[9px] text-safe border border-safe/30 px-1">LIVE</span>
        )}
        {remoteCount > 0 && (
          <div className="flex items-center gap-1 ml-1">
            <Volume2 size={9} className="text-cyan" />
            <span className="font-mono text-[9px] text-cyan">{remoteCount} remote</span>
          </div>
        )}
      </div>

      <div className="px-3 py-2.5 space-y-2">
        {/* Role selector — only when not connected */}
        {!isConnected && (
          <div className="flex items-center gap-1">
            <span className="font-mono text-[9px] text-dim mr-1">Join as:</span>
            {ROLES.map(r => (
              <button
                key={r}
                onClick={() => setSelectedRole(r)}
                className={`font-mono text-[9px] px-1.5 py-0.5 border transition-all ${
                  selectedRole === r
                    ? `${ROLE_COLORS[r] ?? ""} border-current bg-current/10`
                    : "text-dim border-border hover:border-border2"
                }`}
              >
                {r.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        )}

        {/* Connected state — waveform + controls */}
        {isConnected && (
          <div className="flex items-center gap-3">
            <div className={`font-mono text-[10px] font-medium border px-2 py-0.5 ${roleColorClass}`}>
              {selectedRole.replace(/_/g, " ")}
            </div>
            <WaveformBars volume={muted ? 0 : volume} active={!muted} />
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={toggleMute}
                className={`font-mono text-[9px] px-2 py-1 border transition-all flex items-center gap-1 ${
                  muted
                    ? "border-critical/50 text-critical bg-critical/10"
                    : "border-border text-dim hover:border-border2 hover:text-muted"
                }`}>
                {muted ? <MicOff size={9} /> : <Mic size={9} />}
                {muted ? "Unmute" : "Mute"}
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="font-mono text-[9px] text-critical">{error}</p>
        )}

        {/* Join/Leave button */}
        <div className="flex items-center gap-2">
          {channelState === "idle" || channelState === "error" ? (
            <button onClick={join}
              className="flex-1 flex items-center justify-center gap-1.5 font-mono text-[10px] py-1.5 border border-safe/40 text-safe hover:bg-safe hover:text-base transition-all uppercase tracking-wide">
              <Phone size={10} />
              Join Channel
            </button>
          ) : channelState === "connecting" ? (
            <button disabled
              className="flex-1 flex items-center justify-center gap-1.5 font-mono text-[10px] py-1.5 border border-border text-dim opacity-60 uppercase">
              <Loader2 size={10} className="animate-spin" />
              Connecting...
            </button>
          ) : (
            <button onClick={leave}
              className="flex-1 flex items-center justify-center gap-1.5 font-mono text-[10px] py-1.5 border border-critical/40 text-critical hover:bg-critical hover:text-white transition-all uppercase">
              <PhoneOff size={10} />
              Leave Channel
            </button>
          )}
        </div>

        {/* Instructions when idle */}
        {channelState === "idle" && (
          <p className="font-mono text-[9px] text-dim text-center">
            Join to speak with Sentinel-1 AI live
          </p>
        )}
      </div>
    </div>
  );
}

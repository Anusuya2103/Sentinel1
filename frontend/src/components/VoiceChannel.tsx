/**
 * VoiceChannel — joins the Agora RTC channel from the browser.
 * This is how you talk to the Sentinel-1 AI agent in real time.
 * The agent (already in the channel) hears your mic, transcribes it,
 * and responds via TTS — all through Agora Conversational AI.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import AgoraRTC, {
  IAgoraRTCClient,
  IMicrophoneAudioTrack,
  IRemoteAudioTrack,
} from "agora-rtc-sdk-ng";
import { Mic, MicOff, Phone, PhoneOff, Volume2, Loader2, Radio } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const BACKEND = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

AgoraRTC.setLogLevel(3); // warnings only

type ChannelState = "idle" | "connecting" | "connected" | "error";

interface RemoteSpeaker {
  uid: string | number;
  track: IRemoteAudioTrack;
  speaking: boolean;
}

export default function VoiceChannel({ role }: { role: string }) {
  const [channelState, setChannelState] = useState<ChannelState>("idle");
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0);
  const [remoteSpeakers, setRemoteSpeakers] = useState<RemoteSpeaker[]>([]);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const micRef = useRef<IMicrophoneAudioTrack | null>(null);
  const volumeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(async () => {
    if (volumeTimerRef.current) clearInterval(volumeTimerRef.current);
    if (micRef.current) {
      micRef.current.stop();
      micRef.current.close();
      micRef.current = null;
    }
    if (clientRef.current) {
      await clientRef.current.leave().catch(() => null);
      clientRef.current = null;
    }
    setRemoteSpeakers([]);
    setVolume(0);
  }, []);

  useEffect(() => () => { cleanup(); }, [cleanup]);

  async function join() {
    setChannelState("connecting");
    setError(null);
    try {
      // Get token from backend
      const resp = await fetch(`${BACKEND}/rtc/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: 0, role: "publisher" }),
      });
      const { token, channel, app_id } = await resp.json() as {
        token: string; channel: string; app_id: string; uid: number;
      };

      // Create RTC client
      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      clientRef.current = client;

      // Subscribe to remote audio (AI agent + other responders)
      client.on("user-published", async (user, mediaType) => {
        if (mediaType === "audio") {
          await client.subscribe(user, mediaType);
          const track = user.audioTrack!;
          track.play();
          setRemoteSpeakers(prev => [...prev, {
            uid: user.uid, track, speaking: false,
          }]);
        }
      });

      client.on("user-unpublished", (user) => {
        setRemoteSpeakers(prev => prev.filter(s => s.uid !== user.uid));
      });

      client.on("user-left", (user) => {
        setRemoteSpeakers(prev => prev.filter(s => s.uid !== user.uid));
      });

      // Join channel
      const uid = await client.join(app_id, channel, token || null, null);
      console.log("Joined channel as UID:", uid);

      // Publish mic
      const micTrack = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: "speech_low_quality",
        AEC: true,
        ANS: true,
      });
      micRef.current = micTrack;
      await client.publish(micTrack);

      // Volume meter
      volumeTimerRef.current = setInterval(() => {
        const vol = micTrack.getVolumeLevel() * 100;
        setVolume(Math.round(vol));
      }, 100);

      setChannelState("connected");
    } catch (err) {
      console.error("Voice join error:", err);
      setError(err instanceof Error ? err.message : "Failed to join channel");
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
      if (muted) {
        micRef.current.setEnabled(true);
      } else {
        micRef.current.setEnabled(false);
      }
      setMuted(!muted);
    }
  }

  const isConnected = channelState === "connected";

  return (
    <div className="border-t border-border bg-panel2">
      {/* Header */}
      <div className="h-8 px-3 border-b border-border flex items-center gap-2">
        <Radio size={11} className={isConnected ? "text-safe" : "text-dim"} />
        <span className="font-mono text-[11px] font-medium text-text">VOICE CHANNEL</span>
        <span className="font-mono text-[9px] text-dim">· sentinel1-incident</span>
        {isConnected && (
          <span className="font-mono text-[9px] text-safe border border-safe/30 px-1 ml-1">LIVE</span>
        )}
        <span className="ml-auto font-mono text-[9px] text-dim">
          {remoteSpeakers.length} remote participant{remoteSpeakers.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="px-3 py-2.5 flex items-center gap-3">
        {/* Role label */}
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[9px] text-dim">Joining as:</span>
          <span className="font-mono text-[10px] text-moderate font-medium">{role}</span>
        </div>

        {/* Volume bar */}
        {isConnected && (
          <div className="flex items-center gap-1.5">
            <Mic size={10} className={muted ? "text-critical" : "text-safe"} />
            <div className="w-16 h-1.5 bg-border overflow-hidden">
              <motion.div
                className={`h-full ${muted ? "bg-critical/30" : "bg-safe"}`}
                animate={{ width: `${muted ? 0 : volume}%` }}
                transition={{ duration: 0.05 }}
              />
            </div>
          </div>
        )}

        {/* Remote speakers */}
        {isConnected && remoteSpeakers.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Volume2 size={10} className="text-info" />
            <span className="font-mono text-[9px] text-info">
              {remoteSpeakers.length} speaker{remoteSpeakers.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <span className="font-mono text-[9px] text-critical truncate max-w-xs">{error}</span>
        )}

        {/* Controls */}
        <div className="ml-auto flex items-center gap-2">
          {isConnected && (
            <button
              onClick={toggleMute}
              className={`flex items-center gap-1 font-mono text-[10px] px-2 py-1 border transition-all ${
                muted
                  ? "border-critical/50 text-critical bg-critical/10"
                  : "border-border text-muted hover:border-border2"
              }`}
            >
              {muted ? <MicOff size={10} /> : <Mic size={10} />}
              {muted ? "Unmute" : "Mute"}
            </button>
          )}

          {channelState === "idle" || channelState === "error" ? (
            <button
              onClick={join}
              className="flex items-center gap-1.5 font-mono text-[10px] px-3 py-1 border border-safe/50 text-safe hover:bg-safe hover:text-base transition-all uppercase"
            >
              <Phone size={10} />
              Join Channel
            </button>
          ) : channelState === "connecting" ? (
            <button disabled className="flex items-center gap-1.5 font-mono text-[10px] px-3 py-1 border border-border text-dim opacity-60 uppercase">
              <Loader2 size={10} className="animate-spin" />
              Connecting…
            </button>
          ) : (
            <button
              onClick={leave}
              className="flex items-center gap-1.5 font-mono text-[10px] px-3 py-1 border border-critical/50 text-critical hover:bg-critical hover:text-white transition-all uppercase"
            >
              <PhoneOff size={10} />
              Leave
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

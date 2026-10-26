import { VOICE_MAX_BITRATE, VOICE_SEND_OFF, VOICE_SEND_ON, type RtcKind, type RtcSignalIn } from "@hangout/shared";

type SendSignal = (to: string, kind: RtcKind, data: unknown) => void;

interface Peer {
  pc: RTCPeerConnection;
  pendingIce: RTCIceCandidateInit[];
  /** Close enough to hear us; unknown positions count as in range. */
  inRange: boolean;
  /** Sender parameter updates, one at a time (a stale getParameters transaction makes setParameters throw). */
  params: Promise<void>;
}

/**
 * Asks the other side's encoder for less traffic. Applied to the *remote* description, whose parameters
 * configure our encoder (both peers run this):
 * - usedtx=1: during silence, a comfort-noise packet every 400 ms instead of 50 full frames a second.
 * - ptime 60: 60 ms frames, so a third of the packets and their ~68 bytes of headers each, which at
 *   VOICE_MAX_BITRATE would otherwise be about half the traffic. Costs ~40 ms of latency.
 */
function leanOpus(sdp: string) {
  const pt = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp)?.[1];
  if (!pt) return sdp;
  return sdp.replace(new RegExp(`(a=fmtp:${pt} [^\\r\\n]*)`), (line) =>
    /usedtx=/.test(line) ? line : `${line};usedtx=1${/a=ptime:/.test(sdp) ? "" : "\r\na=ptime:60"}`,
  );
}

function remoteDescription(data: unknown): RTCSessionDescriptionInit {
  const desc = data as RTCSessionDescriptionInit;
  return desc.sdp ? { ...desc, sdp: leanOpus(desc.sdp) } : desc;
}

/**
 * Full-mesh P2P voice: one RTCPeerConnection per remote player.
 * The peer with the lexically smaller sessionId makes the first offer. Either side may offer again later
 * (a mic turned on mid-game); if both offer at once, the initiator ignores the other's offer and the other
 * side drops its own (setRemoteDescription rolls it back) and answers.
 */
export class VoiceMesh {
  private peers = new Map<string, Peer>();
  private muted = false;

  constructor(
    private selfId: string,
    private localStream: MediaStream | null,
    private sendSignal: SendSignal,
    private onStream: (id: string, stream: MediaStream) => void,
    private onClosed: (id: string) => void,
    /** Resolves once the server has sent TURN credentials (or STUN only, on timeout). */
    private iceServers: Promise<RTCIceServer[]>,
  ) {}

  private isInitiator(remoteId: string) {
    return this.selfId < remoteId;
  }

  /** Candidates are gathered at setLocalDescription, so this must run before it. */
  private async useIceServers(pc: RTCPeerConnection) {
    pc.setConfiguration({ iceServers: await this.iceServers });
  }

  /**
   * Caps the bitrate, and stops sending entirely while muted or out of earshot (no packets, so the other
   * side decodes nothing either). Encodings exist only after negotiation, so this runs after every
   * setLocalDescription as well as on changes.
   */
  private applySending(peer: Peer) {
    const active = peer.inRange && !this.muted;
    peer.params = peer.params
      .then(async () => {
        for (const sender of peer.pc.getSenders()) {
          if (sender.track?.kind !== "audio") continue;
          const params = sender.getParameters();
          const [enc] = params.encodings ?? [];
          if (!enc || (enc.active === active && enc.maxBitrate === VOICE_MAX_BITRATE)) continue;
          enc.active = active;
          enc.maxBitrate = VOICE_MAX_BITRATE;
          await sender.setParameters(params);
        }
      })
      .catch((err) => console.warn("[voice] setParameters failed", err));
  }

  /** Mute: stop sending to everyone (the track is also disabled, which feeds speaking detection). */
  setMuted(muted: boolean) {
    this.muted = muted;
    for (const peer of this.peers.values()) this.applySending(peer);
  }

  /** Distance to a remote player; sending follows it with hysteresis (VOICE_SEND_ON / VOICE_SEND_OFF). */
  setDistance(remoteId: string, meters: number) {
    const peer = this.peers.get(remoteId);
    if (!peer) return;
    const inRange = peer.inRange ? meters < VOICE_SEND_OFF : meters < VOICE_SEND_ON;
    if (inRange === peer.inRange) return;
    peer.inRange = inRange;
    this.applySending(peer);
  }

  /** A mic that became available after joining: start sending it on every existing connection. */
  async setLocalStream(stream: MediaStream) {
    this.localStream = stream;
    const [track] = stream.getAudioTracks();
    if (!track) return;
    for (const [remoteId, { pc }] of this.peers) {
      // Reuse the receive-only audio line from when we had no mic, so the other side keeps its stream.
      const transceiver = pc.getTransceivers().find((t) => t.receiver.track.kind === "audio" && t.currentDirection !== "stopped");
      if (transceiver) {
        await transceiver.sender.replaceTrack(track);
        transceiver.direction = "sendrecv";
      } else {
        pc.addTrack(track, stream);
      }
      this.makeOffer(remoteId).catch(console.error);
    }
  }

  connect(remoteId: string) {
    if (this.peers.has(remoteId)) return;
    const pc = new RTCPeerConnection();
    this.peers.set(remoteId, { pc, pendingIce: [], inRange: true, params: Promise.resolve() });

    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) pc.addTrack(track, this.localStream);
    } else if (this.isInitiator(remoteId)) {
      // No mic: still negotiate an audio line so we can hear them.
      pc.addTransceiver("audio", { direction: "recvonly" });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) this.sendSignal(remoteId, "ice", e.candidate.toJSON());
    };
    pc.ontrack = (e) => {
      this.onStream(remoteId, e.streams[0] ?? new MediaStream([e.track]));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" && this.isInitiator(remoteId)) {
        this.makeOffer(remoteId, true).catch(console.error);
      }
    };

    if (this.isInitiator(remoteId)) this.makeOffer(remoteId).catch(console.error);
  }

  private async makeOffer(remoteId: string, iceRestart = false) {
    const peer = this.peers.get(remoteId);
    if (!peer) return;
    await this.useIceServers(peer.pc);
    const offer = await peer.pc.createOffer({ iceRestart });
    await peer.pc.setLocalDescription(offer);
    this.applySending(peer);
    this.sendSignal(remoteId, "offer", { type: offer.type, sdp: offer.sdp });
  }

  async handleSignal({ from, kind, data }: RtcSignalIn) {
    // An offer can arrive before our state sync has announced that player.
    if (!this.peers.has(from) && kind === "offer") this.connect(from);
    const peer = this.peers.get(from);
    if (!peer) return;
    const { pc } = peer;

    try {
      if (kind === "offer") {
        // Both offered at once: the initiator's offer wins.
        if (pc.signalingState !== "stable" && this.isInitiator(from)) return;
        await pc.setRemoteDescription(remoteDescription(data));
        await this.flushIce(peer);
        await this.useIceServers(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.applySending(peer);
        this.sendSignal(from, "answer", { type: answer.type, sdp: answer.sdp });
      } else if (kind === "answer") {
        await pc.setRemoteDescription(remoteDescription(data));
        await this.flushIce(peer);
      } else if (kind === "ice") {
        if (pc.remoteDescription) await pc.addIceCandidate(data as RTCIceCandidateInit);
        else peer.pendingIce.push(data as RTCIceCandidateInit);
      }
    } catch (err) {
      console.warn(`[voice] signal ${kind} from ${from} failed`, err);
    }
  }

  private async flushIce(peer: Peer) {
    for (const c of peer.pendingIce.splice(0)) {
      await peer.pc.addIceCandidate(c).catch(() => {});
    }
  }

  disconnect(remoteId: string) {
    const peer = this.peers.get(remoteId);
    if (!peer) return;
    peer.pc.close();
    this.peers.delete(remoteId);
    this.onClosed(remoteId);
  }

  destroy() {
    for (const id of [...this.peers.keys()]) this.disconnect(id);
  }
}

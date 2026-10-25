import type { RtcKind, RtcSignalIn } from "@hangout/shared";

type SendSignal = (to: string, kind: RtcKind, data: unknown) => void;

interface Peer {
  pc: RTCPeerConnection;
  pendingIce: RTCIceCandidateInit[];
}

/**
 * Full-mesh P2P voice: one RTCPeerConnection per remote player.
 * The peer with the lexically smaller sessionId makes the first offer. Either side may offer again later
 * (a mic turned on mid-game); if both offer at once, the initiator ignores the other's offer and the other
 * side drops its own (setRemoteDescription rolls it back) and answers.
 */
export class VoiceMesh {
  private peers = new Map<string, Peer>();

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
    this.peers.set(remoteId, { pc, pendingIce: [] });

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
        await pc.setRemoteDescription(data as RTCSessionDescriptionInit);
        await this.flushIce(peer);
        await this.useIceServers(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.sendSignal(from, "answer", { type: answer.type, sdp: answer.sdp });
      } else if (kind === "answer") {
        await pc.setRemoteDescription(data as RTCSessionDescriptionInit);
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

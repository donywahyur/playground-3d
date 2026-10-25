import type { Vector3 } from "three";
import { AUDIO_MAX_DIST, AUDIO_REF_DIST } from "@hangout/shared";

interface Source {
  el: HTMLAudioElement;
  node: MediaStreamAudioSourceNode;
  panner: PannerNode;
}

// Smoothing time constant for position updates; avoids zipper noise when values jump per frame.
const SMOOTH = 0.05;

/**
 * Routes each remote voice through a PannerNode so loudness falls off with
 * distance (linear model: full volume inside AUDIO_REF_DIST, silent past
 * AUDIO_MAX_DIST) and is panned left/right relative to the camera.
 */
export class SpatialAudio {
  readonly ctx = new AudioContext();
  private master = this.ctx.createGain();
  private sources = new Map<string, Source>();

  constructor() {
    this.master.connect(this.ctx.destination);
  }

  resume() {
    return this.ctx.resume();
  }

  /** Master volume for all remote voices, 0..1. */
  setVolume(v: number) {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  add(id: string, stream: MediaStream) {
    this.remove(id);

    // Chrome only feeds remote WebRTC audio into Web Audio if the stream is
    // also attached to a media element, so keep a muted one alive.
    const el = new Audio();
    el.srcObject = stream;
    el.muted = true;
    el.play().catch(() => {});

    const node = this.ctx.createMediaStreamSource(stream);
    const panner = new PannerNode(this.ctx, {
      panningModel: "HRTF",
      distanceModel: "linear",
      refDistance: AUDIO_REF_DIST,
      maxDistance: AUDIO_MAX_DIST,
      rolloffFactor: 1,
    });
    node.connect(panner).connect(this.master);
    this.sources.set(id, { el, node, panner });
  }

  remove(id: string) {
    const s = this.sources.get(id);
    if (!s) return;
    s.node.disconnect();
    s.panner.disconnect();
    s.el.srcObject = null;
    this.sources.delete(id);
  }

  /** Call every frame with the local listener pose and remote player positions. */
  update(listenerPos: Vector3, forward: Vector3, positions: Map<string, Vector3>) {
    const t = this.ctx.currentTime;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.setTargetAtTime(listenerPos.x, t, SMOOTH);
      l.positionY.setTargetAtTime(listenerPos.y, t, SMOOTH);
      l.positionZ.setTargetAtTime(listenerPos.z, t, SMOOTH);
      l.forwardX.setTargetAtTime(forward.x, t, SMOOTH);
      l.forwardY.setTargetAtTime(forward.y, t, SMOOTH);
      l.forwardZ.setTargetAtTime(forward.z, t, SMOOTH);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      // Firefox: AudioListener has no AudioParams, only the legacy setters.
      l.setPosition(listenerPos.x, listenerPos.y, listenerPos.z);
      l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }

    for (const [id, s] of this.sources) {
      const p = positions.get(id);
      if (!p) continue;
      s.panner.positionX.setTargetAtTime(p.x, t, SMOOTH);
      s.panner.positionY.setTargetAtTime(p.y, t, SMOOTH);
      s.panner.positionZ.setTargetAtTime(p.z, t, SMOOTH);
    }
  }

  destroy() {
    for (const id of [...this.sources.keys()]) this.remove(id);
    this.ctx.close().catch(() => {});
  }
}

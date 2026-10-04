// Adapter WebRTC peer-to-peer untuk PvP 1v1 dua perangkat.
//
// Desain:
// - Signaling manual: SDP (offer/answer) di-copy-paste antar pemain, tanpa
//   server signaling. Memakai ICE non-trickle (`iceGatheringState=complete`
//   sebelum SDP dikirim) sehingga SDP sudah memuat kandidat — tidak perlu
//   pertukaran ICE candidate terpisah.
// - Satu DataChannel (dibuka host) untuk seluruh pesan protokol.
// - STUN publik dipakai untuk penetrasi NAT. Tanpa TURN: NAT simetris ekstrem
//   atau firewall ketat bisa gagal tersambung (keterbatasan tanpa backend).
//
// Modul ini satu-satunya pemilik API browser WebRTC (ARCHITECTURE.md: adapters).

const STUN_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

/** Paste dapat mengubah CRLF menjadi LF atau membuang newline terakhir. */
function sanitizeSdp(sdp: string): string {
  return sdp.replace(/\r\n?/g, '\n').trim().split('\n').join('\r\n') + '\r\n';
}

export type PvpPeerStatus =
  | 'idle'
  | 'creating-offer'
  | 'awaiting-answer'
  | 'awaiting-offer'
  | 'creating-answer'
  | 'connecting'
  | 'connected'
  | 'failed'
  | 'closed';

export interface PvpPeerEvents {
  /** SDP lokal (offer/answer) siap di-copy-paste ke pemain lain. */
  onSignal(signal: string, kind: 'offer' | 'answer'): void;
  /** Perubahan status koneksi (untuk teks status UI). */
  onStatus(status: PvpPeerStatus): void;
  /** Pesan protokol dari peer (JSON sudah diparse). */
  onMessage(message: unknown): void;
  /** DataChannel terbuka dan siap kirim. */
  onOpen(): void;
  /** Koneksi tertutup / gagal, dengan alasan. */
  onClosed(reason: string): void;
}

/**
 * Satu sisi koneksi PvP. Host membuka DataChannel dan menawarkan SDP;
 * tamu menerima SDP dan membalas jawaban.
 */
export class PvpPeer {
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private status: PvpPeerStatus = 'idle';
  private isHost = false;

  constructor(private readonly events: PvpPeerEvents) {}

  getStatus(): PvpPeerStatus {
    return this.status;
  }

  private setStatus(next: PvpPeerStatus): void {
    this.status = next;
    this.events.onStatus(next);
  }

  /** Mulai sebagai host: buat koneksi + DataChannel, lalu tawarkan SDP. */
  host(): void {
    if (this.pc) return;
    this.isHost = true;
    const pc = new RTCPeerConnection(STUN_SERVERS);
    this.pc = pc;
    this.channel = pc.createDataChannel('crown-catalyst-pvp', { ordered: true });
    this.wireChannel(this.channel);
    this.wirePeer(pc);
    this.setStatus('creating-offer');
    const self = this;
    this.makeOffer(pc).catch(function (error: unknown) {
      self.fail(error);
    });
  }

  /** Mulai sebagai tamu: tunggu SDP host masuk lewat handleSignal. */
  join(): void {
    if (this.pc) return;
    this.isHost = false;
    const pc = new RTCPeerConnection(STUN_SERVERS);
    this.pc = pc;
    pc.ondatachannel = (event: RTCDataChannelEvent): void => {
      this.channel = event.channel;
      this.wireChannel(this.channel);
    };
    this.wirePeer(pc);
    this.setStatus('awaiting-offer');
  }

  /** Terima SDP dari peer (offer untuk tamu, answer untuk host). */
  async handleSignal(sdp: string): Promise<void> {
    if (!this.pc) return;
    const pc = this.pc;
    const clean = sanitizeSdp(sdp);
    try {
      if (!this.isHost) {
        this.setStatus('creating-answer');
        await pc.setRemoteDescription({ type: 'offer', sdp: clean });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await this.waitIceComplete(pc);
        if (pc.localDescription?.sdp) {
          this.events.onSignal(pc.localDescription.sdp, 'answer');
        }
      } else {
        this.setStatus('connecting');
        await pc.setRemoteDescription({ type: 'answer', sdp: clean });
      }
    } catch (error) {
      this.fail(error);
    }
  }

  /** Kirim pesan protokol ke peer (JSON-serializable). */
  send(message: unknown): boolean {
    if (!this.channel || this.channel.readyState !== 'open') return false;
    this.channel.send(JSON.stringify(message));
    return true;
  }

  async copySignal(signal: string): Promise<void> {
    await navigator.clipboard.writeText(signal);
  }

  close(): void {
    this.setStatus('closed');
    if (this.channel) {
      try { this.channel.close(); } catch { /* ignore */ }
    }
    if (this.pc) {
      try { this.pc.close(); } catch { /* ignore */ }
    }
    this.channel = null;
    this.pc = null;
  }

  private async makeOffer(pc: RTCPeerConnection): Promise<void> {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.waitIceComplete(pc);
    if (pc.localDescription?.sdp) {
      this.setStatus('awaiting-answer');
      this.events.onSignal(pc.localDescription.sdp, 'offer');
    }
  }

  private waitIceComplete(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise<void>(function (resolve) {
      const check = function (): void {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', check);
    });
  }

  private wirePeer(pc: RTCPeerConnection): void {
    pc.onconnectionstatechange = (): void => {
      const state = pc.connectionState;
      if (state === 'connected') this.setStatus('connected');
      else if (state === 'failed') this.fail(new Error('WebRTC connection failed'));
      else if (state === 'disconnected' || state === 'closed') {
        if (this.status !== 'closed') this.events.onClosed('Koneksi terputus.');
      }
    };
  }

  private wireChannel(channel: RTCDataChannel): void {
    channel.onopen = (): void => {
      this.setStatus('connected');
      this.events.onOpen();
    };
    channel.onmessage = (event: MessageEvent<string>): void => {
      try {
        this.events.onMessage(JSON.parse(event.data));
      } catch {
        this.events.onMessage(null);
      }
    };
    channel.onclose = (): void => {
      if (this.status !== 'closed') this.events.onClosed('Saluran data ditutup.');
    };
    channel.onerror = (): void => {
      this.events.onClosed('Kesalahan saluran data.');
    };
  }

  private fail(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.setStatus('failed');
    this.events.onClosed(message || 'Gagal menyambungkan.');
  }
}

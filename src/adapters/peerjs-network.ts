import PeerJS, { type DataConnection, type Peer } from 'peerjs';

export interface PeerLink {
  readonly peerId: string;
  send(payload: unknown): void;
  onData(handler: (payload: unknown) => void): () => void;
  onState(handler: (state: 'open' | 'closed' | 'error', message?: string) => void): () => void;
  close(): void;
}

export interface PeerEndpoint {
  readonly id: string;
  connect(peerId: string): Promise<PeerLink>;
  onConnection(handler: (link: PeerLink) => void): () => void;
  onState(handler: (state: 'open' | 'disconnected' | 'closed' | 'error', message?: string) => void): () => void;
  close(): void;
}

const PEER_OPEN_TIMEOUT_MS = 15_000;
const LINK_OPEN_TIMEOUT_MS = 20_000;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function makeLink(connection: DataConnection, onTerminal?: () => void): PeerLink {
  const dataHandlers = new Set<(payload: unknown) => void>();
  const stateHandlers = new Set<(state: 'open' | 'closed' | 'error', message?: string) => void>();
  let state: 'open' | 'closed' | 'error' | undefined = connection.open ? 'open' : undefined;
  let closed = false;

  const emitState = (next: 'open' | 'closed' | 'error', message?: string): void => {
    if (closed && next !== 'closed') return;
    state = next;
    for (const handler of stateHandlers) handler(next, message);
  };
  const onData = (payload: unknown): void => {
    for (const handler of dataHandlers) handler(payload);
  };
  const onOpen = (): void => emitState('open');
  const onClose = (): void => {
    if (closed) return;
    closed = true;
    emitState('closed');
    onTerminal?.();
    cleanup();
  };
  const onError = (error: Error): void => {
    if (closed) return;
    state = 'error';
    for (const handler of stateHandlers) handler('error', errorMessage(error));
    closed = true;
    onTerminal?.();
    cleanup();
    connection.close();
  };
  const cleanup = (): void => {
    connection.off('data', onData);
    connection.off('open', onOpen);
    connection.off('close', onClose);
    connection.off('error', onError);
    dataHandlers.clear();
    stateHandlers.clear();
  };

  connection.on('data', onData);
  connection.on('open', onOpen);
  connection.on('close', onClose);
  connection.on('error', onError);

  return {
    peerId: connection.peer,
    send(payload: unknown): void {
      if (closed || !connection.open) throw new Error('Peer link is not open');
      connection.send(payload);
    },
    onData(handler): () => void {
      if (closed) return () => undefined;
      dataHandlers.add(handler);
      return () => dataHandlers.delete(handler);
    },
    onState(handler): () => void {
      if (closed) {
        handler('closed');
        return () => undefined;
      }
      stateHandlers.add(handler);
      if (state) handler(state);
      return () => stateHandlers.delete(handler);
    },
    close(): void {
      if (closed) return;
      closed = true;
      emitState('closed');
      onTerminal?.();
      cleanup();
      connection.close();
    },
  };
}

export function createPeerEndpoint(peerId?: string): Promise<PeerEndpoint> {
  return new Promise((resolve, reject) => {
    let peer: Peer;
    try {
      peer = peerId === undefined ? new PeerJS() : new PeerJS(peerId);
    } catch (error) {
      reject(error);
      return;
    }

    let settled = false;
    let closed = false;
    let state: 'open' | 'disconnected' | 'closed' | 'error' | undefined;
    const connectionHandlers = new Set<(link: PeerLink) => void>();
    const stateHandlers = new Set<(state: 'open' | 'disconnected' | 'closed' | 'error', message?: string) => void>();
    const incomingLinks = new Set<PeerLink>();
    let endpoint: PeerEndpoint | undefined;

    const emitState = (next: 'open' | 'disconnected' | 'closed' | 'error', message?: string): void => {
      state = next;
      for (const handler of stateHandlers) handler(next, message);
    };
    const onOpen = (): void => {
      if (settled || closed) return;
      settled = true;
      clearTimeout(openTimer);
      emitState('open');
      resolve(endpoint!);
    };
    const onConnection = (connection: DataConnection): void => {
      if (closed) {
        connection.close();
        return;
      }
      let link: PeerLink;
      link = makeLink(connection, () => incomingLinks.delete(link));
      incomingLinks.add(link);
      for (const handler of connectionHandlers) handler(link);
    };
    const onDisconnected = (): void => emitState('disconnected');
    const onClosed = (): void => {
      closed = true;
      emitState('closed');
      cleanupPeerListeners();
      connectionHandlers.clear();
      stateHandlers.clear();
      for (const link of incomingLinks) link.close();
      incomingLinks.clear();
      if (!settled) {
        settled = true;
        clearTimeout(openTimer);
        reject(new Error('PeerJS endpoint closed before opening'));
      }
    };
    const onError = (error: Error): void => {
      const message = errorMessage(error);
      emitState('error', message);
      if (!settled) {
        settled = true;
        clearTimeout(openTimer);
        cleanupPeerListeners();
        peer.destroy();
        reject(error);
      }
    };
    const cleanupPeerListeners = (): void => {
      peer.off('open', onOpen);
      peer.off('connection', onConnection);
      peer.off('disconnected', onDisconnected);
      peer.off('close', onClosed);
      peer.off('error', onError);
    };

    const openTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanupPeerListeners();
      peer.destroy();
      reject(new Error(`PeerJS endpoint did not open within ${PEER_OPEN_TIMEOUT_MS}ms`));
    }, PEER_OPEN_TIMEOUT_MS);

    endpoint = {
      get id(): string { return peer.id; },
      connect(remotePeerId: string): Promise<PeerLink> {
        if (closed || peer.destroyed || peer.disconnected) {
          return Promise.reject(new Error('PeerJS endpoint is not connected to the signalling server'));
        }
        if (!remotePeerId) return Promise.reject(new Error('Remote peer ID is required'));

        let connection: DataConnection;
        try {
          connection = peer.connect(remotePeerId, { serialization: 'json' });
        } catch (error) {
          return Promise.reject(error);
        }

        return new Promise((connectResolve, connectReject) => {
          let done = false;
          const finishFailure = (error: unknown): void => {
            if (done) return;
            done = true;
            clearTimeout(connectTimer);
            connection.off('open', handleOpen);
            connection.off('close', handleConnectionClose);
            connection.off('error', handleConnectionError);
            peer.off('error', handlePeerError);
            connection.close();
            connectReject(error);
          };
          const handleOpen = (): void => {
            if (done) return;
            done = true;
            clearTimeout(connectTimer);
            connection.off('open', handleOpen);
            connection.off('close', handleConnectionClose);
            connection.off('error', handleConnectionError);
            peer.off('error', handlePeerError);
            connectResolve(makeLink(connection));
          };
          const handleConnectionError = (error: Error): void => finishFailure(error);
          const handleConnectionClose = (): void => finishFailure(new Error(`PeerJS link to ${remotePeerId} closed before opening`));
          const handlePeerError = (error: Error): void => finishFailure(error);
          const connectTimer = setTimeout(() => {
            finishFailure(new Error(`PeerJS link to ${remotePeerId} did not open within ${LINK_OPEN_TIMEOUT_MS}ms`));
          }, LINK_OPEN_TIMEOUT_MS);

          connection.on('open', handleOpen);
          connection.on('close', handleConnectionClose);
          connection.on('error', handleConnectionError);
          peer.on('error', handlePeerError);
          if (connection.open) handleOpen();
        });
      },
      onConnection(handler): () => void {
        if (closed) return () => undefined;
        connectionHandlers.add(handler);
        return () => connectionHandlers.delete(handler);
      },
      onState(handler): () => void {
        if (closed) {
          handler('closed');
          return () => undefined;
        }
        stateHandlers.add(handler);
        if (state) handler(state);
        return () => stateHandlers.delete(handler);
      },
      close(): void {
        if (closed) return;
        closed = true;
        clearTimeout(openTimer);
        emitState('closed');
        cleanupPeerListeners();
        connectionHandlers.clear();
        stateHandlers.clear();
        for (const link of incomingLinks) link.close();
        incomingLinks.clear();
        peer.destroy();
      },
    };

    peer.on('open', onOpen);
    peer.on('connection', onConnection);
    peer.on('disconnected', onDisconnected);
    peer.on('close', onClosed);
    peer.on('error', onError);
  });
}

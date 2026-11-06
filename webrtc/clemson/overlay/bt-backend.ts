/** Clemson uses one WebRTC connection, without the optional BLE server. */
type Topic = 'status' | 'adapters' | 'remote_state';
type Handler = (data: any) => void;

const disabledBackend = {
  subscribe(_topic: Topic, _handler: Handler): () => void {
    return () => {};
  },
};

export function btBackend(): typeof disabledBackend {
  return disabledBackend;
}

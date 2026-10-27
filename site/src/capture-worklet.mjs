class LifeCapture extends AudioWorkletProcessor {
  buffer = new Float32Array(2048);
  position = 0;
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) for (const value of channel) {
      this.buffer[this.position++] = value;
      if (this.position === this.buffer.length) {
        this.port.postMessage(this.buffer.buffer, [this.buffer.buffer]);
        this.buffer = new Float32Array(2048); this.position = 0;
      }
    }
    return true;
  }
}
registerProcessor('life-capture', LifeCapture);

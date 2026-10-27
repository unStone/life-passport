#include "ggwave/ggwave.h"
#include <cstdio>
#include <initializer_list>

int main() {
    GGWave::setLogFile(nullptr);
    std::puts("protocol,payload_bytes,sample_rate,fft_samples,rx_heap_bytes,object_bytes");
    for (int protocol : {GGWAVE_PROTOCOL_DT_FASTEST, GGWAVE_PROTOCOL_MT_FASTEST}) {
        for (int payload : {0, 8, 16, 24, 32, 64}) {
            auto parameters = GGWave::getDefaultParameters();
            parameters.payloadLength = payload;
            parameters.sampleRateInp = parameters.sampleRateOut = parameters.sampleRate = 24000;
            parameters.samplesPerFrame = 512;
            parameters.sampleFormatInp = GGWAVE_SAMPLE_FORMAT_I16;
            parameters.operatingMode = GGWAVE_OPERATING_MODE_RX | GGWAVE_OPERATING_MODE_USE_DSS;
            GGWave::Protocols::rx().only(static_cast<ggwave_ProtocolId>(protocol));
            GGWave receiver;
            if (!receiver.prepare(parameters, false)) return 1;
            std::printf("%s,%d,24000,512,%d,%zu\n", protocol == GGWAVE_PROTOCOL_DT_FASTEST ? "DT_FASTEST" : "MT_FASTEST",
                        payload, receiver.heapSize(), sizeof(receiver));
        }
    }
    return 0;
}

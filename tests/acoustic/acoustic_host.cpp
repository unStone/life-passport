#include "life_audio_protocol.h"
#include "ggwave/ggwave.h"
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <string>

static bool report(const uint8_t *data, size_t size) {
    life_audio_packet_t packet;
    auto result = life_audio_packet_decode(data, size, &packet);
    if (result < 0) return false;
    char key[11] = "";
    if (result == LIFE_AUDIO_KEY) life_key_format(packet.key, key);
    unsigned population = 0;
    for (uint8_t byte : packet.seed.bits)
        for (unsigned bit = 0; bit < 8; ++bit) population += (byte >> bit) & 1;
    std::printf("{\"kind\":%d,\"seq\":%u,\"key\":\"%s\",\"crc\":%u,\"population\":%u,\"payload\":\"",
                result, packet.seq, key, packet.seed.crc, population);
    for (uint8_t byte : packet.payload) std::printf("%02X", byte);
    std::puts("\"}");
    return true;
}

int main(int argc, char **argv) {
    if (argc == 3 && std::string(argv[1]) == "--packet") {
        std::string text(argv[2]);
        if (text.size() != 32) return 2;
        uint8_t bytes[16];
        for (unsigned i = 0; i < 16; ++i) {
            std::string part = text.substr(2 * i, 2);
            char *end;
            bytes[i] = std::strtoul(part.c_str(), &end, 16);
            if (*end) return 2;
        }
        return report(bytes, 16) ? 0 : 3;
    }
    if (argc != 4 || std::string(argv[1]) != "--pcm") return 2;
    int rate = std::atoi(argv[3]);
    if (rate != 24000 && rate != 44100 && rate != 48000) return 2;
    std::ifstream input(argv[2], std::ios::binary);
    if (!input) return 2;
    GGWave::setLogFile(nullptr);
    GGWave::Protocols::rx().disableAll();
    GGWave::Protocols::rx().toggle(GGWAVE_PROTOCOL_AUDIBLE_FASTEST, true);
    GGWave::Protocols::rx().toggle(GGWAVE_PROTOCOL_DT_FASTEST, true);
    auto parameters = GGWave::getDefaultParameters();
    parameters.payloadLength = 16;
    parameters.sampleRateInp = rate;
    parameters.sampleRateOut = parameters.sampleRate = 24000;
    parameters.samplesPerFrame = 512;
    parameters.sampleFormatInp = GGWAVE_SAMPLE_FORMAT_I16;
    parameters.operatingMode = GGWAVE_OPERATING_MODE_RX | GGWAVE_OPERATING_MODE_USE_DSS;
    GGWave receiver;
    if (!receiver.prepare(parameters)) return 4;
    char buffer[1024];
    while (input.read(buffer, sizeof(buffer)) || input.gcount()) {
        if (input.gcount() % 2 || !receiver.decode(buffer, input.gcount())) return 4;
        GGWave::TxRxData data;
        if (receiver.rxTakeData(data) > 0 && report(data.data(), data.size())) return 0;
    }
    std::fputs("No valid LP1 frame decoded\n", stderr);
    return 3;
}

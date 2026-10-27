#include "life_audio_protocol.h"
#include "life_crc.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

int main(void) {
    assert(life_crc32("123456789", 9) == 0xCBF43926u);
    uint64_t value;
    char key[11];
    assert(life_key_parse("ZZZZZZZZZZ", &value) && value == LIFE_KEY_LIMIT - 1);
    assert(life_key_format(value, key) && !strcmp(key, "ZZZZZZZZZZ"));
    assert(!life_key_parse("x", &value));
    assert(!life_key_parse("000000000!", &value));
    assert(!life_key_format(LIFE_KEY_LIMIT, key));
    uint8_t frame[16] = { 'L', 'P', 1, 13, 1 };
    uint32_t crc = life_crc32(frame, 12);
    memcpy(frame + 12, &crc, 4);
    life_audio_packet_t packet;
    assert(life_audio_packet_decode(frame, 16, &packet) == LIFE_AUDIO_KEY);
    assert(packet.key == 0 && packet.seq == 1 && packet.seed.interval_ms == 200 && packet.seed.wrap);
    life_t game;
    assert(life_key_generate(0, true, &game));
    assert(game.population > 200 && game.population < 450);
    assert(packet.seed.crc == life_crc32(packet.seed.bits, LIFE_BITS_SIZE));
    for (unsigned bit = 0; bit < 128; ++bit) {
        uint8_t damaged[16];
        memcpy(damaged, frame, 16);
        damaged[bit / 8] ^= 1u << (bit % 8);
        assert(life_audio_packet_decode(damaged, 16, &packet) < 0);
    }
    assert(life_audio_packet_decode(frame, 15, &packet) == LIFE_AUDIO_FORMAT);
    frame[11] = 128;
    crc = life_crc32(frame, 12); memcpy(frame + 12, &crc, 4);
    assert(life_audio_packet_decode(frame, 16, &packet) == LIFE_AUDIO_FORMAT);
    frame[11] = 0;
    frame[3] = 0;
    crc = life_crc32(frame, 12);
    memcpy(frame + 12, &crc, 4);
    assert(life_audio_packet_decode(frame, 16, &packet) == LIFE_AUDIO_DIAG);
    frame[2] = 2;
    crc = life_crc32(frame, 12);
    memcpy(frame + 12, &crc, 4);
    assert(life_audio_packet_decode(frame, 16, &packet) == LIFE_AUDIO_FORMAT);
    puts("Acoustic packet CRC, key bounds and single-bit corruption: PASS");
}

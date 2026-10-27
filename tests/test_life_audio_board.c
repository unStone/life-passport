#include "life_audio_board.h"
#include "life_crc.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static life_audio_packet_t frame(unsigned type, unsigned index, unsigned id, const uint8_t *data, size_t count) {
    uint8_t raw[16] = {'L', 'P', 1, (uint8_t)(type | 4 | 8), (uint8_t)index, (uint8_t)id, (uint8_t)(id >> 8)};
    assert(count <= 5); memcpy(raw + 7, data, count);
    uint32_t crc = life_crc32(raw, 12); memcpy(raw + 12, &crc, 4);
    life_audio_packet_t packet;
    assert(life_audio_packet_decode(raw, 16, &packet) == (int)type);
    return packet;
}

int main(void) {
    uint8_t bits[144], decoded[144]; for (unsigned i = 0; i < sizeof(bits); i++) bits[i] = i;
    assert(life_board_decode(0, bits, 144, decoded) && !memcmp(bits, decoded, 144));
    assert(!life_board_decode(0, bits, 143, decoded));
    const uint8_t empty[] = {0};
    assert(life_board_decode(2, empty, 1, decoded)); for (unsigned i = 0; i < 144; i++) assert(!decoded[i]);
    assert(life_board_decode(3, empty, 1, decoded)); for (unsigned i = 0; i < 144; i++) assert(decoded[i] == 255);
    const uint8_t invalid[] = {1, 255, 255}; assert(!life_board_decode(2, invalid, sizeof(invalid), decoded));
    const uint8_t bad_crop[] = {255, 255, 255, 1}; assert(!life_board_decode(1, bad_crop, 4, decoded));
    uint8_t meta[5] = {144}; uint32_t crc = life_crc32(bits, 144); memcpy(meta + 1, &crc, 4);
    life_audio_packet_t header = frame(3, 255, 42, meta, 5);
    life_board_rx_t rx = {0}; life_remote_seed_t seed = { .id = 99 };
    life_audio_packet_t chunk = frame(2, 0, 42, bits, 5);
    assert(life_board_feed(&rx, &chunk, 0, &seed) == LIFE_BOARD_WAIT && seed.id == 99);
    assert(life_board_feed(&rx, &header, 1, &seed) == LIFE_BOARD_WAIT);
    for (unsigned i = 1; i < 29; i++) {
        chunk = frame(2, i, 42, bits + i * 5, i == 28 ? 4 : 5);
        assert(life_board_feed(&rx, &chunk, 2 + i, &seed) == LIFE_BOARD_WAIT && seed.id == 99);
    }
    chunk = frame(2, 0, 42, bits, 5);
    assert(life_board_feed(&rx, &chunk, 40, &seed) == LIFE_BOARD_COMPLETE);
    assert(!memcmp(seed.bits, bits, 144) && seed.crc == crc && seed.wrap && seed.interval_ms == 200);
    assert(life_board_feed(&rx, &chunk, 41, &seed) == LIFE_BOARD_DUPLICATE);
    assert(life_board_feed(&rx, &header, 42, &seed) == LIFE_BOARD_DUPLICATE);
    life_board_reset(&rx); life_board_feed(&rx, &header, 50, &seed);
    assert(life_board_expire(&rx, 15051)); assert(!rx.active);
    life_board_feed(&rx, &header, 16000, &seed); header.payload[3] ^= 1;
    assert(life_board_feed(&rx, &header, 16001, &seed) == LIFE_BOARD_REJECT && !rx.active);
    puts("Acoustic board assembly: loss, duplication, conflict, bounds and timeout PASS");
}

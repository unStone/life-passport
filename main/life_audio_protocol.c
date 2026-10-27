#include "life_audio_protocol.h"
#include "life_crc.h"
#include <errno.h>
#include <stdlib.h>
#include <string.h>

bool life_key_parse(const char *text, uint64_t *value) {
    if (!text || !value || strlen(text) != 10) return false;
    for (unsigned i = 0; i < 10; ++i)
        if (!((text[i] >= '0' && text[i] <= '9') || (text[i] >= 'A' && text[i] <= 'Z') ||
              (text[i] >= 'a' && text[i] <= 'z'))) return false;
    char *end;
    errno = 0;
    unsigned long long parsed = strtoull(text, &end, 36);
    if (errno || *end || parsed >= LIFE_KEY_LIMIT) return false;
    *value = parsed;
    return true;
}

bool life_key_format(uint64_t value, char text[11]) {
    if (!text || value >= LIFE_KEY_LIMIT) return false;
    const char digits[] = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    text[10] = 0;
    for (int i = 9; i >= 0; --i) { text[i] = digits[value % 36]; value /= 36; }
    return true;
}

bool life_key_generate(uint64_t value, bool wrap, life_t *game) {
    if (!game || value >= LIFE_KEY_LIMIT) return false;
    life_clear(game, wrap);
    uint64_t state = value ? value : UINT64_C(0x9E3779B97F4A7C15);
    for (int y = 0; y < LIFE_ROWS; ++y) {
        for (int x = 0; x < LIFE_COLS; ++x) {
            state ^= state >> 12;
            state ^= state << 25;
            state ^= state >> 27;
            uint64_t random = state * UINT64_C(2685821657736338717);
            life_set(game, x, y, random % 100 < 28);
        }
    }
    return true;
}

life_audio_result_t life_audio_packet_decode(const uint8_t *data, size_t size, life_audio_packet_t *packet) {
    if (!data || !packet || size != LIFE_AUDIO_FRAME_SIZE) return LIFE_AUDIO_FORMAT;
    uint32_t received = (uint32_t)data[12] | ((uint32_t)data[13] << 8) |
                        ((uint32_t)data[14] << 16) | ((uint32_t)data[15] << 24);
    uint32_t checksum = life_crc32(data, 12);
    if (checksum != received) return LIFE_AUDIO_CHECKSUM;
    unsigned type = data[3] & 3;
    if (data[0] != 'L' || data[1] != 'P' || data[2] != 1 || (data[3] & (type < 2 ? 0xE0 : 0x80)) ||
        (!type && data[3])) return LIFE_AUDIO_FORMAT;
    life_audio_packet_t parsed = { .seq = data[4], .flags = data[3], .checksum = checksum };
    memcpy(parsed.payload, data + 5, 7);
    if (type == 1) {
        for (unsigned i = 0; i < 7; ++i) parsed.key |= (uint64_t)data[5 + i] << (8 * i);
        life_t game;
        if (!life_key_generate(parsed.key, (data[3] & 4) != 0, &game)) return LIFE_AUDIO_FORMAT;
        parsed.seed.id = checksum ? checksum : 1;
        const unsigned intervals[] = {125, 200, 500, 1000};
        parsed.seed.interval_ms = intervals[(data[3] >> 3) & 3];
        parsed.seed.wrap = game.wrap;
        for (unsigned bit = 0; bit < LIFE_COLS * LIFE_ROWS; ++bit)
            if (game.cells[bit / LIFE_COLS][bit % LIFE_COLS]) parsed.seed.bits[bit / 8] |= 1u << (bit % 8);
        parsed.seed.crc = life_crc32(parsed.seed.bits, LIFE_BITS_SIZE);
    }
    *packet = parsed;
    return (life_audio_result_t)type;
}

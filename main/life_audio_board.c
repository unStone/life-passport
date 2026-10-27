#include "life_audio_board.h"
#include "life_crc.h"
#include <string.h>

static uint32_t read32(const uint8_t *data) {
    return (uint32_t)data[0] | ((uint32_t)data[1] << 8) | ((uint32_t)data[2] << 16) | ((uint32_t)data[3] << 24);
}
static bool padding(const uint8_t *data, size_t size, unsigned offset, unsigned count) {
    return size == offset + (count + 7) / 8 && (!(count % 8) || !(data[size - 1] >> (count % 8)));
}
static void set_bit(uint8_t *bits, unsigned index, bool alive) {
    if (alive) bits[index / 8] |= 1u << (index % 8);
    else bits[index / 8] &= ~(1u << (index % 8));
}
bool life_board_decode(unsigned codec, const uint8_t *data, size_t size, uint8_t bits[LIFE_BITS_SIZE]) {
    if (!data || !bits || !size || size > LIFE_BITS_SIZE) return false;
    uint8_t output[LIFE_BITS_SIZE] = {0};
    if (codec == 0) {
        if (size != LIFE_BITS_SIZE) return false;
        memcpy(output, data, size);
    } else if (codec == 1) {
        if (size < 4) return false;
        uint32_t header = (uint32_t)data[0] | ((uint32_t)data[1] << 8) | ((uint32_t)data[2] << 16);
        unsigned x = header & 63, y = (header >> 6) & 31;
        unsigned width = ((header >> 11) & 63) + 1, height = ((header >> 17) & 31) + 1;
        if (header >> 22 || x + width > LIFE_COLS || y + height > LIFE_ROWS || !padding(data, size, 3, width * height)) return false;
        for (unsigned i = 0; i < width * height; i++)
            set_bit(output, (y + i / width) * LIFE_COLS + x + i % width, (data[3 + i / 8] >> (i % 8)) & 1);
    } else if (codec == 2 || codec == 3) {
        unsigned count = data[0];
        if (count > 103 || !padding(data, size, 1, count * 11)) return false;
        memset(output, codec == 3 ? 255 : 0, sizeof(output));
        int previous = -1;
        for (unsigned i = 0; i < count; i++) {
            unsigned index = 0;
            for (unsigned b = 0; b < 11; b++) index |= ((data[1 + (i * 11 + b) / 8] >> ((i * 11 + b) % 8)) & 1u) << b;
            if (index >= LIFE_COLS * LIFE_ROWS || (int)index <= previous) return false;
            set_bit(output, index, codec == 2); previous = (int)index;
        }
    } else return false;
    memcpy(bits, output, sizeof(output));
    return true;
}
void life_board_reset(life_board_rx_t *rx) { memset(rx, 0, sizeof(*rx)); }
bool life_board_expire(life_board_rx_t *rx, uint64_t now_ms) {
    if (rx->active && !rx->complete && (now_ms < rx->last_ms || now_ms - rx->last_ms > 15000 || now_ms - rx->start_ms > 120000)) {
        life_board_reset(rx); return true;
    }
    return false;
}
life_board_result_t life_board_feed(life_board_rx_t *rx, const life_audio_packet_t *packet, uint64_t now_ms, life_remote_seed_t *seed) {
    if (!rx || !packet || !seed || (packet->flags & 3) < 2) return LIFE_BOARD_REJECT;
    life_board_expire(rx, now_ms);
    unsigned type = packet->flags & 3, index = packet->seq, settings = packet->flags & 124;
    const uint8_t *payload = packet->payload;
    uint16_t id = payload[0] | ((uint16_t)payload[1] << 8);
    if (type == 3) {
        unsigned length = payload[2]; uint32_t crc = read32(payload + 3);
        if (index != 255 || !length || length > LIFE_BITS_SIZE) return LIFE_BOARD_REJECT;
        if (rx->active && rx->transfer_id == id) {
            if (rx->settings != settings || rx->length != length || rx->crc != crc) { life_board_reset(rx); return LIFE_BOARD_REJECT; }
            rx->last_ms = now_ms; return LIFE_BOARD_DUPLICATE;
        }
        life_board_reset(rx);
        rx->active = true; rx->transfer_id = id; rx->settings = settings; rx->length = length;
        rx->crc = crc; rx->total = (length + 4) / 5; rx->seed_id = packet->checksum ? packet->checksum : 1;
        rx->start_ms = rx->last_ms = now_ms;
    } else {
        if (!rx->active || rx->transfer_id != id) return LIFE_BOARD_WAIT;
        if (settings != rx->settings || index >= rx->total) return LIFE_BOARD_REJECT;
        unsigned count = rx->length - index * 5; if (count > 5) count = 5;
        for (unsigned i = count + 2; i < 7; i++) if (payload[i]) return LIFE_BOARD_REJECT;
        if (rx->mask & (1u << index)) {
            if (memcmp(rx->data + index * 5, payload + 2, count)) { life_board_reset(rx); return LIFE_BOARD_REJECT; }
            rx->last_ms = now_ms; return LIFE_BOARD_DUPLICATE;
        }
        memcpy(rx->data + index * 5, payload + 2, count);
        rx->mask |= 1u << index; rx->received++; rx->last_ms = now_ms;
        if (rx->received == rx->total) {
            life_remote_seed_t complete = {0};
            if (!life_board_decode(settings >> 5, rx->data, rx->length, complete.bits) || life_crc32(complete.bits, LIFE_BITS_SIZE) != rx->crc) {
                life_board_reset(rx); return LIFE_BOARD_REJECT;
            }
            const unsigned intervals[] = {125, 200, 500, 1000};
            complete.id = rx->seed_id; complete.crc = rx->crc;
            complete.wrap = (settings & 4) != 0; complete.interval_ms = intervals[(settings >> 3) & 3];
            *seed = complete; rx->complete = true; return LIFE_BOARD_COMPLETE;
        }
    }
    return LIFE_BOARD_WAIT;
}

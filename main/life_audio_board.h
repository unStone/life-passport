#pragma once
#include "life_audio_protocol.h"

typedef enum { LIFE_BOARD_REJECT = -1, LIFE_BOARD_WAIT, LIFE_BOARD_COMPLETE, LIFE_BOARD_DUPLICATE } life_board_result_t;
typedef struct {
    bool active, complete;
    uint16_t transfer_id;
    uint8_t settings, length, total, received;
    uint32_t crc, seed_id, mask;
    uint64_t start_ms, last_ms;
    uint8_t data[LIFE_BITS_SIZE];
} life_board_rx_t;

#ifdef __cplusplus
extern "C" {
#endif
bool life_board_decode(unsigned codec, const uint8_t *data, size_t size, uint8_t bits[LIFE_BITS_SIZE]);
void life_board_reset(life_board_rx_t *rx);
bool life_board_expire(life_board_rx_t *rx, uint64_t now_ms);
life_board_result_t life_board_feed(life_board_rx_t *rx, const life_audio_packet_t *packet, uint64_t now_ms, life_remote_seed_t *seed);
#ifdef __cplusplus
}
#endif

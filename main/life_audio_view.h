#pragma once
#include <stdint.h>
#include <stdbool.h>

typedef enum { LIFE_CAPTURE_OFF, LIFE_CAPTURE_STARTING, LIFE_CAPTURE_LISTENING, LIFE_CAPTURE_FAILED } life_capture_state_t;
typedef struct {
    life_capture_state_t state;
    float dbfs;
    uint32_t frequency_hz, clipped_percent, valid, rejected, duplicates;
    uint32_t max_decode_us, decoder_heap, error;
    uint8_t seq, stage;
    uint8_t shards_received, shards_total;
    bool board_transfer;
    char payload[15], key[11];
} life_audio_view_t;

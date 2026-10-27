#pragma once
#include "life_wire.h"
#include <stddef.h>

#define LIFE_AUDIO_FRAME_SIZE 16
#define LIFE_KEY_LIMIT UINT64_C(3656158440062976)
typedef enum { LIFE_AUDIO_FORMAT = -2, LIFE_AUDIO_CHECKSUM = -1, LIFE_AUDIO_DIAG = 0, LIFE_AUDIO_KEY = 1 } life_audio_result_t;
typedef struct {
    uint8_t seq, payload[7];
    uint64_t key;
    life_remote_seed_t seed;
} life_audio_packet_t;

#ifdef __cplusplus
extern "C" {
#endif
bool life_key_parse(const char *text, uint64_t *value);
bool life_key_format(uint64_t value, char text[11]);
bool life_key_generate(uint64_t value, bool wrap, life_t *game);
life_audio_result_t life_audio_packet_decode(const uint8_t *data, size_t size, life_audio_packet_t *packet);
#ifdef __cplusplus
}
#endif

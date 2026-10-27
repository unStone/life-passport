#pragma once
#include "life.h"
#include <stddef.h>

#define LIFE_WIRE_CAPACITY 1024
typedef struct life_remote_seed {
    uint8_t bits[LIFE_BITS_SIZE];
    uint32_t id, crc;
    uint16_t interval_ms;
    bool wrap;
} life_remote_seed_t;
typedef enum {
    LIFE_WIRE_MORE = 0, LIFE_WIRE_SEED = 1,
    LIFE_WIRE_INVALID = -1, LIFE_WIRE_CHECKSUM = -2,
    LIFE_WIRE_OVERSIZE = -3, LIFE_WIRE_TIMEOUT = -4
} life_wire_result_t;
typedef struct {
    char line[LIFE_WIRE_CAPACITY];
    size_t length;
    uint64_t last_ms;
    life_wire_result_t discarded;
} life_wire_t;

uint32_t life_wire_crc(const uint8_t bits[LIFE_BITS_SIZE]);
life_wire_result_t life_wire_parse(const char *json, life_remote_seed_t *seed);
life_wire_result_t life_wire_feed(life_wire_t *wire, char byte, uint64_t now_ms, life_remote_seed_t *seed);
bool life_wire_expire(life_wire_t *wire, uint64_t now_ms);
const char *life_wire_error(life_wire_result_t result);

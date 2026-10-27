#include "life_wire.h"
#include "life_crc.h"
#include "cJSON.h"
#include <assert.h>
#include <math.h>
#include <string.h>

uint32_t life_wire_crc(const uint8_t bits[LIFE_BITS_SIZE]) {
    assert(bits);
    return life_crc32(bits, LIFE_BITS_SIZE);
}

static bool integer(const cJSON *value, double minimum, double maximum, double *out) {
    if (!cJSON_IsNumber(value)) return false;
    double n = value->valuedouble;
    if (!isfinite(n) || n < minimum || n > maximum || floor(n) != n) return false;
    *out = n;
    return true;
}

life_wire_result_t life_wire_parse(const char *json, life_remote_seed_t *seed) {
    assert(json && seed);
    if (strlen(json) >= LIFE_WIRE_CAPACITY) return LIFE_WIRE_OVERSIZE;
    cJSON *root = cJSON_ParseWithLengthOpts(json, strlen(json) + 1, NULL, true);
    if (!root) return LIFE_WIRE_INVALID;
    life_wire_result_t result = LIFE_WIRE_INVALID;
    const char *keys[] = { "v", "id", "op", "w", "h", "rows", "crc", "interval_ms", "wrap" };
    const cJSON *fields[9] = {0};
    if (!cJSON_IsObject(root)) goto done;
    for (const cJSON *field = root->child; field; field = field->next) {
        unsigned i;
        for (i = 0; i < 9; ++i) if (!strcmp(field->string, keys[i])) break;
        if (i == 9 || fields[i]) goto done;
        fields[i] = field;
    }
    double v, id, w, h, crc, interval;
    if (!integer(fields[0], 1, 1, &v) || !integer(fields[1], 1, UINT32_MAX, &id) ||
        !cJSON_IsString(fields[2]) || strcmp(fields[2]->valuestring, "seed") ||
        !integer(fields[3], LIFE_COLS, LIFE_COLS, &w) ||
        !integer(fields[4], LIFE_ROWS, LIFE_ROWS, &h) ||
        !cJSON_IsArray(fields[5]) || cJSON_GetArraySize(fields[5]) != LIFE_ROWS ||
        !integer(fields[6], 0, UINT32_MAX, &crc) ||
        !integer(fields[7], 125, 1000, &interval) || !cJSON_IsBool(fields[8])) goto done;
    if (interval != 1000 && interval != 500 && interval != 200 && interval != 125) goto done;
    life_remote_seed_t parsed = { .id = (uint32_t)id, .crc = (uint32_t)crc,
                                  .interval_ms = (uint16_t)interval, .wrap = cJSON_IsTrue(fields[8]) };
    for (int y = 0; y < LIFE_ROWS; ++y) {
        double number;
        if (!integer(cJSON_GetArrayItem(fields[5], y), 0,
                     (double)((1ULL << LIFE_COLS) - 1), &number)) goto done;
        uint64_t row = (uint64_t)number;
        for (int x = 0; x < LIFE_COLS; ++x) {
            unsigned bit = y * LIFE_COLS + x;
            if (row & (1ULL << x)) parsed.bits[bit / 8] |= 1u << (bit % 8);
        }
    }
    if (life_wire_crc(parsed.bits) != parsed.crc) { result = LIFE_WIRE_CHECKSUM; goto done; }
    *seed = parsed;
    result = LIFE_WIRE_SEED;
done:
    cJSON_Delete(root);
    return result;
}

bool life_wire_expire(life_wire_t *wire, uint64_t now_ms) {
    assert(wire);
    if (wire->length && now_ms - wire->last_ms > 5000) {
        wire->length = 0;
        wire->discarded = LIFE_WIRE_TIMEOUT;
        return true;
    }
    return false;
}

life_wire_result_t life_wire_feed(life_wire_t *wire, char byte, uint64_t now_ms, life_remote_seed_t *seed) {
    assert(wire && seed);
    life_wire_expire(wire, now_ms);
    wire->last_ms = now_ms;
    if (byte == '\n') {
        life_wire_result_t result = wire->discarded;
        if (!result) {
            wire->line[wire->length] = 0;
            result = life_wire_parse(wire->line, seed);
        }
        wire->length = 0;
        wire->discarded = LIFE_WIRE_MORE;
        return result;
    }
    if (wire->discarded) return LIFE_WIRE_MORE;
    if (!byte) { wire->length = 0; wire->discarded = LIFE_WIRE_INVALID; }
    else if (wire->length == LIFE_WIRE_CAPACITY - 1) {
        wire->length = 0;
        wire->discarded = LIFE_WIRE_OVERSIZE;
    } else wire->line[wire->length++] = byte;
    return LIFE_WIRE_MORE;
}

const char *life_wire_error(life_wire_result_t result) {
    switch (result) {
    case LIFE_WIRE_CHECKSUM: return "checksum";
    case LIFE_WIRE_OVERSIZE: return "oversize";
    case LIFE_WIRE_TIMEOUT: return "timeout";
    default: return "invalid";
    }
}

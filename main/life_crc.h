#pragma once
#include <stddef.h>
#include <stdint.h>
#ifdef ESP_PLATFORM
#include "esp_rom_crc.h"
#else
#include <zlib.h>
#endif

static inline uint32_t life_crc32(const void *data, size_t size) {
#ifdef ESP_PLATFORM
    return esp_rom_crc32_le(0, (const uint8_t *)data, (uint32_t)size);
#else
    return (uint32_t)crc32(0, (const uint8_t *)data, (uInt)size);
#endif
}

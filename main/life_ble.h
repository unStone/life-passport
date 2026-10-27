#pragma once
#include "esp_err.h"
#include "life_wire.h"

esp_err_t life_ble_init(void);
esp_err_t life_ble_stop(void);
bool life_ble_connected(void);
bool life_ble_take(life_remote_seed_t *seed);
void life_ble_reply(uint32_t id, const char *state, const char *error, uint16_t population, uint32_t crc);
void life_ble_tick(uint64_t now_ms);

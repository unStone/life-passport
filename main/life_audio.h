#pragma once
#include "esp_err.h"
#include "life_audio_view.h"
#include "life_wire.h"
#include <stdbool.h>
#ifdef __cplusplus
extern "C" {
#endif
esp_err_t life_audio_init(void);
esp_err_t life_audio_start(void);
esp_err_t life_audio_stop(void);
bool life_audio_started(void);
void life_audio_snapshot(life_audio_view_t *view);
void life_audio_clear(void);
bool life_audio_take(life_remote_seed_t *seed);
#ifdef __cplusplus
}
#endif

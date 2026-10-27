#pragma once
#include "life.h"
#include <assert.h>

typedef enum { LIFE_KEY_PRESS, LIFE_KEY_RELEASE, LIFE_KEY_LONG } life_key_event_t;
typedef struct { bool down[3], held[3]; } life_keys_t;

/* BSP CLICK/DOUBLE are not fed here: rapid taps already have releases. */
static inline int life_keys_feed(life_keys_t *keys, unsigned key, life_key_event_t event) {
    assert(keys && key < 3);
    if (event == LIFE_KEY_PRESS) {
        keys->down[key] = true;
        keys->held[key] = false;
        return -1;
    }
    if (event == LIFE_KEY_LONG) {
        if (!keys->down[key] || keys->held[key]) return -1;
        keys->held[key] = true;
        return (int)key + LIFE_UP_LONG;
    }
    bool short_press = keys->down[key] && !keys->held[key];
    keys->down[key] = keys->held[key] = false;
    return short_press ? (int)key : -1;
}

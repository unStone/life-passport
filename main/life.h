#pragma once
#include <stdbool.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

#define LIFE_COLS 36
#define LIFE_ROWS 32
#define LIFE_BITS_SIZE ((LIFE_COLS * LIFE_ROWS + 7) / 8)
#define LIFE_TOOL_COUNT 5
#define LIFE_INFO_COUNT 2

typedef enum {
    LIFE_GLIDER, LIFE_PULSAR, LIFE_BLINKER, LIFE_SPACESHIP,
    LIFE_RANDOM, LIFE_EMPTY, LIFE_R_PENTOMINO, LIFE_SEED_COUNT
} life_seed_t;
typedef struct {
    uint8_t cells[LIFE_ROWS][LIFE_COLS];
    uint64_t generation;
    uint16_t population, births, deaths;
    bool wrap, stable;
} life_t;

void life_clear(life_t *game, bool wrap);
bool life_set(life_t *game, int x, int y, bool alive);
void life_seed(life_t *game, life_seed_t seed, uint32_t random_seed);
void life_step(life_t *game);

typedef enum { LIFE_WATCH, LIFE_TOOLS, LIFE_INFO, LIFE_RULES, LIFE_ABOUT, LIFE_LINK, LIFE_REMOTE } life_page_t;
typedef enum { LIFE_REMOTE_NONE, LIFE_REMOTE_PREVIEW, LIFE_REMOTE_APPLIED, LIFE_REMOTE_CANCELLED } life_remote_status_t;
typedef enum { LIFE_REMOTE_NEW, LIFE_REMOTE_REPEAT, LIFE_REMOTE_BUSY, LIFE_REMOTE_CONFLICT } life_remote_result_t;
typedef enum {
    LIFE_UP, LIFE_DOWN, LIFE_OK, LIFE_UP_LONG, LIFE_DOWN_LONG, LIFE_OK_LONG
} life_input_t;
typedef enum { LIFE_BRIGHT, LIFE_DIM, LIFE_BLANK, LIFE_SLEEP } life_idle_t;
typedef struct {
    life_t game;
    life_t saved_game, seed_template;
    life_page_t page;
    uint64_t last_step_ms, last_input_ms;
    uint8_t speed, selection;
    bool running;
    life_page_t saved_page;
    life_remote_status_t remote_status;
    uint8_t saved_speed;
    bool saved_running, phone_connected, audio_requested;
    uint32_t remote_id, remote_crc;
    uint16_t remote_interval;
    bool remote_wrap;
    uint8_t remote_bits[LIFE_BITS_SIZE];
} life_app_t;

struct life_remote_seed;
life_remote_result_t life_app_receive(life_app_t *app, const struct life_remote_seed *seed, uint64_t now_ms);

void life_app_init(life_app_t *app, uint32_t seed, uint64_t now_ms);
/* Returns true when a blank-screen wake consumed the action. */
bool life_app_input(life_app_t *app, life_input_t input, uint64_t now_ms);
bool life_app_tick(life_app_t *app, uint64_t now_ms);
life_idle_t life_app_idle(const life_app_t *app, uint64_t now_ms);
unsigned life_app_fps(const life_app_t *app);
#ifdef __cplusplus
}
#endif

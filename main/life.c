#include "life.h"
#include "life_wire.h"
#include <assert.h>
#include <string.h>

void life_clear(life_t *game, bool wrap) {
    assert(game);
    memset(game, 0, sizeof(*game));
    game->wrap = wrap;
}

bool life_set(life_t *game, int x, int y, bool alive) {
    assert(game);
    if (x < 0 || y < 0 || x >= LIFE_COLS || y >= LIFE_ROWS) return false;
    if (!!game->cells[y][x] != alive) {
        if (alive) ++game->population;
        else --game->population;
    }
    game->cells[y][x] = alive ? 1 : 0;
    game->stable = false;
    return true;
}

static uint32_t random_next(uint32_t *seed) {
    *seed ^= *seed << 13;
    *seed ^= *seed >> 17;
    *seed ^= *seed << 5;
    return *seed;
}

void life_seed(life_t *game, life_seed_t seed, uint32_t random_seed) {
    assert(game && seed >= 0 && seed < LIFE_SEED_COUNT);
    bool wrap = game->wrap;
    life_clear(game, wrap);
    const char *pattern = "";
    int width = 0, height = 0;
    switch (seed) {
    case LIFE_R_PENTOMINO: pattern = ".OO" "OO." ".O."; width = height = 3; break;
    case LIFE_GLIDER: pattern = ".O." "..O" "OOO"; width = height = 3; break;
    case LIFE_BLINKER: pattern = "OOO"; width = 3; height = 1; break;
    case LIFE_SPACESHIP:
        pattern = ".O..O" "O...." "O...O" "OOOO."; width = 5; height = 4; break;
    case LIFE_PULSAR:
        pattern = "..OOO...OOO.." "............." "O....O.O....O"
                  "O....O.O....O" "O....O.O....O" "..OOO...OOO.."
                  "............." "..OOO...OOO.." "O....O.O....O"
                  "O....O.O....O" "O....O.O....O" "............."
                  "..OOO...OOO..";
        width = height = 13;
        break;
    case LIFE_RANDOM:
        if (!random_seed) random_seed = 0xA341316Cu;
        for (int y = 0; y < LIFE_ROWS; ++y)
            for (int x = 0; x < LIFE_COLS; ++x)
                life_set(game, x, y, random_next(&random_seed) % 100 < 28);
        return;
    case LIFE_EMPTY: return;
    case LIFE_SEED_COUNT: assert(false); return;
    }
    for (int y = 0; y < height; ++y)
        for (int x = 0; x < width; ++x)
            if (pattern[y * width + x] == 'O')
                life_set(game, (LIFE_COLS - width) / 2 + x,
                         (LIFE_ROWS - height) / 2 + y, true);
}

void life_step(life_t *game) {
    assert(game);
    uint8_t next[LIFE_ROWS][LIFE_COLS];
    unsigned births = 0, deaths = 0, population = 0;
    for (int y = 0; y < LIFE_ROWS; ++y) {
        for (int x = 0; x < LIFE_COLS; ++x) {
            unsigned neighbours = 0;
            for (int dy = -1; dy <= 1; ++dy) {
                for (int dx = -1; dx <= 1; ++dx) {
                    if (!dx && !dy) continue;
                    int nx = x + dx, ny = y + dy;
                    if (game->wrap) {
                        nx = (nx + LIFE_COLS) % LIFE_COLS;
                        ny = (ny + LIFE_ROWS) % LIFE_ROWS;
                    }
                    if (nx >= 0 && nx < LIFE_COLS && ny >= 0 && ny < LIFE_ROWS)
                        neighbours += game->cells[ny][nx] != 0;
                }
            }
            uint8_t age = game->cells[y][x];
            bool alive = neighbours == 3 || (age && neighbours == 2);
            next[y][x] = alive ? (age < 15 ? age + 1 : 15) : 0;
            births += alive && !age;
            deaths += !alive && age;
            population += alive;
        }
    }
    memcpy(game->cells, next, sizeof(next));
    ++game->generation;
    game->births = births;
    game->deaths = deaths;
    game->population = population;
    game->stable = !births && !deaths;
}

unsigned life_app_fps(const life_app_t *app) {
    assert(app && app->speed < 4);
    const unsigned fps[] = {1, 2, 5, 8};
    return fps[app->speed];
}

void life_app_init(life_app_t *app, uint32_t seed, uint64_t now_ms) {
    assert(app);
    memset(app, 0, sizeof(*app));
    app->random_seed = seed;
    app->game.wrap = true;
    app->speed = 2;
    app->cursor_x = LIFE_COLS / 2;
    app->cursor_y = LIFE_ROWS / 2;
    app->last_input_ms = app->last_step_ms = now_ms;
    app->running = true;
    app->seed = LIFE_R_PENTOMINO;
    life_seed(&app->game, app->seed, seed);
    app->seed_template = app->game;
}

life_idle_t life_app_idle(const life_app_t *app, uint64_t now_ms) {
    assert(app && now_ms >= app->last_input_ms);
    if ((app->page == LIFE_LINK || app->page == LIFE_REMOTE) && app->audio_requested) return LIFE_BRIGHT;
    if (app->page == LIFE_REMOTE && app->phone_connected) return LIFE_BRIGHT;
    uint64_t idle = now_ms - app->last_input_ms;
    if (app->running) return LIFE_BRIGHT;
    if (idle >= 300000) return LIFE_SLEEP;
    if (idle >= 90000) return LIFE_BLANK;
    return idle >= 30000 ? LIFE_DIM : LIFE_BRIGHT;
}

static void load_seed(life_app_t *app, life_seed_t seed) {
    app->seed = seed;
    life_seed(&app->game, seed, ++app->random_seed);
    app->seed_template = app->game;
    app->custom_seed = false;
    app->running = false;
    app->page = LIFE_WATCH;
}

bool life_app_input(life_app_t *app, life_input_t input, uint64_t now_ms) {
    assert(app && input >= LIFE_UP && input <= LIFE_OK_LONG);
    bool wake = life_app_idle(app, now_ms) >= LIFE_BLANK;
    app->last_input_ms = app->last_step_ms = now_ms;
    if (wake) return true;
    if (app->page == LIFE_REMOTE) {
        if (input == LIFE_OK) {
            app->remote_status = LIFE_REMOTE_APPLIED;
            app->seed_template = app->game;
            app->custom_seed = true;
            app->audio_requested = false;
            app->page = LIFE_WATCH;
        } else if (input == LIFE_OK_LONG) {
            app->game = app->saved_game;
            app->running = app->saved_running;
            app->speed = app->saved_speed;
            app->page = app->saved_page;
            app->remote_status = LIFE_REMOTE_CANCELLED;
        }
        return false;
    }
    if (app->page == LIFE_EDIT) {
        switch (input) {
        case LIFE_UP: app->cursor_x = (app->cursor_x + LIFE_COLS - 1) % LIFE_COLS; break;
        case LIFE_DOWN: app->cursor_x = (app->cursor_x + 1) % LIFE_COLS; break;
        case LIFE_UP_LONG: app->cursor_y = (app->cursor_y + LIFE_ROWS - 1) % LIFE_ROWS; break;
        case LIFE_DOWN_LONG: app->cursor_y = (app->cursor_y + 1) % LIFE_ROWS; break;
        case LIFE_OK:
            life_set(&app->game, app->cursor_x, app->cursor_y,
                     !app->game.cells[app->cursor_y][app->cursor_x]);
            app->game.generation = 0;
            app->game.births = app->game.deaths = 0;
            app->seed_template = app->game;
            app->custom_seed = true;
            break;
        case LIFE_OK_LONG: app->page = LIFE_WATCH; break;
        }
        return false;
    }
    if (input == LIFE_OK_LONG) {
        app->audio_requested = false;
        app->running = false;
        if (app->page == LIFE_WATCH) { app->page = LIFE_TOOLS; app->selection = 0; }
        else if (app->page == LIFE_TOOLS) app->page = LIFE_WATCH;
        else { app->page = LIFE_TOOLS; app->selection = 0; }
        return false;
    }
    if (input == LIFE_UP_LONG || input == LIFE_DOWN_LONG) return false;
    if (app->page == LIFE_WATCH) {
        if (input == LIFE_UP) app->speed = (app->speed + 1) % 4;
        if (input == LIFE_DOWN) { app->running = false; life_step(&app->game); }
        if (input == LIFE_OK && app->game.population) app->running = !app->running;
        return false;
    }
    if (app->page == LIFE_LINK) {
        if (input == LIFE_OK) app->audio_requested = !app->audio_requested;
        return false;
    }
    if (app->page == LIFE_HELP) {
        if (input == LIFE_OK) app->page = LIFE_TOOLS;
        return false;
    }
    if (input == LIFE_UP && app->selection) --app->selection;
    unsigned maximum = app->page == LIFE_LIBRARY ? LIFE_SEED_COUNT - 1 : LIFE_TOOL_COUNT - 1;
    if (input == LIFE_DOWN && app->selection < maximum) ++app->selection;
    if (input != LIFE_OK) return false;
    if (app->page == LIFE_LIBRARY) {
        load_seed(app, (life_seed_t)app->selection);
        return false;
    }
    switch (app->selection) {
    case 0: app->page = LIFE_LIBRARY; app->selection = app->seed; break;
    case 1:
        if (app->custom_seed) {
            bool wrap = app->game.wrap;
            app->game = app->seed_template;
            app->game.wrap = wrap;
            app->page = LIFE_WATCH;
        }
        else load_seed(app, app->seed);
        break;
    case 2: app->page = LIFE_EDIT; break;
    case 3: app->game.wrap = !app->game.wrap; app->game.stable = false; break;
    case 4: app->page = LIFE_LINK; app->audio_requested = true; break;
    case 5: app->page = LIFE_HELP; break;
    case 6: app->page = LIFE_WATCH; break;
    }
    return false;
}

life_remote_result_t life_app_receive(life_app_t *app, const life_remote_seed_t *seed, uint64_t now_ms) {
    assert(app && seed && seed->id);
    if (app->remote_id == seed->id) {
        return app->remote_crc == seed->crc && app->remote_wrap == seed->wrap &&
               app->remote_interval == seed->interval_ms &&
               !memcmp(app->remote_bits, seed->bits, LIFE_BITS_SIZE)
               ? LIFE_REMOTE_REPEAT : LIFE_REMOTE_CONFLICT;
    }
    if (app->page == LIFE_REMOTE) return LIFE_REMOTE_BUSY;
    app->saved_game = app->game;
    app->saved_page = app->page;
    app->saved_speed = app->speed;
    app->saved_running = app->running;
    life_clear(&app->game, seed->wrap);
    for (int y = 0; y < LIFE_ROWS; ++y)
        for (int x = 0; x < LIFE_COLS; ++x) {
            unsigned bit = y * LIFE_COLS + x;
            life_set(&app->game, x, y, (seed->bits[bit / 8] >> (bit % 8)) & 1);
        }
    const unsigned intervals[] = {1000, 500, 200, 125};
    unsigned speed;
    for (speed = 0; speed < 4; ++speed) if (seed->interval_ms == intervals[speed]) break;
    assert(speed < 4);
    app->speed = speed;
    app->remote_id = seed->id;
    app->remote_crc = seed->crc;
    app->remote_interval = seed->interval_ms;
    app->remote_wrap = seed->wrap;
    memcpy(app->remote_bits, seed->bits, LIFE_BITS_SIZE);
    app->remote_status = LIFE_REMOTE_PREVIEW;
    app->running = false;
    app->page = LIFE_REMOTE;
    app->last_input_ms = app->last_step_ms = now_ms;
    return LIFE_REMOTE_NEW;
}

bool life_app_tick(life_app_t *app, uint64_t now_ms) {
    assert(app && now_ms >= app->last_step_ms);
    uint64_t period = 1000 / life_app_fps(app);
    uint64_t elapsed = now_ms - app->last_step_ms;
    if (!app->running || elapsed < period) return false;
    /* Retain phase through normal polling/render jitter. After a longer stall,
       advance once and restart the schedule instead of blocking input to catch up. */
    app->last_step_ms = elapsed < 2 * period ? app->last_step_ms + period : now_ms;
    life_step(&app->game);
    if (!app->game.population || app->game.stable) {
        app->running = false;
        app->last_input_ms = now_ms;
    }
    return true;
}

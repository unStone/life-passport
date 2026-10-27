#include "life.h"
#include "life_keys.h"
#include "life_wire.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static void test_rules(void) {
    life_t g;
    life_clear(&g, false);
    life_set(&g, 5, 5, true);
    life_step(&g);
    assert(g.population == 0 && g.deaths == 1 && g.generation == 1);
    life_set(&g, 5, 5, true);
    life_set(&g, 6, 5, true);
    life_set(&g, 5, 6, true);
    life_step(&g);
    assert(g.population == 4 && g.births == 1);
    life_step(&g);
    assert(g.stable && g.population == 4);
    assert(!life_set(&g, -1, 0, true));
    assert(!life_set(&g, LIFE_COLS, 0, true));
}

static void test_blinker(void) {
    life_t g;
    life_clear(&g, false);
    for (int x = 8; x <= 10; ++x) life_set(&g, x, 8, true);
    life_step(&g);
    assert(g.population == 3 && !g.stable);
    assert(g.cells[7][9] && g.cells[8][9] && g.cells[9][9]);
    assert(!g.cells[8][8] && !g.cells[8][10]);
    life_step(&g);
    assert(g.cells[8][8] && g.cells[8][9] && g.cells[8][10]);
}

static void test_all_neighbourhoods(void) {
    const int ring[8][2] = { {-1,-1}, {0,-1}, {1,-1}, {-1,0}, {1,0}, {-1,1}, {0,1}, {1,1} };
    for (unsigned mask = 0; mask < 256; ++mask) {
        for (unsigned alive = 0; alive < 2; ++alive) {
            life_t g;
            life_clear(&g, false);
            unsigned neighbours = 0;
            for (unsigned i = 0; i < 8; ++i) {
                bool cell = (mask & (1u << i)) != 0;
                neighbours += cell;
                life_set(&g, 8 + ring[i][0], 8 + ring[i][1], cell);
            }
            life_set(&g, 8, 8, alive);
            life_step(&g);
            assert(!!g.cells[8][8] == (neighbours == 3 || (alive && neighbours == 2)));
        }
    }
}

static void test_edges_and_patterns(void) {
    life_t g, finite;
    life_clear(&g, true);
    life_set(&g, LIFE_COLS - 1, 0, true);
    life_set(&g, 0, 0, true);
    life_set(&g, 1, 0, true);
    finite = g;
    finite.wrap = false;
    life_step(&g);
    life_step(&finite);
    assert(g.cells[LIFE_ROWS - 1][0]);
    assert(!finite.cells[LIFE_ROWS - 1][0]);
    life_seed(&g, LIFE_GLIDER, 1);
    life_t before = g;
    for (int i = 0; i < 4; ++i) life_step(&g);
    assert(g.population == 5);
    for (int y = 0; y < LIFE_ROWS - 1; ++y)
        for (int x = 0; x < LIFE_COLS - 1; ++x)
            assert(!!g.cells[y + 1][x + 1] == !!before.cells[y][x]);
    life_seed(&g, LIFE_PULSAR, 1);
    before = g;
    for (int i = 0; i < 3; ++i) life_step(&g);
    for (int y = 0; y < LIFE_ROWS; ++y)
        for (int x = 0; x < LIFE_COLS; ++x)
            assert(!!g.cells[y][x] == !!before.cells[y][x]);
    life_seed(&g, LIFE_SPACESHIP, 1);
    before = g;
    for (int i = 0; i < 4; ++i) life_step(&g);
    assert(g.population == 9);
    for (int y = 0; y < LIFE_ROWS; ++y)
        for (int x = 2; x < LIFE_COLS; ++x)
            assert(!!g.cells[y][x - 2] == !!before.cells[y][x]);
    life_seed(&g, LIFE_RANDOM, 123);
    life_seed(&finite, LIFE_RANDOM, 123);
    assert(memcmp(g.cells, finite.cells, sizeof g.cells) == 0);
    assert(g.population > 200 && g.population < 500);
}

static void test_controls(void) {
    life_app_t app;
    life_app_init(&app, 7, 0);
    assert(app.running && app.page == LIFE_WATCH);
    assert(!life_app_tick(&app, 199));
    assert(life_app_tick(&app, 200) && app.game.generation == 1);
    life_app_input(&app, LIFE_DOWN, 260);
    assert(!app.running && app.game.generation == 2);
    assert(!life_app_tick(&app, 1000));
    life_app_input(&app, LIFE_OK_LONG, 1001);
    assert(app.page == LIFE_TOOLS && !app.running);
    life_app_input(&app, LIFE_OK, 1002);
    assert(app.page == LIFE_LIBRARY);
    life_app_input(&app, LIFE_DOWN, 1003);
    life_app_input(&app, LIFE_OK_LONG, 1004);
    assert(app.page == LIFE_TOOLS && app.seed == LIFE_R_PENTOMINO);
    app.selection = 2;
    life_app_input(&app, LIFE_OK, 1005);
    assert(app.page == LIFE_EDIT);
    int x = app.cursor_x, y = app.cursor_y;
    bool was_alive = app.game.cells[y][x] != 0;
    life_app_input(&app, LIFE_OK, 1006);
    assert(!!app.game.cells[y][x] != was_alive);
    life_app_input(&app, LIFE_UP_LONG, 1007);
    assert(app.cursor_y == (y + LIFE_ROWS - 1) % LIFE_ROWS);
    life_app_input(&app, LIFE_OK_LONG, 1008);
    assert(app.page == LIFE_WATCH && !app.running);
    life_app_input(&app, LIFE_OK, 1010);
    assert(app.running && !life_app_tick(&app, 1011));
    life_app_input(&app, LIFE_OK_LONG, 1012);
    app.selection = 3;
    bool wrap = app.game.wrap;
    life_app_input(&app, LIFE_OK, 1013);
    assert(app.game.wrap != wrap);
    assert(life_app_idle(&app, 31014) == LIFE_DIM);
    assert(life_app_idle(&app, 91014) == LIFE_BLANK);
    assert(life_app_idle(&app, 301014) == LIFE_SLEEP);
    assert(life_app_input(&app, LIFE_DOWN, 301015));
    assert(app.page == LIFE_TOOLS && app.selection == 3);
}

static void test_remote_visibility(void) {
    life_app_t app;
    life_app_init(&app, 1, 0);
    life_remote_seed_t seed = { .id = 1, .interval_ms = 200, .wrap = true };
    assert(life_app_receive(&app, &seed, 100) == LIFE_REMOTE_NEW);
    app.phone_connected = true;
    assert(life_app_idle(&app, 30100) == LIFE_BRIGHT);
    assert(life_app_idle(&app, 90100) == LIFE_BRIGHT);
    assert(life_app_idle(&app, 600100) == LIFE_BRIGHT);
    assert(!life_app_input(&app, LIFE_OK, 600101));
    assert(app.remote_status == LIFE_REMOTE_APPLIED);
    assert(life_app_idle(&app, 630102) == LIFE_DIM);
    seed.id = 2;
    assert(life_app_receive(&app, &seed, 630103) == LIFE_REMOTE_NEW);
    app.phone_connected = false;
    assert(life_app_idle(&app, 660103) == LIFE_DIM);
    assert(life_app_idle(&app, 720103) == LIFE_BLANK);
    assert(life_app_idle(&app, 930103) == LIFE_SLEEP);
}

static void test_running_power_and_pause_grace(void) {
    life_app_t app;
    life_app_init(&app, 1, 0);
    assert(life_app_idle(&app, 30000) == LIFE_BRIGHT);
    assert(life_app_idle(&app, 600000) == LIFE_BRIGHT);
    life_app_input(&app, LIFE_OK, 600001);
    assert(!app.running && life_app_idle(&app, 600002) == LIFE_BRIGHT);
    assert(life_app_idle(&app, 630001) == LIFE_DIM);
    assert(life_app_idle(&app, 690001) == LIFE_BLANK);
    life_app_init(&app, 1, 0);
    life_clear(&app.game, true);
    life_set(&app.game, 15, 15, true);
    assert(life_app_tick(&app, 600000));
    assert(!app.running && !app.game.population);
    assert(life_app_idle(&app, 600001) == LIFE_BRIGHT);
    assert(life_app_idle(&app, 630000) == LIFE_DIM);
    assert(life_app_idle(&app, 690000) == LIFE_BLANK);
}

static void test_opening_pattern(void) {
    life_app_t app;
    life_app_init(&app, 1, 0);
    assert(app.game.population == 5);
    assert(app.game.cells[14][17] && app.game.cells[14][18]);
    assert(app.game.cells[15][16] && app.game.cells[15][17]);
    assert(app.game.cells[16][17]);
    unsigned peak = app.game.population;
    for (unsigned i = 1; i <= 100; ++i) {
        assert(life_app_tick(&app, i * 200));
        if (app.game.population > peak) peak = app.game.population;
    }
    assert(peak >= 50);
}

int main(void) {
    test_running_power_and_pause_grace();
    test_opening_pattern();
    test_remote_visibility();
    life_app_t cadence;
    life_app_init(&cadence, 1, 0);
    unsigned frames = 0;
    for (uint64_t time = 0; time < 30000;) {
        time += 20;
        if (life_app_tick(&cadence, time)) { ++frames; time += 33; }
    }
    assert(frames >= 149 && frames <= 150);
    life_app_t remote_app;
    life_app_init(&remote_app, 1, 0);
    life_t previous = remote_app.game;
    life_remote_seed_t remote = { .id = 1, .crc = 1879704988, .interval_ms = 200, .wrap = false };
    assert(life_app_receive(&remote_app, &remote, 100) == LIFE_REMOTE_NEW);
    assert(remote_app.page == LIFE_REMOTE && !remote_app.running && !remote_app.game.population);
    assert(life_app_receive(&remote_app, &remote, 101) == LIFE_REMOTE_REPEAT);
    remote.id = 2;
    assert(life_app_receive(&remote_app, &remote, 102) == LIFE_REMOTE_BUSY);
    life_app_input(&remote_app, LIFE_OK_LONG, 103);
    assert(remote_app.remote_status == LIFE_REMOTE_CANCELLED && remote_app.running);
    assert(memcmp(remote_app.game.cells, previous.cells, sizeof previous.cells) == 0);
    assert(life_app_receive(&remote_app, &remote, 104) == LIFE_REMOTE_NEW);
    life_app_input(&remote_app, LIFE_OK, 105);
    assert(remote_app.remote_status == LIFE_REMOTE_APPLIED && !remote_app.running && remote_app.page == LIFE_WATCH);
    life_app_input(&remote_app, LIFE_OK_LONG, 106);
    remote_app.selection = 3;
    life_app_input(&remote_app, LIFE_OK, 107);
    remote_app.selection = 1;
    life_app_input(&remote_app, LIFE_OK, 108);
    assert(remote_app.game.wrap);
    assert(life_app_receive(&remote_app, &remote, 109) == LIFE_REMOTE_REPEAT);
    remote.wrap = true;
    assert(life_app_receive(&remote_app, &remote, 110) == LIFE_REMOTE_CONFLICT);
    life_keys_t keys = {0};
    assert(life_keys_feed(&keys, 2, LIFE_KEY_RELEASE) == -1);
    assert(life_keys_feed(&keys, 2, LIFE_KEY_PRESS) == -1);
    assert(life_keys_feed(&keys, 2, LIFE_KEY_LONG) == LIFE_OK_LONG);
    assert(life_keys_feed(&keys, 2, LIFE_KEY_LONG) == -1);
    assert(life_keys_feed(&keys, 2, LIFE_KEY_RELEASE) == -1);
    for (int i = 0; i < 2; ++i) {
        assert(life_keys_feed(&keys, 0, LIFE_KEY_PRESS) == -1);
        assert(life_keys_feed(&keys, 0, LIFE_KEY_RELEASE) == LIFE_UP);
    }
    test_rules();
    test_all_neighbourhoods();
    test_blinker();
    test_edges_and_patterns();
    test_controls();
    puts("Life rules, patterns, timing, navigation and idle recovery: PASS");
}

#include "life.h"
#include <stdio.h>

static void emit(const char *name, const life_t *game) {
    printf("%s,", name);
    for (unsigned byte = 0; byte < LIFE_BITS_SIZE; ++byte) {
        unsigned value = 0;
        for (unsigned bit = 0; bit < 8; ++bit) {
            unsigned cell = byte * 8 + bit;
            if (game->cells[cell / LIFE_COLS][cell % LIFE_COLS]) value |= 1u << bit;
        }
        printf("%02x", value);
    }
    putchar('\n');
}

int main(void) {
    puts("name,packed_hex");
    const struct { const char *name; life_seed_t seed; } patterns[] = {
        {"empty", LIFE_EMPTY}, {"glider", LIFE_GLIDER}, {"pulsar", LIFE_PULSAR},
        {"blinker", LIFE_BLINKER}, {"spaceship", LIFE_SPACESHIP},
        {"random28_firmware", LIFE_RANDOM}, {"r0", LIFE_R_PENTOMINO},
    };
    life_t game;
    life_clear(&game, true);
    for (unsigned i = 0; i < sizeof(patterns) / sizeof(patterns[0]); ++i) {
        life_seed(&game, patterns[i].seed, 42);
        emit(patterns[i].name, &game);
    }
    life_seed(&game, LIFE_R_PENTOMINO, 42);
    for (unsigned step = 1; step <= 300; ++step) {
        life_step(&game);
        if (step == 10 || step == 30 || step == 50 || step == 100 || step == 300) {
            char name[32];
            snprintf(name, sizeof(name), "r%u", step);
            emit(name, &game);
        }
    }
    for (unsigned y = 0; y < LIFE_ROWS; ++y)
        for (unsigned x = 0; x < LIFE_COLS; ++x) life_set(&game, x, y, true);
    emit("full", &game);
    return 0;
}

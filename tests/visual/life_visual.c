#include "life_ui.h"
#include "life_wire.h"
#include "bsp_display_rounding.h"
#include "../../assets/fonts/life_font_codepoints.h"
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define WIDTH 240
#define HEIGHT 320
static uint16_t s_frame[HEIGHT][WIDTH];
static uint16_t s_buffer[WIDTH * 40];
static const char *s_output;
static unsigned s_frame_number;
static unsigned s_invalidations;
static unsigned s_pixel_api_calls;

void __cyg_profile_func_enter(void *function, void *caller) {
    (void)caller;
    if (function == (void *)lv_canvas_set_px) ++s_pixel_api_calls;
}

void __cyg_profile_func_exit(void *function, void *caller) {
    (void)function;
    (void)caller;
}

static void count_invalidation(lv_event_t *event) {
    (void)event;
    ++s_invalidations;
}

static void flush(lv_display_t *display, const lv_area_t *area, uint8_t *pixels) {
    const lv_draw_buf_t *buffer = lv_display_get_buf_active(display);
    for (int y = area->y1; y <= area->y2; ++y) {
        const uint16_t *source = (const uint16_t *)(pixels + (y - area->y1) * buffer->header.stride);
        int32_t left, right;
        bool visible = bsp_display_rounded_row_span(y, WIDTH, HEIGHT, 30, &left, &right);
        for (int x = area->x1; x <= area->x2; ++x) {
            s_frame[y][x] = visible && x >= left && x <= right ? *source : 0;
            ++source;
        }
    }
    lv_display_flush_ready(display);
}

static void capture(life_app_t *app, const char *name) {
    life_ui_refresh(app, 87);
    lv_obj_update_layout(lv_screen_active());
    lv_refr_now(NULL);
    if (name) {
        static uint16_t partial[HEIGHT][WIDTH];
        memcpy(partial, s_frame, sizeof(partial));
        lv_obj_invalidate(lv_screen_active());
        lv_refr_now(NULL);
        assert(memcmp(partial, s_frame, sizeof(partial)) == 0);
        for (uint32_t i = 0; i < lv_obj_get_child_count(lv_screen_active()); ++i) {
            lv_obj_t *child = lv_obj_get_child(lv_screen_active(), i);
            if (lv_obj_check_type(child, &lv_label_class) && !lv_obj_has_flag(child, LV_OBJ_FLAG_HIDDEN)) {
                lv_area_t box;
                lv_obj_get_coords(child, &box);
                lv_point_t size;
                lv_text_get_size(&size, lv_label_get_text(child),
                    lv_obj_get_style_text_font(child, 0),
                    lv_obj_get_style_text_letter_space(child, 0),
                    lv_obj_get_style_text_line_space(child, 0), LV_COORD_MAX, LV_TEXT_FLAG_NONE);
                assert(size.x <= lv_obj_get_content_width(child));
                assert(box.y1 >= 0 && box.y2 < HEIGHT);
            }
        }
    }
    char path[1024];
    if (name) snprintf(path, sizeof(path), "%s/%s.ppm", s_output, name);
    else snprintf(path, sizeof(path), "%s/frame-%03u.ppm", s_output, s_frame_number++);
    FILE *file = fopen(path, "wb");
    assert(file);
    fprintf(file, "P6\n%d %d\n255\n", WIDTH, HEIGHT);
    for (int y = 0; y < HEIGHT; ++y) {
        for (int x = 0; x < WIDTH; ++x) {
            uint16_t value = s_frame[y][x];
            uint8_t rgb[] = { (uint8_t)(((value >> 11) & 31) * 255 / 31),
                              (uint8_t)(((value >> 5) & 63) * 255 / 63),
                              (uint8_t)((value & 31) * 255 / 31) };
            assert(fwrite(rgb, 1, 3, file) == 3);
        }
    }
    assert(fclose(file) == 0);
}

static void action(life_app_t *app, life_input_t input, uint64_t *time) {
    *time += 200;
    life_app_input(app, input, *time);
    capture(app, NULL);
    for (unsigned i = 0; i < 3; ++i) {
        *time += 200;
        life_app_tick(app, *time);
        capture(app, NULL);
    }
}

int main(int argc, char **argv) {
    assert(argc == 2);
    s_output = argv[1];
    lv_init();
    lv_display_t *display = lv_display_create(WIDTH, HEIGHT);
    assert(display);
    lv_display_set_color_format(display, LV_COLOR_FORMAT_RGB565);
    lv_display_set_buffers(display, s_buffer, NULL, sizeof(s_buffer), LV_DISPLAY_RENDER_MODE_PARTIAL);
    lv_display_set_flush_cb(display, flush);
    lv_display_add_event_cb(display, count_invalidation, LV_EVENT_INVALIDATE_AREA, NULL);
    assert(life_ui_font_check());
    life_app_t app;
    life_app_init(&app, 12345, 0);
    life_ui_create(&app, 87);
    unsigned before = s_invalidations;
    s_pixel_api_calls = 0;
    life_ui_refresh(&app, 87);
    fprintf(stderr, "Watch refresh: %u invalidations, %u invalidating pixel calls\n",
            s_invalidations - before, s_pixel_api_calls);
    assert(s_invalidations - before < 100);
    assert(s_pixel_api_calls < 100);
    capture(&app, "watch");
    assert(s_frame[72][20] != 0 && s_frame[72][20] != s_frame[71][20]);
    uint64_t time = 0;
    for (int frame = 0; frame < 100; ++frame) {
        time += 200;
        life_app_tick(&app, time);
        capture(&app, NULL);
    }
    capture(&app, "opening-growth");
    action(&app, LIFE_OK_LONG, &time);
    capture(&app, "tools");
    action(&app, LIFE_OK, &time);
    capture(&app, "phone");
    life_audio_view_t diagnostic = { .state = LIFE_CAPTURE_LISTENING, .dbfs = -32.5f,
        .frequency_hz = 984, .valid = 10, .rejected = 2, .duplicates = 1, .max_decode_us = 14500, .seq = 42,
        .payload = "FFFFFFFFFFFFFF" };
    life_ui_audio_update(&diagnostic);
    capture(&app, "audio");
    bool metric_found = false;
    for (unsigned i = 0; i < lv_obj_get_child_count(lv_screen_active()); ++i) {
        lv_obj_t *child = lv_obj_get_child(lv_screen_active(), i);
        if (lv_obj_check_type(child, &lv_label_class) && strstr(lv_label_get_text(child), "信号 -32.5dBFS")) metric_found = true;
    }
    assert(metric_found);
    action(&app, LIFE_OK_LONG, &time);
    for (int i = 0; i < 3; ++i) action(&app, LIFE_DOWN, &time);
    action(&app, LIFE_OK, &time);
    assert(app.page == LIFE_INFO);
    capture(&app, "info");
    action(&app, LIFE_OK, &time);
    assert(app.page == LIFE_RULES);
    capture(&app, "rules");
    action(&app, LIFE_OK, &time);
    action(&app, LIFE_DOWN, &time);
    action(&app, LIFE_OK, &time);
    assert(app.page == LIFE_ABOUT);
    capture(&app, "about");
    app.page = LIFE_WATCH;
    app.running = false;
    life_seed(&app.game, LIFE_PULSAR, 1);
    capture(&app, "pulsar");
    app.page = LIFE_WATCH;
    app.running = false;
    life_clear(&app.game, true);
    capture(&app, "empty");
    life_set(&app.game, 17, 15, true);
    life_set(&app.game, 18, 15, true);
    life_set(&app.game, 17, 16, true);
    life_set(&app.game, 18, 16, true);
    life_step(&app.game);
    capture(&app, "stable");
    life_remote_seed_t received = { .id = 1, .crc = 63387465, .interval_ms = 200, .wrap = true };
    const unsigned corners[] = { 0, LIFE_COLS - 1, (LIFE_ROWS - 1) * LIFE_COLS, LIFE_ROWS * LIFE_COLS - 1 };
    for (unsigned i = 0; i < 4; ++i)
        received.bits[corners[i] / 8] |= 1u << (corners[i] % 8);
    assert(life_app_receive(&app, &received, time) == LIFE_REMOTE_NEW);
    assert(app.page == LIFE_REMOTE && app.game.population == 4 && !app.running);
    capture(&app, "remote");
    app.game.wrap = false;
    capture(&app, "finite");
    /* Revisit all screens under the real allocator, catching retained-object leaks. */
    for (int i = 0; i < 300; ++i) {
        app.page = (life_page_t)(i % 7);
        app.selection = app.page == LIFE_TOOLS ? i % LIFE_TOOL_COUNT : app.page == LIFE_INFO ? i % LIFE_INFO_COUNT : 0;
        life_ui_refresh(&app, i % 2 ? 100 : -1);
        lv_refr_now(NULL);
    }
    lv_mem_monitor_t memory;
    lv_mem_monitor(&memory);
    assert(memory.free_size > 4000);
    printf("Native LVGL %d.%d.%d: all %zu glyphs, pages and 300 transitions PASS; pool used=%zu, max=%zu, free=%zu\n",
           LVGL_VERSION_MAJOR, LVGL_VERSION_MINOR, LVGL_VERSION_PATCH,
           sizeof(life_font_codepoints) / sizeof(life_font_codepoints[0]),
           memory.total_size - memory.free_size, memory.max_used, memory.free_size);
    return 0;
}

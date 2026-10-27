#include "life_ui.h"
#include "../assets/fonts/life_font_codepoints.h"
#include <assert.h>
#include <inttypes.h>
#include <stdio.h>

#define BG 0x091D1C
#define INK 0xE5F3D8
#define MUTED 0x9CB8AD
#define ACCENT 0xD9EF85
#define CELL 6
#define BOARD_W (LIFE_COLS * CELL)
#define BOARD_H (LIFE_ROWS * CELL)

LV_FONT_DECLARE(life_font_16);
LV_DRAW_BUF_DEFINE_STATIC(s_pixels, BOARD_W, BOARD_H, LV_COLOR_FORMAT_I4);
static lv_obj_t *s_screen, *s_title, *s_meta, *s_battery;
static lv_obj_t *s_frame, *s_canvas, *s_status, *s_hint, *s_help;
static lv_obj_t *s_rows[6];
static const char *const s_seeds[] = {
    "滑翔机", "脉冲星", "闪烁器", "轻型飞船", "随机宇宙", "空白画布", "R五连块"
};
static const char *const s_tools[] = {
    "种子图鉴", "重新播种", "编辑细胞", "边界", "种子接收", "演化法则", "返回演化"
};
static const char *const s_seed_hints[] = {
    "四代前进一格", "三代循环的星群", "两代交替的节奏",
    "向左航行的生命", "密度28%的新世界", "进入工具编辑细胞", "五点扩散，持续变换"
};
static const char s_rules[] =
    "B3 / S23\n\n"
    "空格+3邻居：新生\n"
    "生命+2/3邻居：存活\n"
    "其他情况：消亡\n\n"
    "环绕：边缘相连\n"
    "有限：边缘之外为空";

static lv_obj_t *label_at(int x, int y, int width, uint32_t color) {
    lv_obj_t *label = lv_label_create(s_screen);
    assert(label);
    lv_obj_set_pos(label, x, y);
    lv_obj_set_width(label, width);
    lv_obj_set_style_text_font(label, &life_font_16, 0);
    lv_obj_set_style_text_color(label, lv_color_hex(color), 0);
    lv_label_set_long_mode(label, LV_LABEL_LONG_CLIP);
    return label;
}

bool life_ui_font_check(void) {
    /* Check the actual font lookup, including an intentionally absent code point. */
    for (unsigned i = 0; i < sizeof(life_font_codepoints) / sizeof(life_font_codepoints[0]); ++i) {
        uint32_t cp = life_font_codepoints[i];
        lv_font_glyph_dsc_t glyph = {0};
        if (!lv_font_get_glyph_dsc(&life_font_16, &glyph, cp, 0) || glyph.is_placeholder) {
            fprintf(stderr, "life_font_16 missing U+%04" PRIX32 "\n", cp);
            return false;
        }
    }
    lv_font_glyph_dsc_t absent = {0};
    return !lv_font_get_glyph_dsc(&life_font_16, &absent, 0x9F98, 0) || absent.is_placeholder;
}

static void pixel(lv_draw_buf_t *buffer, int x, int y, uint8_t color) {
    uint8_t *p = lv_draw_buf_goto_xy(buffer, x, y);
    unsigned shift = (x & 1) ? 0 : 4;
    *p = (*p & ~(15u << shift)) | (color << shift);
}

static void draw_board(const life_app_t *app) {
    /* Every indexed pixel is overwritten below. LVGL 9.5 canvas fill would
       invalidate separately for all 41,472 pixels before this same redraw. */
    lv_draw_buf_t *buffer = lv_canvas_get_draw_buf(s_canvas);
    for (int y = 0; y < LIFE_ROWS; ++y) {
        for (int x = 0; x < LIFE_COLS; ++x) {
            uint8_t age = app->game.cells[y][x];
            bool cursor = app->page == LIFE_EDIT && x == app->cursor_x && y == app->cursor_y;
            for (int py = 0; py < CELL; ++py) {
                for (int px = 0; px < CELL; ++px) {
                    uint8_t color = 0;
                    if (age && px < CELL - 1 && py < CELL - 1) color = age <= 2 ? 2 : 3;
                    else if (!age && px == 2 && py == 2) color = 1;
                    if (cursor && (px == 0 || py == 0 || px == CELL - 1 || py == CELL - 1)) color = 4;
                    pixel(buffer, x * CELL + px, y * CELL + py, color);
                }
            }
        }
    }
    lv_obj_invalidate(s_canvas);
}

void life_ui_create(const life_app_t *app, int battery) {
    assert(app && !s_screen);
    s_screen = lv_obj_create(NULL);
    assert(s_screen);
    lv_obj_remove_flag(s_screen, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_bg_color(s_screen, lv_color_hex(BG), 0);
    lv_obj_set_style_bg_opa(s_screen, LV_OPA_COVER, 0);
    s_title = label_at(20, 16, 160, INK);
    s_battery = label_at(180, 18, 42, MUTED);
    lv_obj_set_style_text_align(s_battery, LV_TEXT_ALIGN_RIGHT, 0);
    s_meta = label_at(18, 44, 212, MUTED);
    s_frame = lv_obj_create(s_screen);
    assert(s_frame);
    lv_obj_remove_style_all(s_frame);
    lv_obj_set_pos(s_frame, 10, 72);
    lv_obj_set_size(s_frame, BOARD_W + 4, BOARD_H + 4);
    lv_obj_set_style_border_width(s_frame, 1, 0);
    lv_obj_set_style_border_opa(s_frame, LV_OPA_COVER, 0);
    lv_obj_remove_flag(s_frame, LV_OBJ_FLAG_SCROLLABLE);
    s_canvas = lv_canvas_create(s_screen);
    assert(s_canvas);
    LV_DRAW_BUF_INIT_STATIC(s_pixels);
    lv_canvas_set_draw_buf(s_canvas, &s_pixels);
    lv_obj_set_pos(s_canvas, 12, 74);
    const uint32_t colors[] = { BG, 0x24403A, ACCENT, 0x62AC90, 0xFFC984 };
    for (unsigned i = 0; i < sizeof(colors) / sizeof(colors[0]); ++i)
        lv_canvas_set_palette(s_canvas, i, lv_color_to_32(lv_color_hex(colors[i]), LV_OPA_COVER));
    for (unsigned i = 0; i < 6; ++i) {
        s_rows[i] = label_at(18, 76 + i * 31, 204, INK);
        lv_obj_set_height(s_rows[i], 28);
        lv_obj_set_style_pad_left(s_rows[i], 9, 0);
        lv_obj_set_style_pad_top(s_rows[i], 4, 0);
        lv_obj_set_style_radius(s_rows[i], 5, 0);
    }
    s_help = label_at(22, 78, 200, INK);
    lv_obj_set_style_text_line_space(s_help, 1, 0);
    s_status = label_at(18, 275, 210, ACCENT);
    s_hint = label_at(22, 298, 200, MUTED);
    life_ui_refresh(app, battery);
    lv_screen_load(s_screen);
}

void life_ui_refresh(const life_app_t *app, int battery) {
    assert(app && s_screen);
    const char *title = "生命游戏";
    if (app->page == LIFE_TOOLS) title = "工具";
    if (app->page == LIFE_LIBRARY) title = "种子图鉴";
    if (app->page == LIFE_EDIT) title = "编辑细胞";
    if (app->page == LIFE_HELP) title = "演化法则";
    if (app->page == LIFE_LINK) title = "种子接收";
    if (app->page == LIFE_REMOTE) title = "收到种子";
    lv_label_set_text(s_title, title);
    if (battery >= 0 && battery <= 100) lv_label_set_text_fmt(s_battery, "%d%%", battery);
    else lv_label_set_text(s_battery, "--%");
    lv_label_set_text_fmt(s_meta, "代%06" PRIu64 " 活%04u %s",
                          app->game.generation % 1000000, app->game.population,
                          app->game.wrap ? "环绕" : "有限");
    bool list = app->page == LIFE_TOOLS || app->page == LIFE_LIBRARY;
    bool text_page = app->page == LIFE_HELP || app->page == LIFE_LINK;
    lv_obj_set_flag(s_frame, LV_OBJ_FLAG_HIDDEN, list || text_page);
    lv_obj_set_style_border_color(s_frame, lv_color_hex(app->game.wrap ? MUTED : ACCENT), 0);
    lv_obj_set_flag(s_canvas, LV_OBJ_FLAG_HIDDEN, list || text_page);
    lv_obj_set_flag(s_help, LV_OBJ_FLAG_HIDDEN, !text_page);
    if (app->page == LIFE_LINK)
        lv_label_set_text_fmt(s_help, "蓝牙接收已开启\nLifePassport\n\n%s\n\n收到后OK应用\n再次OK开始演化\n长按OK取消接收",
                             app->phone_connected ? "发送器已连接" : "等待发送器连接");
    else lv_label_set_text(s_help, s_rules);
    unsigned offset = list && app->selection >= 6 ? app->selection - 5 : 0;
    for (unsigned i = 0; i < 6; ++i) {
        lv_obj_set_flag(s_rows[i], LV_OBJ_FLAG_HIDDEN, !list);
        if (!list) continue;
        unsigned item = i + offset;
        bool selected = app->selection == item;
        const char *name = app->page == LIFE_LIBRARY ? s_seeds[item] : s_tools[item];
        if (app->page == LIFE_TOOLS && item == 3)
            lv_label_set_text_fmt(s_rows[i], "%02u   %s: %s", item + 1, name, app->game.wrap ? "环绕" : "有限");
        else lv_label_set_text_fmt(s_rows[i], "%02u   %s", item + 1, name);
        lv_obj_set_style_bg_color(s_rows[i], lv_color_hex(ACCENT), 0);
        lv_obj_set_style_bg_opa(s_rows[i], selected ? LV_OPA_COVER : LV_OPA_TRANSP, 0);
        lv_obj_set_style_text_color(s_rows[i], lv_color_hex(selected ? BG : INK), 0);
    }
    if (app->page == LIFE_WATCH) {
        const char *state = app->running ? "演化" : !app->game.population ? "消亡" : app->game.stable ? "稳定" : "暂停";
        lv_label_set_text_fmt(s_status, "%s %u代/秒 长按OK工具", state, life_app_fps(app));
        lv_label_set_text(s_hint, app->running ? "上调速 下单步 OK暂停" : "上调速 下单步 OK播放");
        draw_board(app);
    } else if (app->page == LIFE_REMOTE) {
        lv_label_set_text(s_status, "完整接收，请确认图案");
        lv_label_set_text(s_hint, "OK应用 长按取消");
        draw_board(app);
    } else if (app->page == LIFE_EDIT) {
        lv_label_set_text_fmt(s_status, "行%02u 列%02u  OK:细胞", app->cursor_y + 1, app->cursor_x + 1);
        lv_label_set_text(s_hint, "上下一格 长按换行/返回");
        draw_board(app);
    } else if (app->page == LIFE_LIBRARY) {
        lv_label_set_text(s_status, s_seed_hints[app->selection]);
        lv_label_set_text(s_hint, "上下选择 OK:确定 长按返回");
    } else {
        lv_label_set_text(s_status, "长按OK:返回");
        lv_label_set_text(s_hint, text_page ? "OK:返回工具" : "上下选择 OK:确定");
    }
}
